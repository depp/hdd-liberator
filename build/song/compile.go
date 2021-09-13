package song

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"math"
	"path/filepath"

	"moria.us/js13k/build/embed"
)

const maxPolyphony = 4

// Special note values.
const (
	trackEnd  = embed.NumValues - 1
	poly1     = trackEnd - maxPolyphony
	restValue = poly1 - 1
)

const (
	// Initial value, for calculating deltas
	startValue = 60

	// Base length of a tick, in seconds, for encoding tempo. So if the song's
	// tempo is encoded as N, then the duration of a tick is equal to
	// N*baseTickLength seconds.
	baseTickLength = 2e-3
)

type compileError struct {
	songname  string
	tracknum  int
	trackname string
	msg       string
}

func (e *compileError) Error() string {
	return fmt.Sprintf("song %q track %d %q: %s", e.songname, e.tracknum+1, e.trackname, e.msg)
}

func compileErrorf(sn *Song, i int, tr *Track, format string, a ...interface{}) error {
	return &compileError{sn.Info.Name, i, tr.Name, fmt.Sprintf(format, a...)}
}

// A Compiled contains the results of compiling sounds and songs.
type Compiled struct {
	Data       []byte   `json:"data"`
	SoundNames []string `json:"soundNames"`
	SongNames  []string `json:"songNames"`
}

func encodeGain(gainDB float64) (uint8, error) {
	const exponent = 0.94
	x := math.Round(gainDB / (20 * math.Log10(exponent)))
	if x < 0 || embed.NumValues <= x {
		return 0, fmt.Errorf("gain out of range: %f dB", gainDB)
	}
	return uint8(x), nil
}

func encodePan(pan float64) (uint8, error) {
	const (
		zero  = (embed.NumValues - 1) >> 1
		scale = 60
	)
	x := math.Round(pan*scale) + zero
	if x < 0 || embed.NumValues <= x {
		return 0, fmt.Errorf("pan out of range: %f", pan)
	}
	return uint8(x), nil
}

