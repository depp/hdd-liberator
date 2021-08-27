package song

import (
	"bytes"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	minTempo = 30
	maxTempo = 280
)

// An Info contains the metadata for a song.
type Info struct {
	Name     string
	Composer string
	Tempo    float64
	Division int
}

// A TrackInfo contains the metadata for an instrument track within a song.
type TrackInfo struct {
	Name string
}

// A Note is an individual note in an instrument track. A note does not store
// the time when it starts, instead, a note starts when the previous note
// finishes.
type Note struct {
	IsRest   bool
	Value    uint8
	Duration uint8
}

// A Track is an individual instrument track within a song.
type Track struct {
	Name  string
	Notes []Note
}

// A Song is a complete piece of music.
type Song struct {
	Info   Info
	Tracks []*Track
}

// =============================================================================

type pair struct {
	lineno     int
	key, value string
}

type line struct {
	lineno int
	data   string
}

type section struct {
	lineno     int
	kind       string
	properties []pair
	data       []line
}

func splitLine(data []byte) (line, rest []byte) {
	for i := 0; i < len(data); i++ {
		c := data[i]
		if c == '\r' {
			line = data[:i]
			rest = data[i+1:]
			if len(rest) != 0 && rest[0] == '\n' {
				rest = rest[1:]
			}
			return
		}
		if c == '\n' {
			line = data[:i]
			rest = data[i+1:]
			return
		}
	}
	line = data
	return
}

func trim(d []byte) []byte {
	for len(d) != 0 && (d[0] == ' ' || d[0] == '\t') {
		d = d[1:]
	}
	for len(d) != 0 && (d[len(d)-1] == ' ' || d[len(d)-1] == '\t') {
		d = d[:len(d)-1]
	}
	return d
}

type Error struct {
	Line int
	Err  error
}

func (e *Error) Error() string {
	var s string
	if e.Line != 0 {
		s += strconv.Itoa(e.Line) + ":"
	}
	if s != "" {
		s += " "
	}
	s += e.Err.Error()
	return s
}

func parseSections(data []byte) ([]section, error) {
	const (
		stateInit = iota
		stateProperty
		stateData
	)
	var state int
	var wasblank bool
	var ss []section
	var s section
	keys := make(map[string]bool, 16)
	for lineno := 1; len(data) != 0; lineno++ {
		var text []byte
		text, data = splitLine(data)
		text = trim(text)
		if len(text) == 0 {
			if !wasblank {
				if state == stateProperty {
					state = stateData
				}
			}
			wasblank = true
			continue
		}
		wasblank = false
		if !utf8.Valid(text) {
			return nil, &Error{lineno, errors.New("invalid UTF-8")}
		}
		for _, c := range text {
			if c < 32 || 127 == c {
				return nil, &Error{lineno, fmt.Errorf("invalid control character: 0x%02x", c)}
			}
		}
		if text[0] == ';' {
			continue
		}
		if text[0] == '@' {
			if state != stateInit {
				ss = append(ss, s)
			}
			kind := trim(text[1:])
			if len(kind) == 0 {
				return nil, &Error{lineno, errors.New("missing section kind")}
			}
			if !utf8.Valid(kind) {
				return nil, &Error{lineno, errors.New("invalid UTF-8")}
			}
			s = section{
				lineno: lineno,
				kind:   string(kind),
			}
			state = stateProperty
			for k := range keys {
				delete(keys, k)
			}
			continue
		}
		switch state {
		case stateInit:
			return nil, &Error{lineno, errors.New("expected directive before data")}
		case stateProperty:
			i := bytes.IndexByte(text, ':')
			if i == -1 {
				return nil, &Error{lineno, errors.New("expected ':' in property")}
			}
			key := trim(text[:i])
			value := trim(text[i+1:])
			if len(key) == 0 {
				return nil, &Error{lineno, errors.New("empty key")}
			}
			k := string(key)
			s.properties = append(s.properties, pair{
				lineno: lineno,
				key:    k,
				value:  string(value),
			})
			if keys[k] {
				return nil, &Error{lineno, fmt.Errorf("duplicate property: %q", k)}
			}
			keys[k] = true
		case stateData:
			s.data = append(s.data, line{lineno: lineno, data: string(text)})
		default:
			panic("bad state")
		}
	}
	if state != stateInit {
		ss = append(ss, s)
	}
	return ss, nil
}

