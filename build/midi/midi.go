package midi

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"strconv"
)

// A chunk is a chunk in a MIDI file.
type chunk struct {
	id   [4]byte
	data []byte
}

var (
	errNotMIDI       = errors.New("not a MIDI file")
	errInvalidChunks = errors.New("invalid MIDI file chunks")
)

// splitChunks splits a MIDI file into its constituent chunks.
func splitChunks(data []byte) ([]chunk, error) {
	if len(data) < 8 || string(data[0:4]) != "MThd" {
		return nil, errNotMIDI
	}
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

// A Head contains the header information for a MIDI file.
type Head struct {
	format  uint16
	ntracks uint16
	tickdiv uint16
}

// parseHead parses the MThd chunk in a MIDI file.
func parseHead(data []byte) (h Head, err error) {
	if len(data) < 6 {
		return h, errors.New("MThd too short")
	}
	return Head{
		format:  binary.BigEndian.Uint16(data),
		ntracks: binary.BigEndian.Uint16(data[2:]),
		tickdiv: binary.BigEndian.Uint16(data[4:]),
	}, nil
}

// A Track is an individual track in a MIDI file.
type Track []byte

func (t Track) Events() (es EventStream) {
	return EventStream{data: []byte(t)}
}

// A File is a parsed MIDI file.
type File struct {
	Head   Head
	Tracks []Track
}

// Parse parses a MIDI file.
func Parse(data []byte) (*File, error) {
	cks, err := splitChunks(data)
	if err != nil {
		return nil, err
	}
	h, err := parseHead(cks[0].data)
	if err != nil {
		return nil, err
	}
	tracks := make([]Track, len(cks)-1)
	for i, ck := range cks[1:] {
		if string(ck.id[:]) != string("MTrk") {
			return nil, fmt.Errorf("unknown MIDI chunk type: %q", ck.id[:])
		}
		tracks[i] = Track(ck.data)
	}
	return &File{
		Head:   h,
		Tracks: tracks,
	}, nil
}

// An Event is an event in a MIDI file.
type Event struct {
	Time   uint32
	Status uint8
	Data   [2]uint8
	MData  []byte
}

func (e Event) String() string {
	switch EventType(e.Status) >> 4 {
	case NoteOff:
		if e.Data[1] == 0 {
			return fmt.Sprintf("noteOff ch.%d %d", e.Status&15, e.Data[0])
		}
		return fmt.Sprintf("noteOff ch.%d %d %d", e.Status&15, e.Data[0], e.Data[1])
	case NoteOn:
		return fmt.Sprintf("noteOn ch.%d %d %d", e.Status&15, e.Data[0], e.Data[1])
	case PolyTouch:
		return fmt.Sprintf("polyTouch ch.%d %d %d", e.Status&15, e.Data[0], e.Data[1])
	case Controller:
		return fmt.Sprintf("controller ch.%d %d %d", e.Status&15, e.Data[0], e.Data[1])
	case ProgramChange:
		return fmt.Sprintf("programChange ch.%d %d", e.Status&15, e.Data[0])
	case ChannelTouch:
		return fmt.Sprintf("channelTouch ch.%d %d", e.Status&15, e.Data[0])
	case PitchBend:
		return fmt.Sprintf("pitchBend ch.%d %d", e.Status&15, uint32(e.Data[0])<<7|uint32(e.Data[1]))
	default:
		if e.Status == 0xff {
			return fmt.Sprintf("meta %d %q", e.Data[0], e.MData)
		} else {
			return "<invalid>"
		}
	}
}

// A EventStream is a sequence of events in a MIDI file.
type EventStream struct {
	time   uint32
	status byte
	data   []byte
}

type EventType uint32

const (
	NoteOff       EventType = 8
	NoteOn        EventType = 9
	PolyTouch     EventType = 10
	Controller    EventType = 11
	ProgramChange EventType = 12
	ChannelTouch  EventType = 13
	PitchBend     EventType = 14
)

var errInvalidTrackData = errors.New("invalid track data")

func (t *EventStream) readVar() (uint32, error) {
	var q uint32
	for {
		if len(t.data) == 0 {
			return 0, errInvalidTrackData
		}
		c := t.data[0]
		t.data = t.data[1:]
		if q > ^uint32(0)>>7 {
			return 0, errInvalidTrackData
		}
		q = (q << 7) | (uint32(c) & 0x7f)
		if c&0x80 == 0 {
			return q, nil
		}
		// Theoretically allowed, but non-canonical. Probably indicates an error
		// reading.
		if q == 0 {
			return 0, errInvalidTrackData
		}
	}
}

// Next returns the next event in the stream, or io.EOF if there are no more
// events.
func (t *EventStream) Next() (e Event, err error) {
	if len(t.data) == 0 {
		return e, io.EOF
	}
	delta, err := t.readVar()
	if err != nil {
		return e, err
	}
	if len(t.data) == 0 {
		return e, errInvalidTrackData
	}
	if delta > ^e.Time {
		return e, errInvalidTrackData
	}
	e.Time = t.time + delta
	t.time = e.Time
	ctl := t.data[0]
	if ctl&0x80 == 0 {
		ctl = t.status
		if ctl == 0 {
			return e, errInvalidTrackData
		}
	} else {
		t.data = t.data[1:]
	}
	var elen int
	switch EventType(ctl >> 4) {
	case NoteOff:
		elen = 2
	case NoteOn:
		elen = 2
	case PolyTouch:
		elen = 2
	case Controller:
		elen = 2
	case ProgramChange:
		elen = 1
	case ChannelTouch:
		elen = 1
	case PitchBend:
		elen = 2
	case 15:
		if ctl == 255 {
			if len(t.data) < 1 {
				return
			}
			mt := t.data[0]
			t.data = t.data[1:]
			n, err := t.readVar()
			if err != nil {
				return e, err
			}
			if int(n) > len(t.data) {
				return e, errInvalidTrackData
			}
			t.status = 0
			vdata := t.data[:n]
			t.data = t.data[n:]
			return Event{
				Status: 255,
				Data:   [2]byte{mt, 0},
				MData:  vdata,
			}, nil
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
		if d1&0x80 != 0 {
			return e, errInvalidTrackData
		}
	case 2:
		d1 = t.data[0]
		d2 = t.data[1]
		if d1&0x80 != 0 || d2&0x80 != 0 {
			return e, errInvalidTrackData
		}
	default:
		panic("bad length: " + strconv.Itoa(elen))
	}
	t.data = t.data[elen:]
	t.status = ctl
	return Event{
		Status: ctl,
		Data:   [2]byte{d1, d2},
	}, nil
}
