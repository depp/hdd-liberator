package watcher

import (
	"context"
	"time"

	"moria.us/js13k/build/compiler"
)

const rebuildDelay = 100 * time.Millisecond

func build(ctx context.Context, out chan<- *State, in <-chan *State) error {
	var s *State
	var delay delay
	var bresult chan *State
	var cancel context.CancelFunc
	var wantbuild bool
	var cm compiler.Compiler
	defer cm.Close()
	for {
		select {
		case s = <-in:
			// Project state changed. Cancel any pending build.
			if cancel != nil {
				cancel()
				cancel = nil
			}
			// wantbuild will be set after the delay.
			wantbuild = false
			out <- s
			if s != nil && s.Err == nil {
				// Project filed loaded, trigger build.
				delay.trigger(rebuildDelay)
			}
		case <-delay.channel:
			// Delay has passed for triggering build. The delay is here to allow
			// multiple notifications to arrive from upstream before triggering
			// a build... this might happen if an editor saves multiple files at
			// the same time, or if git checkout is run. This hopefully avoids
			// rebuilding twice in this scenario.
			delay.channel = nil
			if s != nil && s.Err == nil {
				if rem := delay.remainingTime(); rem > 0 {
					delay.trigger(rem)
				} else {
					wantbuild = true
				}
			}
		case bs, ok := <-bresult:
			// Build has finished.
			if ok {
				if cancel != nil {
					out <- bs
				}
			} else {
				bresult = nil
				if cancel != nil {
					cancel()
					cancel = nil
				}
			}
		case <-ctx.Done():
			return ctx.Err()
		}
		if wantbuild && bresult == nil {
			wantbuild = false
			ctx, cancelf := context.WithCancel(ctx)
			bresult = make(chan *State, 1)
			cancel = cancelf
			go doBuild(ctx, &cm, bresult, s)
		}
	}
}

func doBuild(ctx context.Context, cm *compiler.Compiler, out chan<- *State, s *State) {
	defer close(out)
	p := s.Project
	if p == nil {
		panic("nil project")
	}
	d, err := p.CompileCompo(ctx, cm)
	if err != nil {
		out <- &State{Err: err, Project: p}
		return
	}
	out <- &State{Project: p, Compo: d}
}
