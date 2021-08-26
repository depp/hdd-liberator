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
	Format       uint16
	TrackCount   uint16
	TickDivision uint16
}

// parseHead parses the MThd chunk in a MIDI file.
func parseHead(data []byte) (h Head, err error) {
	if len(data) < 6 {
		return h, errors.New("MThd too short")
	}
	return Head{
		Format:       binary.BigEndian.Uint16(data),
		TrackCount:   binary.BigEndian.Uint16(data[2:]),
		TickDivision: binary.BigEndian.Uint16(data[4:]),
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
	VData  []byte
}

// IsMeta returns true if this is a meta event.
func (e Event) IsMeta() bool {
	return e.Status == 0xff
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
			return fmt.Sprintf("meta %d %q", e.Data[0], e.VData)
		} else {
			return "<invalid>"
		}
	}
}

// ErrUnknownMetaEvent indicates that the meta event type is not recognized.
var ErrUnknownMetaEvent = errors.New("unknown meta event type")

// ParseMeta parses the specific meta event and returns it. Returns
// ErrUnknownMetaEvent if the meta event type is not recognized.
func (e Event) ParseMeta() (Meta, error) {
	if e.Status != 0xff {
		return nil, errors.New("not a meta event")
	}
	switch e.Data[0] {
	case 0x01:
		return Text(copyBytes(e.VData)), nil
	case 0x02:
		return Copyright(copyBytes(e.VData)), nil
	case 0x03:
		return TrackName(copyBytes(e.VData)), nil
	case 0x04:
		return InstrumentName(copyBytes(e.VData)), nil
	case 0x20:
		if len(e.VData) != 1 {
			return nil, errors.New("invalid channel prefix event")
		}
		return ChannelPrefix(e.VData[0]), nil
	case 0x51:
		if len(e.VData) != 3 {
			return nil, errors.New("invalid tempo event")
		}
		return Tempo(
			(uint32(e.VData[0]) << 16) |
				(uint32(e.VData[1]) << 7) |
				uint32(e.VData[2])), nil
	case 0x58:
		if len(e.VData) != 4 {
			return nil, errors.New("invalid time signature event")
		}
		return TimeSignature{
			Numerator:         e.VData[0],
			DenominatorLog2:   e.VData[1],
			MetronomeInterval: e.VData[2],
			QuarterNote:       e.VData[3],
		}, nil
	case 0x59:
		if len(e.VData) != 2 {
			return nil, errors.New("invalid key signature event")
		}
		return KeySignature{
			SharpsFlats: int8(e.VData[0]),
			IsMinor:     e.VData[1],
		}, nil
	case 0x7f:
		if len(e.VData) != 0 {
			return nil, errors.New("invalid end event")
		}
		return End{}, nil
	default:
		return nil, ErrUnknownMetaEvent
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

func copyBytes(d []byte) []byte {
	if len(d) == 0 {
		return nil
	}
	m := make([]byte, len(d))
	copy(m, d)
	return m
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
				VData:  vdata,
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

type Meta interface {
	fmt.Stringer
	IsMetaEvent()
}

// A Text is a meta event containing arbitrary text data.
type Text []byte

func (Text) IsMetaEvent()     {}
func (m Text) String() string { return "Text(" + strconv.Quote(string(m)) + ")" }

// A Copyright is a meta event containing data
type Copyright []byte

func (Copyright) IsMetaEvent()     {}
func (m Copyright) String() string { return "Copyright(" + strconv.Quote(string(m)) + ")" }

// A TrackName is a meta event containing a track name.
type TrackName []byte

func (TrackName) IsMetaEvent()     {}
func (m TrackName) String() string { return "TrackName(" + strconv.Quote(string(m)) + ")" }

// An InstrumentName is a meta event containing an instrument name.
type InstrumentName []byte

func (InstrumentName) IsMetaEvent()     {}
func (m InstrumentName) String() string { return "InstrumentName(" + strconv.Quote(string(m)) + ")" }

// A ChannelPrefix is a meta event which describes which channel future SysEx
// and Meta events belong to.
type ChannelPrefix uint8

func (ChannelPrefix) IsMetaEvent()     {}
func (m ChannelPrefix) String() string { return "ChannelPrefix(" + strconv.Itoa(int(m)) + ")" }

// A Tempo is a meta event containing the tempo, in microseconds per quarter
// note.
type Tempo uint32

func (Tempo) IsMetaEvent()     {}
func (m Tempo) String() string { return "Tempo(" + strconv.Itoa(int(m)) + ")" }

// A TimeSignature is a meta event containing the musical time signature.
type TimeSignature struct {
	Numerator         uint8
	DenominatorLog2   uint8
	MetronomeInterval uint8
	QuarterNote       uint8
}

func (TimeSignature) IsMetaEvent() {}
func (m TimeSignature) String() string {
	return fmt.Sprintf("TimeSignature(%d, %d, %d, %d)",
		m.Numerator, m.DenominatorLog2, m.MetronomeInterval, m.QuarterNote)
}

// A KeySignature is a meta event containing the musical key signature.
type KeySignature struct {
	SharpsFlats int8
	IsMinor     uint8
}

func (KeySignature) IsMetaEvent() {}
func (m KeySignature) String() string {
	return fmt.Sprintf("KeySignature(%d, %d)", m.SharpsFlats, m.IsMinor)
}

// An End is a meta event indicating the end of the track.
type End struct{}

func (End) IsMetaEvent()   {}
func (End) String() string { return "End" }
