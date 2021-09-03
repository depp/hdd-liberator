package watcher

import (
	"context"
	"errors"
	"path/filepath"

	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/song"
)

const songList = "songs.json"

type SongState struct {
	Err      error
	Compiled *song.Compiled
}

func buildsong(ctx context.Context, songDir string, songout chan<- *SongState, songsrc <-chan struct{}) error {
	spath := filepath.Join(songDir, songList)
	var delay delay
	var sresult chan *SongState
	var cancel context.CancelFunc
	var wantbuild bool = true
	for {
		if wantbuild && sresult == nil {
			// logrus.Infoln("STARTING MUSIC BUILD")
			wantbuild = false
			ctx, cancelf := context.WithCancel(ctx)
			sresult = make(chan *SongState, 1)
			cancel = cancelf
			go doBuildSong(ctx, spath, sresult)
		}
		select {
		case _, ok := <-songsrc:
			if !ok {
				return errors.New("channel closed")
			}
			if cancel != nil {
				cancel()
				cancel = nil
				// logrus.Infoln("canceling music build")
			}
			delay.trigger(rebuildDelay)
		case <-delay.channel:
			delay.channel = nil
			if rem := delay.remainingTime(); rem > 0 {
				delay.trigger(rem)
			} else {
				wantbuild = true
			}
		case s, ok := <-sresult:
			if ok {
				if cancel != nil {
					songout <- s
				}
			} else {
				sresult = nil
				if cancel != nil {
					cancel()
					cancel = nil
				}
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func doBuildSong(ctx context.Context, spath string, out chan<- *SongState) {
	defer close(out)
	cd, err := song.Compile(ctx, spath)
	if err != nil {
		logrus.Errorln("Music:", err)
		out <- &SongState{Err: err}
	} else {
		out <- &SongState{Compiled: cd}
	}
}
