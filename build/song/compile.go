package song

import "fmt"

const (
	restValue = 0x80
	trackEnd  = 0x81
	songEnd   = 0x82

	startValue = 0x40
)

type Compiled struct {
	Data []byte
}

func Compile(songs []*Song) (*Compiled, error) {
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
