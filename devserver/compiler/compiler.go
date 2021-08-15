// Package compiler runs the JavaScript compiler.
package compiler

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"syscall"

	"golang.org/x/sys/unix"
)

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
	proc   *exec.Cmd
	sock   *os.File
	reader *bufio.Reader
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
	c.reader = bufio.NewReader(ss[0])
	ss[0] = nil
	return nil
}

func (c *Compiler) Compile() ([]byte, error) {
	if c.sock == nil {
		if err := c.start(); err != nil {
			return nil, err
		}
	}
	if _, err := c.sock.Write([]byte{'\n'}); err != nil {
		return nil, err
	}
	l, err := c.reader.ReadString('\n')
	if err != nil {
		return nil, err
	}
	l = l[:len(l)-1]
	x, err := strconv.ParseUint(string(l), 10, strconv.IntSize-1)
	if err != nil {
		return nil, fmt.Errorf("invalid message length: %v", err)
	}
	data := make([]byte, x)
	rem := data
	for len(rem) > 0 {
		n, err := c.reader.Read(rem)
		rem = rem[n:]
		if err != nil {
			if err == io.EOF && len(rem) == 0 {
				break
			}
			return nil, err
		}
	}
	return data, nil
}
