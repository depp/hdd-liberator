package midi

import (
	"io"
	"strconv"

	"github.com/sirupsen/logrus"
)

var notes = [12]string{"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"}

// NoteName returns the human-readable version of a note value.
func NoteName(value uint8) string {
	octave := int(value)/12 - 1
	chromaticity := int(value) % 12
	return notes[chromaticity] + strconv.Itoa(octave)
}

// A Note is a complete note in a MIDI stream, with both the start and end.
type Note struct {
	Time     uint32
	Duration uint32
	Channel  uint8
	Value    uint8
	Velocity uint8
}

// ParseNotes groups all note on and note off events in the channel into notes.
func (t Track) ParseNotes() ([]Note, error) {
	var all []Note
	active := make(map[uint32]int)
	evs := t.Events()
	for {
		e, err := evs.Next()
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, err
		}
		var on bool
		switch EventType(e.Status >> 4) {
		case NoteOff:
		case NoteOn:
			on = e.Data[1] != 0
		default:
			continue
		}
		channel := e.Status & 15
		value := e.Data[0]
		key := (uint32(channel) << 8) | uint32(value)
		if on {
			if _, ok := active[key]; ok {
				logrus.Warnf("note double pressed: %s ch=%d", NoteName(value), channel)
				continue
			}
			idx := len(all)
			all = append(all, Note{
				Time:     e.Time,
				Channel:  channel,
				Value:    value,
				Velocity: e.Data[1],
			})
			active[key] = idx
		} else {
			idx, ok := active[key]
			if !ok {
				logrus.Warnf("note off for unpressed note: %s ch=%d", NoteName(value), channel)
				continue
			}
			delete(active, key)
			all[idx].Duration = e.Time - all[idx].Time
		}
	}
	for _, idx := range active {
		n := all[idx]
		logrus.Warnf("missing note off for note: %s ch=%d", NoteName(n.Value), n.Channel)
	}
	return all, nil
}