// =============================================================================

func (d *Info) setProp(key, value string) error {
	switch key {
	case "name":
		d.Name = value
		return nil
	case "composer":
		d.Composer = value
		return nil
	case "tempo":
		n, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return err
		}
		if !(minTempo < n && n < maxTempo) {
			return fmt.Errorf("tempo %f is not in allowed range %d..%d", n, minTempo, maxTempo)
		}
		d.Tempo = n
		return nil
	case "division":
		n, err := strconv.ParseUint(value, 10, strconv.IntSize-1)
		if err != nil {
			return err
		}
		if n == 0 {
			return errors.New("division may not be 0")
		}
		d.Division = int(n)
		return nil
	default:
		return fmt.Errorf("unknown property key: %q", key)
	}
}

func (tr *Track) setProp(key, value string) error {
	switch key {
	case "name":
		tr.Name = value
		return nil
	default:
		return fmt.Errorf("unknown property key: %q", key)
	}
}

type noteParser struct {
	division int
	time     int
	bar      int
	barstart int
	notes    []Note
}

func (p *noteParser) parseLine(text string) error {
	for {
		for len(text) != 0 && (text[0] == ' ' || text[0] == '\t') {
			text = text[1:]
		}
		var pos int
		for pos < len(text) && text[pos] != ' ' && text[pos] != '\t' {
			pos++
		}
		if pos == 0 {
			return nil
		}
		tok := text[:pos]
		if err := p.parseToken(tok); err != nil {
			return &tokErr{tok, err}
		}
		text = text[pos:]
	}
}

type tokErr struct {
	tok string
	err error
}

func (e *tokErr) Error() string {
	return fmt.Sprintf("invalid token %q: %v", e.tok, e.err)
}

func (p *noteParser) parseDur(text string) (int, error) {
	n, err := strconv.ParseUint(text, 10, 8)
	if err != nil {
		return 0, fmt.Errorf("invalid length: %v", err)
	}
	if n == 0 {
		return 0, errors.New("zero length")
	}
	dur := int(n)
	if dur > p.division {
		return 0, errors.New("longer than one measure")
	}
	return dur, nil
}

func (p *noteParser) advanceTime(dur int) error {
	time := p.time + dur
	if time > p.barstart+p.division {
		return fmt.Errorf("note crosses barline at end of measure %d", p.bar+1)
	}
	p.time = time
	return nil
}

var baseNote = [7]int{0, 2, 3, 5, 7, 8, 10}

func trimByteFront(text string, b uint8) (int, string) {
	var pos int
	for pos < len(text) && text[pos] == b {
		pos++
	}
	return pos, text[pos:]
}

