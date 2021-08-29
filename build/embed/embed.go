package embed

import "fmt"

// NumValues is the number of different values that can used in
//
// Currently, any ASCII character other than 0 NUL, 13 CR, or 60 '<' can be
// used. If this value is changed, NUM_VALUES in common.js must be changed to
// match.
//
// - Non-ASCII characters are not used because they take additional bytes to
//   encode.
//
// - NUL is omitted because it will get converted to U+FFFD, and the decoder
//   hasn't been written to decode it.
//
// - CR is omitted because it will get converted to LF, and we cannot tell the
//   difference.
//
// - '<' is omitted so we can avoid having to balance HTML comments and script
//   tags.
const NumValues = 128 - 3

var encoding [NumValues]byte

func init() {
	limit := [...]byte{0, '\r', '<', 128}
	var x, y byte
	for _, b := range limit {
		for y < b {
			encoding[x] = byte(y)
			x++
			y++
		}
		y = b + 1
	}
}

// Encode encodes raw data as a string.
func Encode(data []byte) (string, error) {
	enc := make([]byte, len(data))
	for i, x := range data {
		if x >= NumValues {
			return "", fmt.Errorf("data contains value out of range: index=%d, value=%d", i, x)
		}
		enc[i] = encoding[x]
	}
	return string(enc), nil
}
