package main

import (
	"errors"
	"os"

	"github.com/sirupsen/logrus"
)

func mainE() error {
	return errors.New("unimplemented")
}

func main() {
	if err := mainE(); err != nil {
		logrus.Error(err)
		os.Exit(1)
	}
}
