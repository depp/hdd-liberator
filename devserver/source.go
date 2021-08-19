package main

import (
	"fmt"
	"html/template"
	"io/ioutil"
	"path/filepath"
	"strings"
	"unicode/utf8"

	pb "moria.us/js13k/proto/compiler"
)

type srcLoader struct {
	baseDir string
	srcfile string
	srcdata [][]byte
}

// splitLines splits the input into lines, excluding the newline or carriage
// return, and appends each line to the lines array.
func splitLines(lines [][]byte, data []byte) [][]byte {
	var pos int
	var last byte
	for i, c := range data {
		if c == '\n' {
			if last == '\r' {
				pos++
			} else {
				lines = append(lines, data[pos:i])
				pos = i + 1
			}
		} else if c == '\r' {
			lines = append(lines, data[pos:i])
			pos = i + 1
		}
		last = c
	}
	if pos != len(lines) {
		lines = append(lines, data[pos:])
	}
	return lines
}

func (e *srcLoader) loadSource(name string) error {
	if e.srcfile == name {
		return nil
	}
	if !safePath.MatchString(name) {
		return fmt.Errorf("invalid source path: %q", name)
	}
	data, err := ioutil.ReadFile(filepath.Join(e.baseDir, name))
	if err != nil {
		return err
	}
	for i := range e.srcdata {
		e.srcdata[i] = nil
	}
	e.srcdata = splitLines(e.srcdata[:0], data)
	return nil
}

type sourceWriter struct {
	data  strings.Builder
	class string
}

func setClass(w *strings.Builder, state *string, name string) {
	if *state == name {
		return
	}
	if *state != "" {
		w.WriteString("</span>")
	}
	if name != "" {
		w.WriteString(`<span class="`)
		w.WriteString(name)
		w.WriteString(`">`)
	}
	*state = name
}

func writeLine(w *strings.Builder, data []byte) {
	var s string
	for len(data) != 0 {
		r, n := utf8.DecodeRune(data)
		if r == utf8.RuneError && n == 1 {
			setClass(w, &s, "bytes")
			fmt.Fprintf(w, "&lt;%02X&gt;", data[0])
			data = data[1:]
		} else {
			data = data[n:]
			switch r {
			case '<':
				setClass(w, &s, "")
				w.WriteString("&lt;")
			case '>':
				setClass(w, &s, "")
				w.WriteString("&gt;")
			case '&':
				setClass(w, &s, "")
				w.WriteString("&amp;")
			default:
				if r <= 0x1f || (0x7f <= r && r <= 0x9f) {
					setClass(w, &s, "control")
					fmt.Fprintf(w, "&lt;U+%04X&gt;", r)
				} else {
					setClass(w, &s, "")
					w.WriteRune(r)
				}
			}
		}
	}
	setClass(w, &s, "")
}

func (e *errorData) GetSource(d *pb.Diagnostic) (template.HTML, error) {
	name := d.GetFile()
	if name == "" {
		return "", nil
	}
	l := e.srcLoader
	if err := l.loadSource(name); err != nil {
		return "", err
	}
	var line []byte
	n := int(d.GetLine())
	if 1 <= n && n <= len(l.srcdata) {
		line = l.srcdata[n-1]
	}
	var w strings.Builder
	writeLine(&w, line)
	return template.HTML(w.String()), nil
}
