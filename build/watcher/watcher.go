package watcher

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/project"
	"moria.us/js13k/build/song"
)

const loadProjectDelay = 10 * time.Millisecond

// A CodeState contains the state of the project code (JavaScript).
type CodeState struct {
	Err     error
	Project *project.Project
	Compo   *project.CompoData
}

func Watch(ctx context.Context, baseDir, config string) (<-chan *CodeState, <-chan *SongState, error) {
	codesrc := make(chan *CodeState, 1)
	codeout := make(chan *CodeState, 1)
	songsrc := make(chan struct{}, 1)
	songout := make(chan *SongState, 1)
	songdir := filepath.Join(baseDir, "music")
	w := watcher{
		base:    baseDir,
		config:  config,
		songdir: songdir,
	}
	go func() {
		defer func() {
			close(codesrc)
			close(songsrc)
		}()
		err := w.watch(ctx, codesrc, songsrc)
		logrus.Fatalln("w.watch:", err)
	}()
	go func() {
		defer close(codeout)
		err := build(ctx, codeout, codesrc)
		logrus.Fatalln("build:", err)
	}()
	go func() {
		defer close(songout)
		err := buildsong(ctx, songdir, songout, songsrc)
		logrus.Fatalln("buildsong:", err)
	}()
	return codeout, songout, nil
}

// A watcher watches the project and source files.
type watcher struct {
	base    string
	config  string
	songdir string
	watcher *fsnotify.Watcher
	srcdir  string
}

func (w *watcher) watch(ctx context.Context, codesrc chan<- *CodeState, songsrc chan<- struct{}) error {
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
	if err := fw.Add(w.songdir); err != nil {
		return err
	}
	s, err := w.load()
	if err != nil {
		return err
	}
	if s != nil {
		codesrc <- s
	}
	var delay delay
	for {
		select {
		case ev, ok := <-fw.Events:
			if !ok {
				return errors.New("watcher channel closed")
			}
			dir := filepath.Dir(ev.Name)
			base := filepath.Base(ev.Name)
			// Project config changed.
			if ev.Name == cfgpath {
				if s != nil {
					s = nil
					codesrc <- nil
				}
				delay.trigger(loadProjectDelay)
			}
			// Source file changed.
			if s != nil && s.Err == nil {
				if dir == w.srcdir && project.IsSourceName(base) {
					codesrc <- s
				}
			}
			if dir == w.songdir &&
				(strings.HasSuffix(base, ".txt") ||
					base == songList ||
					base == song.CodeFile) {
				songsrc <- struct{}{}
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
				codesrc <- s
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (w *watcher) load() (*CodeState, error) {
	p, err := project.Load(w.base, w.config)
	if err != nil {
		return &CodeState{Err: err}, nil
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
	return &CodeState{Project: p}, nil
}
