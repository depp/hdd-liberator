package main

import (
	"html/template"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var funcs = template.FuncMap{
	"lower": func(x string) string { return strings.ToLower(x) },
}

type cachedTemplate struct {
	filename string

	lock     sync.Mutex
	template *template.Template
	modTime  time.Time
	err      error
}

func (c *cachedTemplate) get() (*template.Template, error) {
	st, err := os.Stat(c.filename)
	if err != nil {
		return nil, err
	}
	mtime := st.ModTime()

	c.lock.Lock()
	defer c.lock.Unlock()

	if mtime.Equal(c.modTime) {
		return c.template, c.err
	}
	t, mtime, err := readTemplate(c.filename)
	c.template = t
	c.modTime = mtime
	c.err = err
	return t, err
}

func (c *cachedTemplate) execute(wr io.Writer, data interface{}) error {
	t, err := c.get()
	if err != nil {
		return err
	}
	return t.Execute(wr, data)
}

func readTemplate(filename string) (*template.Template, time.Time, error) {
	fp, err := os.Open(filename)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer fp.Close()

	st, err := fp.Stat()
	if err != nil {
		return nil, time.Time{}, err
	}
	mtime := st.ModTime()
	data := make([]byte, st.Size())
	rem := data
	for len(rem) > 0 {
		n, err := fp.Read(rem)
		rem = rem[n:]
		if err != nil {
			if err == io.EOF {
				if len(rem) == 0 {
					break
				}
				err = io.ErrUnexpectedEOF
			}
			return nil, mtime, err
		}
	}
	t := template.New(filepath.Base(filename))
	t.Funcs(funcs)
	if _, err := t.Parse(string(data)); err != nil {
		return nil, mtime, err
	}
	return t, mtime, nil
}
