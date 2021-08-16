// Package compiler runs the JavaScript compiler.
package compiler

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"syscall"

	"golang.org/x/sys/unix"
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

func socketpair() (ss [2]*os.File, err error) {
	fds, err := unix.Socketpair(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
	if err != nil {
		return ss, err
	}
	for i, fd := range fds {
		ss[i] = os.NewFile(uintptr(fd), "sock"+strconv.Itoa(i))
	}
	return ss, nil
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

func (c *Compiler) Compile(req *pb.BuildRequest) (*pb.BuildResponse, error) {
	if c.sock == nil {
		if err := c.start(); err != nil {
			return nil, err
		}
	}
	if err := c.writeMessage(req); err != nil {
		return nil, err
	}
	return c.readMessage()
}
