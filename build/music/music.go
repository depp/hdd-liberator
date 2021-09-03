package main

import (
	"bufio"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"
	"strconv"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"

	"moria.us/js13k/build/midi"
	"moria.us/js13k/build/song"
)

var workingDirectory string

func argToFilePath(name string) string {
	if workingDirectory != "" && !filepath.IsAbs(name) {
		return filepath.Join(workingDirectory, name)
	}
	return name
}

func readMIDI(name string) (*midi.File, error) {
	data, err := ioutil.ReadFile(name)
	if err != nil {
		return nil, err
	}
	return midi.Parse(data)
}

func trackName(tr midi.Track) (string, error) {
	ev := tr.Events()
	for {
		ev, err := ev.Next()
		if err != nil {
			if err == io.EOF {
				return "", nil
			}
			return "", err
		}
		if m, err := ev.ParseMeta(); err == nil {
			if m, ok := m.(midi.TrackName); ok {
				return string(m), nil
			}
		}
	}
}

func findTrack(f *midi.File, name string) (midi.Track, error) {
	nn, err := strconv.ParseUint(name, 10, strconv.IntSize-1)
	if err == nil {
		n := int(nn)
		if n >= len(f.Tracks) {
			return nil, fmt.Errorf("no track exists numbered %d", n)
		}
		return f.Tracks[n], nil
	}
	for i, tr := range f.Tracks {
		tname, err := trackName(tr)
		if err != nil {
			logrus.Errorf("error in track %d: %v", i, err)
			continue
		}
		if string(tname) == name {
			return tr, nil
		}
	}
	return nil, fmt.Errorf("no track exists named %q", name)
}

type global struct {
	ticksPerQuarter uint32
	tempo           midi.Tempo
	timeSignature   midi.TimeSignature
	keySignature    midi.KeySignature
}

func getGlobal(f *midi.File) (g global, err error) {
	if f.Head.Format != 1 {
		return g, errors.New("not a format 1 MIDI file")
	}
	ticks := f.Head.TickDivision
	if ticks&0x8000 != 0 {
		return g, errors.New("this MIDI file uses timecode, which is not supported")
	}
	g.ticksPerQuarter = uint32(ticks)
	if len(f.Tracks) == 0 {
		return g, errors.New("no tracks in MIDI file")
	}
	evs := f.Tracks[0].Events()
	for {
		e, err := evs.Next()
		if err != nil {
			if err == io.EOF {
				break
			}
			return g, fmt.Errorf("in global track: %v", err)
		}
		if m, err := e.ParseMeta(); err == nil {
			switch m := m.(type) {
			case midi.Tempo:
				g.tempo = m
			case midi.TimeSignature:
				g.timeSignature = m
			case midi.KeySignature:
				g.keySignature = m
			}
		}
	}
	if g.tempo == 0 {
		return g, errors.New("no tempo")
	}
	if g.timeSignature == (midi.TimeSignature{}) {
		return g, errors.New("no time signature")
	}
	return g, nil
}

func (g *global) ticksPerMeasure() (uint32, error) {
	beat := g.ticksPerQuarter
	if g.timeSignature.DenominatorLog2 < 2 {
		beat <<= 2 - g.timeSignature.DenominatorLog2
	} else {
		shift := int(g.timeSignature.DenominatorLog2) - 2
		if shift >= 32 || beat&^(^uint32(0)<<shift) != 0 {
			return 0, errors.New("ticks per beat is not an integer")
		}
		beat >>= shift
	}
	if g.timeSignature.Numerator == 0 {
		return 0, errors.New("invalid time signature")
	}
	return uint32(g.timeSignature.Numerator) * beat, nil
}

var flagGrid uint32

func (g *global) gridTicks() (uint32, error) {
	grid := flagGrid
	if grid == 0 {
		return 0, errors.New("0 is not a valid grid")
	}
	if grid&3 != 0 {
		return 0, fmt.Errorf("grid is not a multiple of 4: 1/%d", grid)
	}
	qgrid := grid >> 2
	if qgrid >= g.ticksPerQuarter {
		if qgrid%g.ticksPerQuarter != 0 {
			return 0, fmt.Errorf("grid of 1/%d does is not evenly divide a tick, 1/%d", grid, g.ticksPerQuarter*4)
		}
		return 1, nil
	}
	if g.ticksPerQuarter%qgrid != 0 {
		return 0, fmt.Errorf("grid of 1/%d is not an integer number of ticks, 1/%d", grid, g.ticksPerQuarter*4)
	}
	return g.ticksPerQuarter / qgrid, nil
}

var listTracks = cobra.Command{
	Use:  "list-tracks <midi>",
	Args: cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		midiFile := args[0]
		f, err := readMIDI(midiFile)
		if err != nil {
			return err
		}
		for i, tr := range f.Tracks {
			name, err := trackName(tr)
			if err != nil {
				logrus.Errorf("error in track %d: %v", i, err)
				continue
			}
			fmt.Printf("Track %d: %q\n", i, name)
		}
		return nil
	},
}

var dumpTrack = cobra.Command{
	Use:  "dump-track <midi> <track>",
	Args: cobra.ExactArgs(2),
	RunE: func(_ *cobra.Command, args []string) error {
		midiFile := args[0]
		trackName := args[1]
		f, err := readMIDI(midiFile)
		if err != nil {
			return err
		}
		tr, err := findTrack(f, trackName)
		if err != nil {
			return err
		}
		evs := tr.Events()
		for {
			e, err := evs.Next()
			if err != nil {
				if err == io.EOF {
					break
				}
				return err
			}
			if e.IsMeta() {
				m, err := e.ParseMeta()
				if err != nil {
					if err == midi.ErrUnknownMetaEvent {
						fmt.Println(e.String())
						continue
					}
					return err
				}
				fmt.Println(m.String())
			} else {
				fmt.Println(e.String())
			}
		}
		return nil
	},
}

