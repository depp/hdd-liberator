package main

import (
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"sync"

	"golang.org/x/crypto/blake2b"
)

const hashSize = blake2b.Size256

type sourcemap struct {
	lock sync.RWMutex
	hash [hashSize]byte
	data []byte
}

func (m *sourcemap) set(data []byte) url.Values {
	if len(data) == 0 {
		return nil
	}
	h, err := blake2b.New256(nil)
	if err != nil {
		panic("blake2b.New256: " + err.Error())
	}
	h.Write(data)
	var b [hashSize]byte
	h.Sum(b[:0])

	m.lock.Lock()
	if b != m.hash {
		m.hash = b
		m.data = data
	}
	m.lock.Unlock()

	q := make(url.Values, 1)
	q.Set("hash", hex.EncodeToString(b[:]))
	return q
}

var (
	noHashErr       = errors.New("no hash parameter")
	hashNotFoundErr = errors.New("hash not found")
)

func (m *sourcemap) get(r *http.Request) ([]byte, error) {
	q := r.URL.Query()
	hv := q.Get("hash")
	if len(hv) != hashSize*2 {
		if len(hv) == 0 {
			return nil, noHashErr
		}
		return nil, hashNotFoundErr
	}
	var b [hashSize]byte
	if _, err := hex.Decode(b[:], []byte(hv)); err != nil {
		return nil, hashNotFoundErr
	}

	var d []byte
	m.lock.RLock()
	if b == m.hash {
		d = m.data
	}
	m.lock.RUnlock()

	if len(d) == 0 {
		return nil, hashNotFoundErr
	}
	return d, nil
}

func (m *sourcemap) serve(h *handler, w http.ResponseWriter, r *http.Request) {
	d, err := m.get(r)
	if err != nil {
		if err == noHashErr {
			var b [hashSize]byte
			var ok bool

			m.lock.RLock()
			if len(m.data) != 0 {
				b = m.hash
				ok = true
			}
			m.lock.RUnlock()

			if ok {
				u := *r.URL
				u.RawQuery = url.Values{"hash": {hex.EncodeToString(b[:])}}.Encode()
				h.serveRedirect(w, r, &u)
				return
			}
		}
		h.serveNotFound(w, r)
		return
	}
	hdr := w.Header()
	hdr.Set("Content-Type", "application/json")
	hdr.Set("Content-Length", strconv.Itoa(len(d)))
	hdr.Set("Cache-Control", "max-age=3600")
	w.WriteHeader(http.StatusOK)
	w.Write(d)
}
