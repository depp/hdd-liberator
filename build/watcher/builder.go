package watcher

import (
	"context"
	"time"

	"moria.us/js13k/build/compiler"
)

const rebuildDelay = 100 * time.Millisecond

func build(ctx context.Context, out chan<- *CodeState, in <-chan *CodeState) error {
	var s *CodeState
	var delay delay
	var bresult chan *CodeState
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
			bresult = make(chan *CodeState, 1)
			cancel = cancelf
			go doBuild(ctx, &cm, bresult, s)
		}
	}
}

func doBuild(ctx context.Context, cm *compiler.Compiler, out chan<- *CodeState, s *CodeState) {
	defer close(out)
	p := s.Project
	if p == nil {
		panic("nil project")
	}
	d, err := p.CompileCompo(ctx, cm)
	if err != nil {
		out <- &CodeState{Err: err, Project: p}
	} else {
		out <- &CodeState{Project: p, Compo: d}
	}
}
