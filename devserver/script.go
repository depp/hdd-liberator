package main

import (
	"context"
	"sync"

	"moria.us/js13k/devserver/compiler"
)

type script struct {
	lock     sync.Mutex
	compiler compiler.Compiler
}

func (s *script) build(ctx context.Context) ([]byte, error) {
	s.lock.Lock()
	defer s.lock.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return s.compiler.Compile()
}
