package main

import (
	"encoding/hex"
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

func (m *sourcemap) get(r *http.Request) []byte {
	q := r.URL.Query()
	hv := q.Get("hash")
	if len(hv) != hashSize*2 {
		return nil
	}
	var b [hashSize]byte
	if _, err := hex.Decode(b[:], []byte(hv)); err != nil {
		return nil
	}

	var d []byte
	m.lock.RLock()
	if b == m.hash {
		d = m.data
	}
	m.lock.RUnlock()

	return d
}

func (m *sourcemap) serve(h *handler, w http.ResponseWriter, r *http.Request) {
	d := m.get(r)
	if len(d) == 0 {
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
