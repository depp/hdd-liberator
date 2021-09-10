package main

import (
	"context"
	"errors"
	"sync"

	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/compiler"
	"moria.us/js13k/build/project"
	"moria.us/js13k/build/watcher"

	pb "moria.us/js13k/proto/compiler"
)

var errBuildFailed = errors.New("build failed")

type buildState struct {
	err        error
	project    *project.Project
	diagnostic []*pb.Diagnostic
	code       []byte
	html       []byte
	sourcemap  []byte
}

func newBuildState(s *watcher.CodeState) *buildState {
	logrus.Infoln("Starting build.")
	if s == nil {
		return nil
	}
	d := buildState{
		err:     s.Err,
		project: s.Project,
	}
	if d.err != nil {
		if e, ok := s.Err.(*compiler.Error); ok {
			d.diagnostic = e.Diagnostics
		}
		logrus.Errorln("Build:", d.err)
		return &d
	}
	if c := s.Compo; c != nil {
		d.diagnostic = c.Diagnostics
		if len(s.Compo.MinifiedScript.Code) == 0 {
			d.err = errBuildFailed
			logrus.Errorln("Build:", d.err)
			return &d
		}
		d.code = s.Compo.MinifiedScript.Code
		hd, err := s.Compo.BuildHTML(&releaseMapURL)
		if err != nil {
			d.err = err
			logrus.Errorln("BuildHTML:", err)
			return &d
		}
		d.html = hd
		d.sourcemap = s.Compo.MinifiedScript.Code
		logrus.Infoln("Done building.")
	} else {
		logrus.Infoln("Loaded project.")
	}
	return &d
}

type code struct {
	lock      sync.RWMutex
	compo     *buildState
	listeners []chan<- *buildState
}

func (c *code) watch(ctx context.Context, ch <-chan *watcher.CodeState) {
	for {
		s, ok := <-ch
		if !ok {
			logrus.Fatalln("watch channel closed")
		}
		d := newBuildState(s)

		c.lock.Lock()
		c.compo = d
		ls := c.listeners
		var pos int
		for _, l := range ls {
			select {
			case l <- d:
				ls[pos] = l
				pos++
			default:
				close(l)
			}
		}
		c.listeners = ls[:pos]
		for ; pos < len(ls); pos++ {
			ls[pos] = nil
		}
		c.lock.Unlock()
	}
}

func (c *code) addListener(ch chan<- *buildState) *buildState {
	if ch == nil {
		panic("nil channel")
	}

	c.lock.Lock()
	d := c.compo
	c.listeners = append(c.listeners, ch)
	c.lock.Unlock()

	return d
}

func (c *code) removeListener(ch chan<- *buildState) {
	c.lock.Lock()
	for i, l := range c.listeners {
		if l == ch {
			c.listeners[i] = c.listeners[len(c.listeners)-1]
			c.listeners[len(c.listeners)-1] = nil
			c.listeners = c.listeners[:len(c.listeners)-1]
			close(ch)
		}
	}
	c.lock.Unlock()
}

func (c *code) getBuildState(ctx context.Context, f func(*buildState) bool) *buildState {
	c.lock.RLock()
	d := c.compo
	c.lock.RUnlock()

	if f(d) {
		return d
	}
	ch := make(chan *buildState, 1)

	c.lock.Lock()
	if d = c.compo; f(d) {
		c.lock.Unlock()
		return d
	}
	c.listeners = append(c.listeners, ch)
	c.lock.Unlock()
	defer c.removeListener(ch)

	for {
		select {
		case d = <-ch:
			if f(d) {
				return d
			}
			d = nil
		case <-ctx.Done():
			return nil
		}
	}
}

func (c *code) getProject(ctx context.Context) (*project.Project, error) {
	d := c.getBuildState(ctx, func(d *buildState) bool {
		return d != nil
	})
	if d == nil {
		return nil, ctx.Err()
	}
	if d.project != nil {
		return d.project, nil
	}
	if d.err != nil {
		return nil, d.err
	}
	panic("bad build result")
}

func (c *code) getBuild(ctx context.Context) (*buildState, error) {
	d := c.getBuildState(ctx, func(d *buildState) bool {
		return d != nil && (d.err != nil || d.html != nil)
	})
	if d == nil {
		return nil, ctx.Err()
	}
	return d, nil
}
