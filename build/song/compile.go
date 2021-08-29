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

// Special note values.
const (
	trackEnd = embed.NumValues - 1 - iota
	restValue
)

const (
	// Initial value, for calculating deltas
	startValue = 60

	// Base length of a tick, in seconds, for encoding tempo. So if the song's
	// tempo is encoded as N, then the duration of a tick is equal to
	// N*baseTickLength seconds.
	baseTickLength = 2e-3
)

func compile(songs []*Song) ([]byte, error) {
	/*
		Data format:
		N = embed.NumValues

		byte: number of songs
		song[]: song data (length = number of songs)
			byte: number of tracks
			byte: tick duration, 1 = 2 ms
			byte[2]: song length in ticks (big endian)
				value = arr[0]*N + arr[1]
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
	var data []uint8
	var values, durations []uint8
	data = []uint8{uint8(len(songs))}
	for _, sn := range songs {
		// Write track note data, and calculate length of song.
		var slen int
		for _, tr := range sn.Tracks {
			var tlen int
			var last int = startValue
			for _, n := range tr.Notes {
				var enc uint8
				if n.IsRest {
					enc = restValue
				} else {
					if n.Value >= restValue {
						return nil, fmt.Errorf("note value out of range: %d", n.Value)
					}
					n := int(n.Value)
					delta := n - last
					if delta < 0 {
						delta += restValue
					}
					enc = byte(delta)
					last = n
				}
				values = append(values, enc)
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
		data = append(data,
			uint8(len(sn.Tracks)),
			uint8(itick),
			uint8(slen/embed.NumValues),
			uint8(slen%embed.NumValues))
	}
	data = append(data, values...)
	data = append(data, durations...)
	return data, nil
}

type songs struct {
	Songs []string `json:"songs"`
}

func Compile(ctx context.Context, filename string) ([]byte, error) {
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
