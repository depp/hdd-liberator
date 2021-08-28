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
)

const (
	restValue = 0x80
	trackEnd  = 0x81

	startValue = 0x40

	// Seconds per tick is calculated as tempoExp^tempo / tempoDivisor.
	tempoExp     = 0.99
	tempoDivisor = 4.0
)

type Compiled struct {
	Data []byte
}

func compile(songs []*Song) (*Compiled, error) {
	/*
		Data format:
		- u8 number of songs
		- song data
		- note values, each track ending with 0x81
		- note durations
		Song format:
		- u8 number of tracks
		- u8 tick duration, in 1/1000 of a second
		- u16be song duration, in ticks
	*/
	var data []uint8
	var values, durations []uint8
	data = []uint8{uint8(len(songs))}
	for _, sn := range songs {
		// Write track note data, and calculate length of song.
		var slen int
		for _, tr := range sn.Tracks {
			var tlen int
			var last uint8 = startValue
			for _, n := range tr.Notes {
				var value uint8
				if n.IsRest {
					value = restValue
				} else {
					if n.Value >= 0x80 {
						return nil, fmt.Errorf("note value out of range: %d", n.Value)
					}
					value = (n.Value - last) & 0x7f
					last = n.Value
				}
				values = append(values, value)
				durations = append(durations, n.Duration)
				tlen += int(n.Duration)
			}
			values = append(values, trackEnd)
			if tlen > slen {
				slen = tlen
			}
		}
		if slen > 0xffff {
			return nil, fmt.Errorf("song too long: %d ticks", slen)
		}
		// Write song metadata.
		tdenom := sn.Info.Tempo * float64(sn.Info.Division)
		if tdenom == 0 {
			return nil, errors.New("invalid tempo or division")
		}
		ftick := 240e3 / tdenom
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
		data = append(data,
			uint8(len(sn.Tracks)),
			uint8(itick),
			uint8(slen>>8),
			uint8(slen))
	}
	data = append(data, values...)
	data = append(data, durations...)
	return &Compiled{
		Data: data,
	}, nil
}

type songs struct {
	Songs []string `json:"songs"`
}

func Compile(ctx context.Context, filename string) (*Compiled, error) {
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
	return compile(sns)
}
