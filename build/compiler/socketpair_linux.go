// +build linux

package compiler

import (
	"os"
	"strconv"
	"syscall"

	"golang.org/x/sys/unix"
)

func socketpair() (ss [2]*os.File, err error) {
	fds, err := unix.Socketpair(syscall.AF_UNIX, syscall.SOCK_STREAM|syscall.SOCK_CLOEXEC, 0)
	if err != nil {
		return ss, err
	}
	for i, fd := range fds {
		ss[i] = os.NewFile(uintptr(fd), "sock"+strconv.Itoa(i))
	}
	return ss, nil
}