func (p *noteParser) parseToken(text string) error {
	if len(text) == 0 {
		panic("empty token")
	}
	switch c := text[0]; c {
	case 'r':
		dur, err := p.parseDur(text[1:])
		if err != nil {
			return err
		}
		if err := p.advanceTime(dur); err != nil {
			return err
		}
		// Coalesce with previous rest.
		if len(p.notes) != 0 {
			if n := p.notes[len(p.notes)-1]; n.IsRest {
				lim := int(^n.Duration)
				if dur <= lim {
					n.Duration += uint8(dur)
					dur = 0
				} else {
					n.Duration = ^uint8(0)
					dur -= lim
				}
			}
		}
		if dur > 0 {
			p.notes = append(p.notes, Note{true, 0, uint8(dur)})
		}
		return nil
	case '~':
		if len(p.notes) == 0 {
			return errors.New("cannot tie without note")
		}
		dur, err := p.parseDur(text[1:])
		if err != nil {
			return err
		}
		if err := p.advanceTime(dur); err != nil {
			return err
		}
		n := p.notes[len(p.notes)-1]
		if n.IsRest {
			return errors.New("cannot tie to rest")
		}
		if uint8(dur) > ^n.Duration {
			return errors.New("duration overflow")
		}
		p.notes[len(p.notes)-1].Duration += uint8(dur)
		return nil
	case '|':
		if text != "|" {
			return errors.New("unexpected character after |")
		}
		barend := p.barstart + p.division
		if p.time != barend {
			return fmt.Errorf("shart measure in measure %d", p.bar+1)
		}
		p.barstart = barend
		return nil
	case 'a', 'b', 'c', 'd', 'e', 'f', 'g':
		value := baseNote[int(c)-'a']
		text = text[1:]
		var n int
		if n, text = trimByteFront(text, '#'); n > 0 {
			if n > 3 {
				return errors.New("too many sharps")
			}
			value += n
		} else if n, text = trimByteFront(text, 'b'); n > 0 {
			if n > 3 {
				return errors.New("too many flats")
			}
			value -= n
		}
		i := strings.IndexByte(text, '.')
		if i == -1 {
			return errors.New("missing duration")
		}
		oct, err := strconv.ParseInt(text[:i], 10, strconv.IntSize)
		if err != nil {
			return fmt.Errorf("invalid octave: %v", err)
		}
		if oct < 0 || 10 < oct {
			return fmt.Errorf("octave too large: %d", oct)
		}
		value += 12 * (int(oct) + 1)
		if value < 0 || 127 < value {
			return errors.New("note out of range")
		}
		text = text[i+1:]
		dur, err := p.parseDur(text)
		if err != nil {
			return err
		}
		if err := p.advanceTime(dur); err != nil {
			return err
		}
		p.notes = append(p.notes, Note{false, uint8(value), uint8(dur)})
		return nil
	default:
		return errors.New("unknown token")
	}
}

// Parse parses a text song file.
func Parse(data []byte) (*Song, error) {
	ss, err := parseSections(data)
	if err != nil {
		return nil, err
	}
	var sn Song
	var hasinfo bool
	for _, s := range ss {
		switch s.kind {
		case "info":
			if hasinfo {
				return nil, &Error{s.lineno, errors.New("duplicate info section")}
			}
			for _, p := range s.properties {
				if err := sn.Info.setProp(p.key, p.value); err != nil {
					return nil, &Error{p.lineno, err}
				}
			}
			for _, l := range s.data {
				return nil, &Error{l.lineno, errors.New("unexpected data in this section type")}
			}
			hasinfo = true
		case "track":
			if !hasinfo {
				return nil, &Error{s.lineno, errors.New("track without song info")}
			}
			var tr Track
			for _, p := range s.properties {
				if err := tr.setProp(p.key, p.value); err != nil {
					return nil, &Error{p.lineno, err}
				}
			}
			np := noteParser{division: sn.Info.Division}
			for _, l := range s.data {
				if err := np.parseLine(l.data); err != nil {
					return nil, &Error{l.lineno, err}
				}
			}
			for len(np.notes) != 0 && np.notes[len(np.notes)-1].IsRest {
				np.notes = np.notes[:len(np.notes)-1]
			}
			tr.Notes = np.notes
			sn.Tracks = append(sn.Tracks, &tr)
		default:
			return nil, &Error{s.lineno, fmt.Errorf("unknown section: %q", s.kind)}
		}
	}
	if !hasinfo {
		return nil, errors.New("song has no @info section")
	}
	if len(sn.Tracks) == 0 {
		return nil, errors.New("song has no tracks")
	}
	return &sn, nil
}
