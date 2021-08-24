// Package compiler runs the JavaScript compiler.
package compiler

import (
	"context"
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"sync"

	"github.com/sirupsen/logrus"
	"google.golang.org/protobuf/proto"

	pb "moria.us/js13k/proto/compiler"
)

const maxMessageSize = 64 * 1024 * 1024

func ceilPow2(x int) int {
	x -= 1
	x |= x >> 1
	x |= x >> 2
	x |= x >> 4
	x |= x >> 8
	x |= x >> 16
	x |= x >> 32
	return x
}

// A Compiler compiles JavaScript code.
type Compiler struct {
	proc *exec.Cmd
	sock *os.File
	buf  []byte
}

func (c *Compiler) getBuf(n int) ([]byte, error) {
	if n > maxMessageSize {
		return nil, fmt.Errorf("buffer size too large: %d", n)
	}
	buf := c.buf
	if n > len(buf) {
		c.buf = nil
		buf = nil
		buf = make([]byte, ceilPow2(n))
		c.buf = buf
	}
	return buf, nil
}

// Close shuts down the compiler.
func (c *Compiler) Close() {
	if c.sock != nil {
		c.sock.Close()
		c.sock = nil
	}
	if c.proc != nil {
		c.proc.Wait()
		c.proc = nil
	}
}

func (c *Compiler) start() error {
	ss, err := socketpair()
	if err != nil {
		return err
	}
	defer func() {
		for _, s := range ss {
			s.Close()
		}
	}()
	proc := exec.Command("java/compiler")
	proc.Stdin = ss[1]
	proc.Stdout = ss[1]
	proc.Stderr = os.Stderr
	if err := proc.Start(); err != nil {
		return err
	}
	c.proc = proc
	c.sock = ss[0]
	ss[0] = nil
	return nil
}

func (c *Compiler) writeMessage(msg *pb.BuildRequest) error {
	buf := append(c.buf[:0], 0, 0, 0, 0)
	buf, err := proto.MarshalOptions{}.MarshalAppend(buf, msg)
	if err != nil {
		return err
	}
	c.buf = buf[:0]
	binary.BigEndian.PutUint32(buf, uint32(len(buf)-4))
	for len(buf) > 0 {
		n, err := c.sock.Write(buf)
		if err != nil {
			return err
		}
		buf = buf[n:]
	}
	return nil
}

func (c *Compiler) readMessage() (*pb.BuildResponse, error) {
	buf := append(c.buf[:0], 0, 0, 0, 0)
	rem := buf
	for len(rem) > 0 {
		n, err := c.sock.Read(rem)
		if err != nil {
			return nil, err
		}
		rem = rem[n:]
	}
	n := int(binary.BigEndian.Uint32(buf))
	if n > maxMessageSize {
		return nil, fmt.Errorf("message size is too large: %d", n)
	}
	buf = buf[:cap(buf)]
	if n > len(buf) {
		buf = append(buf, make([]byte, n-len(buf))...)
		c.buf = buf
	} else {
		buf = buf[:n]
	}
	rem = buf
	for len(rem) > 0 {
		n, err := c.sock.Read(rem)
		if err != nil {
			return nil, err
		}
		rem = rem[n:]
	}
	var msg pb.BuildResponse
	if err := proto.Unmarshal(buf, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

// Compile compiles JavaScript code and returns the result. Compilation errors
// are returned as the Error type.
func (c *Compiler) Compile(_ context.Context, req *pb.BuildRequest) (*pb.BuildResponse, error) {
	if c.sock == nil {
		if err := c.start(); err != nil {
			return nil, err
		}
	}
	if err := c.writeMessage(req); err != nil {
		return nil, err
	}
	rsp, err := c.readMessage()
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
	if len(rsp.GetCode()) == 0 && !haserr {
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
		return nil, &Error{ds}
	}
	return rsp, nil
}

// =============================================================================

type Locked struct {
	lock     sync.Mutex
	compiler Compiler
}

func (c *Locked) Compile(ctx context.Context, req *pb.BuildRequest) (*pb.BuildResponse, error) {
	c.lock.Lock()
	defer c.lock.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return c.compiler.Compile(ctx, req)
}

// =============================================================================

// An Error is a compilation error.
type Error struct {
	Diagnostics []*pb.Diagnostic
}

func (e *Error) Error() string { return "build failed" }

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
