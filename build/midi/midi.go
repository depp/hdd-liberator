package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strconv"

	"github.com/sirupsen/logrus"
)

type chunk struct {
	id   [4]byte
	data []byte
}

var (
	errNotMIDI       = errors.New("not a MIDI file")
	errInvalidChunks = errors.New("invalid MIDI file chunks")
)

func splitChunks(data []byte) ([]chunk, error) {
	var r []chunk
	for len(data) > 0 {
		if len(data) < 8 {
			return nil, errInvalidChunks
		}
		var c chunk
		copy(c.id[:], data)
		n := binary.BigEndian.Uint32(data[4:])
		data = data[8:]
		if int(n) > len(data) {
			return nil, errInvalidChunks
		}
		c.data = data[:n]
		data = data[n:]
		r = append(r, c)
	}
	return r, nil
}

type head struct {
	format  uint16
	ntracks uint16
	tickdiv uint16
}

func parseHead(data []byte) (h head, err error) {
	if len(data) < 6 {
		return h, errors.New("MThd too short")
	}
	return head{
		format:  binary.BigEndian.Uint16(data),
		ntracks: binary.BigEndian.Uint16(data[2:]),
		tickdiv: binary.BigEndian.Uint16(data[4:]),
	}, nil
}

type event struct {
	time  uint32
	ctl   uint8
	data  [2]uint8
	vdata []byte
}

func (e event) String() string {
	switch e.ctl >> 4 {
	case noteOff:
		if e.data[1] == 0 {
			return fmt.Sprintf("noteOff ch.%d %d", e.ctl&15, e.data[0])
		}
		return fmt.Sprintf("noteOff ch.%d %d %d", e.ctl&15, e.data[0], e.data[1])
	case noteOn:
		return fmt.Sprintf("noteOn ch.%d %d %d", e.ctl&15, e.data[0], e.data[1])
	case polyTouch:
		return fmt.Sprintf("polyTouch ch.%d %d %d", e.ctl&15, e.data[0], e.data[1])
	case controller:
		return fmt.Sprintf("controller ch.%d %d %d", e.ctl&15, e.data[0], e.data[1])
	case programChange:
		return fmt.Sprintf("programChange ch.%d %d", e.ctl&15, e.data[0])
	case channelTouch:
		return fmt.Sprintf("channelTouch ch.%d %d", e.ctl&15, e.data[0])
	case pitchBend:
		return fmt.Sprintf("pitchBend ch.%d %d", e.ctl&15, uint32(e.data[0])<<7|uint32(e.data[1]))
	default:
		if e.ctl == 0xff {
			return fmt.Sprintf("meta %d %q", e.data[0], e.vdata)
		} else {
			return "<invalid>"
		}
	}
}

type track struct {
	time   uint32
	status byte
	data   []byte
}

const (
	noteOff       = 8
	noteOn        = 9
	polyTouch     = 10
	controller    = 11
	programChange = 12
	channelTouch  = 13
	pitchBend     = 14
)

func (t *track) readVar() (q uint32, ok bool) {
	for {
		if len(t.data) == 0 {
			return 0, false
		}
		c := t.data[0]
		t.data = t.data[1:]
		if q > ^uint32(0)>>7 {
			return 0, false
		}
		q = (q << 7) | (uint32(c) & 0x7f)
		if c&0x80 == 0 {
			return q, true
		}
		// Theoretically allowed, but non-canonical. Probably indicates an error
		// reading.
		if q == 0 {
			return 0, false
		}
	}
}

func (t *track) next() (e event, ok bool) {
	delta, ok := t.readVar()
	if !ok {
		return e, false
	}
	if len(t.data) == 0 {
		return e, false
	}
	if delta > ^e.time {
		return e, false
	}
	e.time = t.time + delta
	t.time = e.time
	ctl := t.data[0]
	if ctl&0x80 == 0 {
		ctl = t.status
		if ctl == 0 {
			return e, false
		}
	} else {
		t.data = t.data[1:]
	}
	var elen int
	switch ctl >> 4 {
	case noteOff:
		elen = 2
	case noteOn:
		elen = 2
	case polyTouch:
		elen = 2
	case controller:
		elen = 2
	case programChange:
		elen = 1
	case channelTouch:
		elen = 1
	case pitchBend:
		elen = 2
	case 15:
		if ctl == 255 {
			if len(t.data) < 1 {
				return
			}
			mt := t.data[0]
			t.data = t.data[1:]
			n, ok := t.readVar()
			if !ok {
				return e, false
			}
			if int(n) > len(t.data) {
				return e, false
			}
			t.status = 0
			vdata := t.data[:n]
			t.data = t.data[n:]
			return event{
				ctl:   255,
				data:  [2]byte{mt, 0},
				vdata: vdata,
			}, true
		}
	default:
		panic("invalid status")
	}
	if len(t.data) < elen {
		return
	}
	var d1, d2 byte
	switch elen {
	case 1:
		d1 = t.data[0]
	case 2:
		d1 = t.data[0]
		d2 = t.data[1]
	default:
		panic("bad length: " + strconv.Itoa(elen))
	}
	t.data = t.data[elen:]
	t.status = ctl
	return event{
		ctl:  ctl,
		data: [2]byte{d1, d2},
	}, true
}

func dumpFile(name string) error {
	data, err := ioutil.ReadFile(name)
	if err != nil {
		return err
	}
	if len(data) < 8 || string(data[0:4]) != "MThd" {
		return errNotMIDI
	}
	cks, err := splitChunks(data)
	if err != nil {
		return err
	}
	h, err := parseHead(cks[0].data)
	if err != nil {
		return err
	}
	fmt.Printf("head: %+v\n", &h)
	for i, ck := range cks[1:] {
		fmt.Println("Track:", i)
		if string(ck.id[:]) != "MTrk" {
			return fmt.Errorf("unknown chunk type: %q", ck.id[:])
		}
		tr := track{data: ck.data}
		for len(tr.data) != 0 {
			e, ok := tr.next()
			if !ok {
				return errors.New("invalid event")
			}
			fmt.Print("  ", e.String(), "\n")
		}
	}
	return nil
}

func mainE() error {
	if len(os.Args) <= 1 {
		return errors.New("usage: midi <file>...")
	}
	wd := os.Getenv("BUILD_WORKING_DIRECTORY")
	fmt.Println("args", os.Args)
	for _, arg := range os.Args[1:] {
		fmt.Println(arg)
		fname := arg
		if !filepath.IsAbs(fname) && wd != "" {
			fname = filepath.Join(wd, fname)
		}
		if err := dumpFile(fname); err != nil {
			logrus.Errorf("file %q: %v", arg, err)
		}
	}
	return nil
}

func main() {
	if err := mainE(); err != nil {
		logrus.Error(err)
		os.Exit(1)
	}
}
