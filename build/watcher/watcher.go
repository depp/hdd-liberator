package watcher

import (
	"context"
	"errors"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"

	"moria.us/js13k/build/compiler"
	"moria.us/js13k/build/project"

	pb "moria.us/js13k/proto/compiler"
)

type bstate uint32

const (
	bstateNone bstate = iota
	bstateBuilding
	bstateCanceled
)

const rebuildDelay = 100 * time.Millisecond

type State struct {
	Err         error
	Diagnostics []*pb.Diagnostic
}

type watcher struct {
	base      string
	config    string
	output    chan<- State
	watcher   *fsnotify.Watcher
	delay     delay
	srcdir    string
	project   *project.Project
	bstate    bstate
	wantbuild bool

	cancelfunc     context.CancelFunc
	compiler       compiler.Compiler
	compilerOutput chan State
}

func Watch(ctx context.Context, baseDir, config string) (<-chan State, error) {
	ch := make(chan State, 1)
	w := watcher{
		base:           baseDir,
		config:         config,
		output:         ch,
		compilerOutput: make(chan State, 1),
	}
	go w.watch(ctx)
	return ch, nil
}

func (w *watcher) watch(ctx context.Context) {
	defer close(w.output)
	if err := w.watchFunc(ctx); err != nil {
		w.output <- State{Err: err}
	}
}

func (w *watcher) watchFunc(ctx context.Context) error {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer fw.Close()
	w.watcher = fw
	cfgpath := filepath.Join(w.base, w.config)
	if err := fw.Add(cfgpath); err != nil {
		return err
	}
	if err := w.loadProject(ctx); err != nil {
		return err
	}
	for {
		select {
		case ev, ok := <-fw.Events:
			if !ok {
				return errors.New("watcher channel closed")
			}
			// Project config changed.
			if ev.Name == cfgpath {
				if err := w.loadProject(ctx); err != nil {
					return err
				}
			}
			// Source file changed.
			if w.project != nil {
				if filepath.Dir(ev.Name) == w.srcdir && project.IsSourceName(filepath.Base(ev.Name)) {
					w.cancelBuild()
					w.triggerBuild()
				}
			}
		case err, ok := <-fw.Errors:
			if !ok {
				return errors.New("watcher channel closed")
			}
			return err
		case <-w.delay.channel:
			w.delay.channel = nil
			if w.wantbuild && w.bstate == bstateNone {
				if rem := w.delay.remainingTime(); rem > 0 {
					w.delay.trigger(rebuildDelay)
				} else {
					w.startBuild(ctx)
				}
			}
		case r := <-w.compilerOutput:
			if w.bstate == bstateBuilding {
				w.output <- r
			}
			w.bstate = bstateNone
			if w.wantbuild {
				w.startBuild(ctx)
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (w *watcher) loadProject(ctx context.Context) error {
	w.cancelBuild()
	p, err := project.Load(w.base, w.config)
	if err != nil {
		w.project = nil
		w.output <- State{Err: err}
		return nil
	}
	if srcdir := filepath.Join(w.base, p.Config.SourceDir); w.srcdir != srcdir {
		if w.srcdir != "" {
			if err := w.watcher.Remove(w.srcdir); err != nil {
				return err
			}
		}
		if err := w.watcher.Add(srcdir); err != nil {
			return err
		}
		w.srcdir = srcdir
	}
	w.project = p
	w.triggerBuild()
	return nil
}

func (w *watcher) cancelBuild() {
	switch w.bstate {
	case bstateNone, bstateCanceled:
	case bstateBuilding:
		w.cancelfunc()
		w.cancelfunc = nil
		w.bstate = bstateCanceled
	default:
		panic("unknown state")
	}
	w.wantbuild = false
}

func (w *watcher) triggerBuild() {
	if w.project == nil {
		panic("nil project")
	}
	w.delay.trigger(rebuildDelay)
	w.wantbuild = true
}

func (w *watcher) startBuild(ctx context.Context) {
	if w.bstate != bstateNone {
		panic("invalid state")
	}
	if w.project == nil {
		panic("nil project")
	}
	ctx, cancel := context.WithCancel(ctx)
	go w.build(ctx, w.project)
	w.cancelfunc = cancel
	w.bstate = bstateBuilding
	w.wantbuild = false
}

func (w *watcher) build(ctx context.Context, p *project.Project) {
	var s State
	d, err := p.CompileCompo(ctx, &w.compiler)
	if err != nil {
		s.Err = err
		if e, ok := err.(*compiler.Error); ok {
			s.Diagnostics = e.Diagnostics
		}
	} else {
		s.Diagnostics = d.Diagnostics
	}
	w.compilerOutput <- s
}
