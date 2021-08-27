package song

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"path/filepath"
)

const (
	restValue = 0x80
	trackEnd  = 0x81
	songEnd   = 0x82

	startValue = 0x40
)

type Compiled struct {
	Data []byte
}

func compile(songs []*Song) (*Compiled, error) {
	var values, durations []uint8
	for _, sn := range songs {
		for _, tr := range sn.Tracks {
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
				}
				values = append(values, value)
				durations = append(durations, n.Duration)
			}
			values = append(values, trackEnd)
		}
		values = append(values, songEnd)
	}
	var data = values
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