func compile(snd *sounds, songs []*Song) (*Compiled, error) {
	/*
		Data format:
		N = embed.NumValues

		byte: number of programs
		byte: number of songs
		program[]: program data (length = number of programs)
			Each program is a unique sound, stored as bytecode, which
			constructs an audio processing graph.
			byte: program length
			byte[]: program bytecode
		song[]: song data (length = number of songs)
			byte: number of tracks
			byte: tick duration, 1 = 2 ms
			byte[2]: song length in ticks (big endian)
				value = arr[0]*N + arr[1]
			track[]: track metadata
			    byte: instrument, index into program array
				byte: gain
				byte: pan
				byte: constant duration -- if nonzero, all note durations are this value
		byte[]: note values
			Contains all tracks across all songs, in order, concatenated.
			Each track ends with N-1.
			Rests are encoded as N-2.
			Other notes are delta-encoded, per track, modulo N-2. The first value is delta encoded
			relative to the starting point, 60.
		byte[]: duration values
			Contains all tracks across all songs, in order, concatenated.
			Each duration value is measured in ticks.
	*/
	var soundnames, songnames []string
	var songdata, values, durations []uint8
	var soundDats [][]byte
	instrIdx := make(map[string]int)
	for _, sn := range songs {
		songnames = append(songnames, sn.Info.Name)
		// Write track note data, and calculate length of song.
		var slen int
		for _, tr := range sn.Tracks {
			var tlen int
			var last [maxPolyphony]int
			last[0] = startValue
			curPolyphony := 1
			for _, n := range tr.Notes {
				count := 1
				rem := n.Duration
				for rem >= embed.NumValues {
					count++
					durations = append(durations, uint8(embed.NumValues-1))
					rem -= embed.NumValues - 1
				}
				durations = append(durations, uint8(rem))
				if n.IsRest {
					for i := 0; i < count; i++ {
						values = append(values, restValue)
					}
				} else {
					// Figure out the polyphony of this note.
					var cc int = ChordSize
					for i, v := range n.Value {
						if v == 0 {
							cc = i
							break
						}
						if v >= restValue {
							return nil, fmt.Errorf("note value out of range: %d", n.Value)
						}
					}
					if cc == 0 {
						return nil, errors.New("empty chord")
					}
					if cc > maxPolyphony {
						return nil, errors.New("too much polyphony")
					}
					// Emit polyphony change if necessary.
					if curPolyphony != cc {
						values = append(values, uint8(poly1+cc-1))
					}
					var nlast int
					for i, v := range n.Value[:cc] {
						// Relative to previous note in same voice, falls back
						// to previous note in this chord.
						if i < curPolyphony {
							nlast = last[i]
						}
						vi := int(v)
						delta := vi - nlast
						if delta < 0 {
							delta += restValue
						}
						nlast = vi
						last[i] = vi
						values = append(values, uint8(delta))
					}
					curPolyphony = cc
					for i := cc; i < count*cc; i++ {
						values = append(values, 0)
					}
				}
				tlen += int(n.Duration)
			}
			values = append(values, trackEnd)
			if tlen > slen {
				slen = tlen
			}
		}
		slen -= sn.Info.Tail
		if slen > 0xffff {
			return nil, fmt.Errorf("song too long: %d ticks", slen)
		}
		// Write song metadata.
		tdenom := sn.Info.Tempo * float64(sn.Info.Division)
		if tdenom == 0 {
			return nil, errors.New("invalid tempo or division")
		}
		ftick := (240 / baseTickLength) / tdenom
		if !(ftick >= 1) {
			return nil, fmt.Errorf("tick duration too small: %f ms", ftick)
		}
		if !(ftick <= 255) {
			return nil, fmt.Errorf("tick duration too large: %f ms", ftick)
		}
		itick := int(math.RoundToEven(ftick))
		if itick < 1 {
			itick = 1
		} else if itick > 255 {
			itick = 255
		}
		songdata = append(songdata,
			uint8(len(sn.Tracks)),
			uint8(itick),
			uint8(slen/embed.NumValues),
			uint8(slen%embed.NumValues))
		for i, tr := range sn.Tracks {
			if tr.Instrument == "" {
				return nil, compileErrorf(sn, i, tr, "track has no instrument")
			}
			inum, ok := instrIdx[tr.Instrument]
			if !ok {
				idata, ok := snd.Instruments[tr.Instrument]
				if !ok {
					return nil, compileErrorf(sn, i, tr, "instrument does not exist: %q", tr.Instrument)
				}
				inum = len(soundDats)
				soundDats = append(soundDats, idata)
				instrIdx[tr.Instrument] = inum
				soundnames = append(soundnames, tr.Instrument)
			}
			gain, err := encodeGain(sn.Info.GainDB + tr.GainDB)
			if err != nil {
				return nil, compileErrorf(sn, i, tr, "invalid gain")
			}
			pan, err := encodePan(tr.Pan)
			if err != nil {
				return nil, compileErrorf(sn, i, tr, "invalid pan")
			}
			songdata = append(songdata, uint8(inum), gain, pan, uint8(tr.ConstantDuration))
		}
	}
	var data []byte
	data = []byte{byte(len(soundDats)), byte(len(songs))}
	for _, s := range soundDats {
		if len(s) >= embed.NumValues {
			return nil, errors.New("sound is too long")
		}
		data = append(data, uint8(len(s)))
		data = append(data, s...)
	}
	data = append(data, songdata...)
	data = append(data, values...)
	data = append(data, durations...)
	return &Compiled{
		Data:       data,
		SoundNames: soundnames,
		SongNames:  songnames,
	}, nil
}

type songs struct {
	Songs []string `json:"songs"`
}

func Compile(ctx context.Context, filename string) (*Compiled, error) {
	snd, err := compileSounds(ctx, filepath.Join(filepath.Dir(filename), CodeFile))
	if err != nil {
		return nil, err
	}
	data, err := ioutil.ReadFile(filename)
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var spec songs
	if err := dec.Decode(&spec); err != nil {
		return nil, fmt.Errorf("songs %s: %v", filename, err)
	}
	var sns []*Song
	dir := filepath.Dir(filename)
	for _, name := range spec.Songs {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		data, err := ioutil.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		sn, err := Parse(data)
		if err != nil {
			return nil, fmt.Errorf("song %s: %v", name, err)
		}
		sns = append(sns, sn)
	}
	return compile(snd, sns)
}
