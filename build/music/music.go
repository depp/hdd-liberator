package main

import (
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"
	"strconv"

	"github.com/sirupsen/logrus"
	"github.com/spf13/pflag"

	"moria.us/js13k/build/midi"
)

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

func listTracks(f *midi.File) error {
	for i, tr := range f.Tracks {
		name, err := trackName(tr)
		if err != nil {
			logrus.Errorf("error in track %d: %v", i, err)
			continue
		}
		fmt.Printf("Track %d: %q\n", i, name)
	}
	return nil
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

func dumpTrack(f *midi.File, name string) error {
	tr, err := findTrack(f, name)
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
}

func mainE() error {
	fListTracks := pflag.Bool("list-tracks", false, "list all tracks")
	fDumpEvents := pflag.String("dump-events", "", "dump events for track `track`")
	pflag.Parse()
	args := pflag.Args()
	if len(args) == 0 {
		return errors.New("usage: music <file> [<option>...]")
	}
	wd := os.Getenv("BUILD_WORKING_DIRECTORY")
	arg := args[0]
	fname := arg
	if !filepath.IsAbs(fname) && wd != "" {
		fname = filepath.Join(wd, fname)
	}
	data, err := ioutil.ReadFile(fname)
	if err != nil {
		return err
	}
	f, err := midi.Parse(data)
	if err != nil {
		return err
	}
	if *fListTracks {
		return listTracks(f)
	}
	if *fDumpEvents != "" {
		return dumpTrack(f, *fDumpEvents)
	}
	return nil
}

func main() {
	if err := mainE(); err != nil {
		logrus.Error(err)
		os.Exit(1)
	}
}
