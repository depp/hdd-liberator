package main

import (
	"context"
	"sort"
	"strconv"
	"sync"

	"github.com/sirupsen/logrus"
	"moria.us/js13k/devserver/compiler"

	pb "moria.us/js13k/proto/compiler"
)

type buildError struct {
	diagnostics []*pb.Diagnostic
}

func (e *buildError) Error() string { return "build failed" }

type diagnostics []*pb.Diagnostic

func (s diagnostics) Len() int { return len(s) }
func (s diagnostics) Less(i, j int) bool {
	x := s[i]
	y := s[j]
	if x.File != y.File {
		return x.File < y.File
	}
	if x.Line != y.Line {
		return x.Line < y.Line
	}
	return x.Column < y.Column
}
func (s diagnostics) Swap(i, j int) { s[i], s[j] = s[j], s[i] }

type script struct {
	lock     sync.Mutex
	compiler compiler.Compiler
}

func (s *script) compile(ctx context.Context, req *pb.BuildRequest) (*pb.BuildResponse, error) {
	s.lock.Lock()
	defer s.lock.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return s.compiler.Compile(&pb.BuildRequest{
		File: []string{"demo/main.js"},
	})
}

func (s *script) build(ctx context.Context) ([]byte, error) {
	rsp, err := s.compile(ctx, &pb.BuildRequest{
		File: []string{"demo/main.js"},
	})
	if err != nil {
		return nil, err
	}
	var ds diagnostics
	if rds := rsp.GetDiagnostic(); len(rds) > 0 {
		ds = make(diagnostics, len(rds))
		copy(ds, rds)
		sort.Sort(ds)
	}
	var haserr bool
	for _, d := range ds {
		if d.GetSeverity() == pb.Diagnostic_ERROR {
			haserr = true
			break
		}
	}
	code := rsp.GetCode()
	if len(code) == 0 && !haserr {
		ds = append(ds, &pb.Diagnostic{
			Severity: pb.Diagnostic_ERROR,
			Message:  "Empty script output.",
		})
		haserr = true
	}
	log := logrus.StandardLogger()
	for _, d := range ds {
		level := logrus.ErrorLevel
		switch d.GetSeverity() {
		case pb.Diagnostic_WARNING:
			level = logrus.WarnLevel
		case pb.Diagnostic_NOTICE:
			level = logrus.InfoLevel
		}
		msg := d.GetMessage()
		if f := d.GetFile(); f != "" {
			if n := d.GetLine(); n != 0 {
				msg = f + ":" + strconv.FormatUint(uint64(n), 10) + ":" +
					strconv.FormatUint(uint64(d.GetColumn()), 10) + ": " + msg
			} else {
				msg = f + ": " + msg
			}
		}
		log.Log(level, msg)
	}
	if haserr {
		return nil, &buildError{ds}
	}
	return code, nil
}
