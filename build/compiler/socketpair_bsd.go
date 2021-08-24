// +build darwin

package compiler

import (
	"os"
	"strconv"
	"syscall"

	"golang.org/x/sys/unix"
)

func socketpair() (ss [2]*os.File, err error) {
	syscall.ForkLock.RLock()
	fds, err := unix.Socketpair(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
	if err != nil {
		syscall.ForkLock.RUnlock()
		return ss, err
	}
	syscall.CloseOnExec(fds[0])
	syscall.CloseOnExec(fds[1])
	syscall.ForkLock.RUnlock()

	for i, fd := range fds {
		ss[i] = os.NewFile(uintptr(fd), "sock"+strconv.Itoa(i))
	}
	return ss, nil
}