type note struct {
	start uint32
	end   uint32
	value uint8
}

type noteWriter struct {
	time     uint32
	barstart uint32
	barlen   uint32
	hasline  bool
	out      *bufio.Writer
}

func (w *noteWriter) advance(time uint32) {
	for w.time < time {
		bend := w.barstart + w.barlen
		if w.hasline {
			w.out.WriteByte(' ')
		}
		if bend > time {
			fmt.Fprintf(w.out, "r%d", time-w.time)
			w.time = time
			w.hasline = true
			break
		}
		fmt.Fprintf(w.out, "r%d |\n", bend-w.time)
		w.time = bend
		w.hasline = false
		w.barstart += w.barlen
	}
}

func (w *noteWriter) write(n note) {
	w.advance(n.start)
	v := midi.NoteName(n.value) + "."
	for w.time < n.end {
		bend := w.barstart + w.barlen
		if w.hasline {
			w.out.WriteByte(' ')
		}
		w.out.WriteString(v)
		v = "~"
		if bend > n.end {
			w.out.WriteString(strconv.FormatUint(uint64(n.end-w.time), 10))
			w.time = n.end
			w.hasline = true
			break
		}
		w.out.WriteString(strconv.FormatUint(uint64(bend-w.time), 10))
		w.out.WriteString(" |\n")
		w.time = bend
		w.hasline = false
		w.barstart += w.barlen
	}
}

var extractNotes = cobra.Command{
	Use:  "extract-notes <midi> <track>",
	Args: cobra.ExactArgs(2),
	RunE: func(_ *cobra.Command, args []string) error {
		midiFile := args[0]
		trackName := args[1]
		f, err := readMIDI(midiFile)
		if err != nil {
			return err
		}
		g, err := getGlobal(f)
		if err != nil {
			return err
		}
		grid, err := g.gridTicks()
		if err != nil {
			return err
		}
		tr, err := findTrack(f, trackName)
		if err != nil {
			return err
		}
		ns, err := tr.ParseNotes()
		if err != nil {
			return err
		}
		if len(ns) == 0 {
			return errors.New("no notes in track")
		}
		measure, err := g.ticksPerMeasure()
		if err != nil {
			return err
		}
		gmeasure := measure / grid
		logrus.Infoln("Measure size (ticks):", measure)
		logrus.Infoln("Grid size (ticks):", grid)
		nns := make([]note, len(ns))
		for i, n := range ns {
			t0 := (n.Time + grid/2) / grid
			dur := (n.Duration + grid - 1) / grid
			nns[i] = note{
				start: t0,
				end:   t0 + dur,
				value: n.Value,
			}
		}
		for i, n := range nns[:len(nns)-1] {
			lim := nns[i+1].start
			if lim <= n.start {
				return errors.New("reverse sorted notes")
			}
			if lim < n.end {
				nns[i].end = lim
			}
		}
		w := noteWriter{
			barlen: gmeasure,
			out:    bufio.NewWriter(os.Stdout),
		}
		for _, n := range nns {
			w.write(n)
		}
		if w.hasline {
			w.advance(w.barstart + w.barlen)
		}
		return w.out.Flush()
	},
}

var convert = cobra.Command{
	Use:  "convert <song>",
	Args: cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		fname := argToFilePath(args[0])
		data, err := ioutil.ReadFile(fname)
		if err != nil {
			return err
		}
		sn, err := song.Parse(data)
		if err != nil {
			return err
		}
		jdata := json.NewEncoder(os.Stdout)
		jdata.SetIndent("", "  ")
		return jdata.Encode(sn)
	},
}

var flagOutput string

var compile = cobra.Command{
	Use:  "compile <songs.json>",
	Args: cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		ctx := context.Background()
		c, err := song.Compile(ctx, argToFilePath(args[0]))
		if err != nil {
			return err
		}
		cd := c.Data
		logrus.Infoln("Data size:", len(cd))
		if flagOutput == "" {
			data := cd
			const lineBytes = 32
			var ldata [lineBytes * 2]byte
			w := bufio.NewWriter(os.Stdout)
			for len(data) > 0 {
				var line []byte
				if len(data) >= lineBytes {
					line = data[:lineBytes]
					data = data[lineBytes:]
				} else {
					line = data
					data = nil
				}
				lout := ldata[:len(line)*2]
				hex.Encode(lout, line)
				w.Write(lout)
				w.WriteByte('\n')
			}
			return w.Flush()
		}
		return ioutil.WriteFile(argToFilePath(flagOutput), cd, 0666)
	},
}

var root = cobra.Command{
	Use:           "music",
	Short:         "Music is a tool for generating JS13K music from MIDI files.",
	SilenceErrors: true,
	SilenceUsage:  true,
}

func main() {
	root.AddCommand(&listTracks, &dumpTrack, &extractNotes, &convert, &compile)
	f := extractNotes.Flags()
	f.Uint32Var(&flagGrid, "grid", 48, "size of musical grid, default is 1/48 (32nd note triplets)")
	f = compile.Flags()
	f.StringVarP(&flagOutput, "output", "o", "", "output file for compiled songs")
	workingDirectory = os.Getenv("BUILD_WORKING_DIRECTORY")
	if err := root.Execute(); err != nil {
		logrus.Error(err)
		os.Exit(1)
	}
}
