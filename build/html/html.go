package html

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/text/encoding/charmap"
)

func init() {
	for i := 0x21; i < 0x7f; i++ {
		attrNameValid[i] = true
	}
	for _, c := range [...]byte{'\'', '"', '>', '='} {
		attrNameValid[c] = false
	}
}

// ============================================================================

type containsStringError struct {
	offset int
	text   string
}

func (e *containsStringError) Error() string {
	return fmt.Sprintf("prohibited string: %q (offset: %d)", e.text, e.offset)
}

type charError struct {
	char rune
}

func (e *charError) Error() string {
	var msg string
	if e.char <= 0x1f || (0x7f <= e.char && e.char <= 0x9f) {
		msg = "prohibited control character"
	} else if e.char >= 0x80 {
		msg = "prohibited Unicode character"
	} else {
		msg = "prohibited character"
	}
	return fmt.Sprintf("%s: %q (U+%04X)", msg, e.char, e.char)
}

var errEmpty = errors.New("cannot be empty")

type dataError struct {
	context string
	text    string
	err     error
}

func (e *dataError) Error() string {
	if e.text == "" {
		return e.context + ": " + e.err.Error()
	}
	return e.context + " " + strconv.Quote(e.text) + ": " + e.err.Error()
}

// ============================================================================

var attrNameValid [128]bool

// A Writer writes HTML tokens to a buffer.
//
// Like bufio.Writer, if an error occurs writing to a writer, all future writes
// will be ignored. The error will be returned by Finish.
//
// The writer will validate
type Writer struct {
	charmap   *charmap.Charmap
	buf       bytes.Buffer
	isTagOpen bool
	isScript  bool
	textStart int
	err       error
}

func (w *Writer) SetCharset(c *charmap.Charmap) {
	w.charmap = c
}

func (w *Writer) writeString(s string) {
	if cm := w.charmap; cm != nil {
		for _, c := range s {
			if b, ok := cm.EncodeRune(c); ok {
				w.buf.WriteByte(b)
			} else {
				w.buf.WriteByte('&')
				if e := entities[c]; e != "" {
					w.buf.WriteString(e)
				} else {
					w.buf.WriteByte('#')
					w.buf.WriteString(strconv.FormatUint(uint64(c), 10))
				}
				w.buf.WriteByte(';')
			}
		}
	} else {
		w.buf.WriteString(s)
	}
}

func (w *Writer) writeTagName(name string) error {
	if len(name) == 0 {
		return errEmpty
	}
	for _, c := range name {
		if !('0' <= c && c <= '9' || 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z') {
			return &charError{c}
		}
	}
	w.buf.WriteString(name)
	return nil
}

func isControlCharacter(c rune) bool {
	return c <= 0x1f || (0x7f <= c && c <= 0x9f)
}

func isNonCharacter(c rune) bool {
	return (0xfdd0 <= c && c <= 0xfdef) || (c&0xfffe) == 0xfffe
}

func (w *Writer) writeAttrName(name string) error {
	if len(name) == 0 {
		return errEmpty
	}
	for _, c := range name {
		// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
		// invalid characters:
		//   controls: 00..1F, 7F..9F
		//   space, quote (double/single), >, /, =, noncharacters
		if int(c) < len(attrNameValid) {
			if !attrNameValid[c] {
				return &charError{c}
			}
		} else if c <= 0x9f || isNonCharacter(c) {
			return &charError{c}
		}
	}
	w.buf.WriteString(name)
	return nil
}

func (w *Writer) writeAttrValue(value string) error {
	var sq, dq int       // Number of single / double quotes.
	q := len(value) == 0 // If true, must be quoted.
	for _, c := range value {
		if c < 0x80 {
			switch c {
			case '\'':
				sq++
			case '"':
				dq++
			case ' ', '=', '<', '>', '`':
				q = true
			default:
				if c <= 0x1f {
					return &charError{c}
				}
			}
		} else if c <= 0x9f || isNonCharacter(c) {
			return &charError{c}
		}
	}
	if !q {
		w.writeString(value)
	} else {
		var b strings.Builder
		qc := '\''
		qe := "&squo;"
		if dq <= sq {
			qc = '"'
			qe = "&dquo;"
		}
		b.WriteByte(byte(qc))
		for _, c := range value {
			if c == qc {
				b.WriteString(qe)
			} else {
				b.WriteRune(c)
			}
		}
		b.WriteByte(byte(qc))
		w.writeString(b.String())
	}
	return nil
}

