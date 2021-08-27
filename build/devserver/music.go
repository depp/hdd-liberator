package main

import (
	"context"
	"sync"

	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/song"
	"moria.us/js13k/build/watcher"
)

type music struct {
	lock      sync.RWMutex
	data      *watcher.SongState
	listeners []chan<- *watcher.SongState
}

func (m *music) watch(ctx context.Context, ch <-chan *watcher.SongState) {
	for {
		s, ok := <-ch
		if !ok {
			logrus.Fatalln("watch channel closed")
		}

		m.lock.Lock()
		m.data = s
		ls := m.listeners
		var pos int
		for _, l := range ls {
			select {
			case l <- s:
				ls[pos] = l
				pos++
			default:
				close(l)
			}
		}
		m.listeners = ls[:pos]
		for ; pos < len(ls); pos++ {
			ls[pos] = nil
		}
		m.lock.Unlock()
	}
}

func (m *music) addListener(ch chan<- *watcher.SongState) *watcher.SongState {
	if ch == nil {
		panic("nil channel")
	}

	m.lock.Lock()
	d := m.data
	m.listeners = append(m.listeners, ch)
	m.lock.Unlock()

	return d
}

func (m *music) removeListener(ch chan<- *watcher.SongState) {
	m.lock.Lock()
	for i, l := range m.listeners {
		if l == ch {
			m.listeners[i] = m.listeners[len(m.listeners)-1]
			m.listeners[len(m.listeners)-1] = nil
			m.listeners = m.listeners[:len(m.listeners)-1]
			close(ch)
		}
	}
	m.lock.Unlock()
}

func (m *music) getMusicImpl(ctx context.Context) *watcher.SongState {
	m.lock.RLock()
	d := m.data
	m.lock.RUnlock()

	if d != nil {
		return d
	}
	ch := make(chan *watcher.SongState, 1)

	m.lock.Lock()
	if d = m.data; d != nil {
		m.lock.Unlock()
		return d
	}
	m.listeners = append(m.listeners, ch)
	m.lock.Unlock()
	defer m.removeListener(ch)

	for {
		select {
		case d = <-ch:
			if d != nil {
				return d
			}
			d = nil
		case <-ctx.Done():
			return nil
		}
	}
}

func (m *music) getMusic(ctx context.Context) (*song.Compiled, error) {
	d := m.getMusicImpl(ctx)
	if d == nil {
		return nil, ctx.Err()
	}
	if d.Err != nil {
		return nil, d.Err
	}
	return d.Compiled, nil
}
