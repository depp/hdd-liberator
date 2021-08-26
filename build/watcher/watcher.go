package watcher

import (
	"context"
	"errors"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/project"
)

const loadProjectDelay = 10 * time.Millisecond

// A State contains the state of the project.
type State struct {
	Err     error
	Project *project.Project
	Compo   *project.CompoData
}

func Watch(ctx context.Context, baseDir, config string) (<-chan *State, error) {
	pch := make(chan *State, 1)
	bch := make(chan *State, 1)
	w := watcher{
		base:   baseDir,
		config: config,
	}
	go func() {
		defer close(pch)
		err := w.watch(ctx, pch)
		logrus.Fatalln("w.watch:", err)
	}()
	go func() {
		defer close(bch)
		err := build(ctx, bch, pch)
		logrus.Fatalln("build:", err)
	}()
	return bch, nil
}

// A watcher watches the project and source files.
type watcher struct {
	base    string
	config  string
	watcher *fsnotify.Watcher
	srcdir  string
}

func (w *watcher) watch(ctx context.Context, output chan<- *State) error {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer fw.Close()
	w.watcher = fw
	cfgpath := filepath.Join(w.base, w.config)
	if err := fw.Add(filepath.Dir(cfgpath)); err != nil {
		return err
	}
	s, err := w.load()
	if err != nil {
		return err
	}
	if s != nil {
		output <- s
	}
	var delay delay
	for {
		select {
		case ev, ok := <-fw.Events:
			if !ok {
				return errors.New("watcher channel closed")
			}
			// Project config changed.
			if ev.Name == cfgpath {
				if s != nil {
					s = nil
					output <- nil
				}
				delay.trigger(loadProjectDelay)
			}
			// Source file changed.
			if s != nil && s.Err == nil {
				if filepath.Dir(ev.Name) == w.srcdir && project.IsSourceName(filepath.Base(ev.Name)) {
					output <- s
				}
			}
		case err, ok := <-fw.Errors:
			if !ok {
				return errors.New("watcher channel closed")
			}
			return err
		case <-delay.channel:
			delay.channel = nil
			if rem := delay.remainingTime(); rem > 0 {
				delay.trigger(rem)
			} else {
				s, err = w.load()
				if err != nil {
					return err
				}
				output <- s
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (w *watcher) load() (*State, error) {
	p, err := project.Load(w.base, w.config)
	if err != nil {
		return &State{Err: err}, nil
	}
	if srcdir := filepath.Join(w.base, p.Config.SourceDir); w.srcdir != srcdir {
		if w.srcdir != "" {
			if err := w.watcher.Remove(w.srcdir); err != nil {
				return nil, err
			}
		}
		if err := w.watcher.Add(srcdir); err != nil {
			return nil, err
		}
		w.srcdir = srcdir
	}
	return &State{Project: p}, nil
}