func (w *Writer) finishTag() {
	if w.isTagOpen {
		w.buf.WriteByte('>')
		w.textStart = w.buf.Len()
		w.isTagOpen = false
	}
}

// scriptProhibited matches all strings which cannot appear inside an HTML
// script element, according to our conservative rules. Technically, some of
// these strings can appear if they are correctly paired.
//
// https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
var scriptProhibited = regexp.MustCompile("(?i)<!--|</?script")

func (w *Writer) finishText() bool {
	text := w.buf.Bytes()[w.textStart:]
	if w.isScript {
		if loc := scriptProhibited.FindIndex(text); loc != nil {
			w.err = &dataError{
				context: "<script> tag",
				err:     &containsStringError{offset: loc[0], text: string(text[loc[0]:loc[1]])},
			}
			return false
		}
	} else {
		const cdata = "<![CDATA["
		if i := bytes.Index(text, []byte(cdata)); i != -1 {
			w.err = &dataError{
				context: "in <script>",
				err:     &containsStringError{i + w.textStart, cdata},
			}
			return false
		}
	}
	return true
}

// OpenTag writes an opening HTML tag to the document.
func (w *Writer) OpenTag(name string) {
	if w.err != nil {
		return
	}
	if w.isScript {
		w.err = errors.New("cannot open tag inside <script> tag")
		return
	}
	w.finishTag()
	if !w.finishText() {
		return
	}
	w.buf.WriteByte('<')
	if err := w.writeTagName(name); err != nil {
		w.err = &dataError{
			context: "tag name",
			text:    name,
			err:     err,
		}
		return
	}
	w.isTagOpen = true
	w.isScript = strings.EqualFold(name, "script")
}

// CloseTag writes a closing HTML tag to the document.
func (w *Writer) CloseTag(name string) {
	if w.err != nil {
		return
	}
	isScript := strings.EqualFold(name, "script")
	if w.isScript {
		if !isScript {
			w.err = errors.New("only </script> may be closed inside <script>")
			return
		}
	} else if isScript {
		w.err = errors.New("cannot close </script> except inside <script>")
		return
	}
	w.finishTag()
	if !w.finishText() {
		return
	}
	w.buf.WriteString("</")
	if err := w.writeTagName(name); err != nil {
		w.err = &dataError{
			context: "tag name",
			text:    name,
			err:     err,
		}
		return
	}
	w.buf.WriteByte('>')
	w.isTagOpen = false
	w.isScript = false
}

// Attr adds an attribute to the currently open tag. It is an error to write an
// attribute without a call to OpenTag first, or if any other method besides
// Attr has been called since the last call to OpenTag.
func (w *Writer) Attr(key, value string) {
	if w.err != nil {
		return
	}
	if !w.isTagOpen {
		w.err = errors.New("cannot add attribute, no tag is open")
		return
	}
	w.buf.WriteByte(' ')
	if err := w.writeAttrName(key); err != nil {
		w.err = &dataError{
			context: "attr name",
			text:    key,
			err:     err,
		}
		return
	}
	if value != "" {
		w.buf.WriteByte('=')
		if err := w.writeAttrValue(value); err != nil {
			w.err = &dataError{
				context: "attr",
				text:    key,
				err:     err,
			}
			return
		}
	}
}

// Text writes text to the document.
func (w *Writer) Text(text string) {
	if w.err != nil {
		return
	}
	w.finishTag()
	if w.isScript {
		if cm := w.charmap; cm != nil {
			for _, c := range text {
				if b, ok := cm.EncodeRune(c); ok {
					w.buf.WriteByte(b)
				} else if c < (1 << 8) {
					fmt.Fprintf(&w.buf, "\\x%02x", c)
				} else if c < (1 << 16) {
					fmt.Fprintf(&w.buf, "\\u%04x", c)
				} else {
					fmt.Fprintf(&w.buf, "\\u{%x}", c)
				}
			}
		} else {
			w.buf.WriteString(text)
		}
	} else {
		var b strings.Builder
		for _, c := range text {
			switch c {
			case '&':
				b.WriteString("&amp;")
			case '<':
				b.WriteString("&lt;")
			default:
				b.WriteRune(c)
			}
		}
		w.writeString(b.String())
	}
}

// Finish returns the full contents of the HTML document, or returns an error if
// an error occurred during writing.
func (w *Writer) Finish() ([]byte, error) {
	if w.err != nil {
		return nil, w.err
	}
	w.finishTag()
	if !w.finishText() {
		return nil, w.err
	}
	if w.isScript {
		return nil, errors.New("unclosed <script>")
	}
	return w.buf.Bytes(), nil
}
