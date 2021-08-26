package main

import (
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/midi"
)

func dumpFile(name string) error {
	data, err := ioutil.ReadFile(name)
	if err != nil {
		return err
	}
	f, err := midi.Parse(data)
	if err != nil {
		return err
	}

	fmt.Printf("head: %+v\n", &f.Head)
	for i, trk := range f.Tracks {
		fmt.Println("Track:", i)
		evs := trk.Events()
		for {
			e, err := evs.Next()
			if err != nil {
				if err == io.EOF {
					break
				}
				return err
			}
			fmt.Print("  ", e.String(), "\n")
		}
	}
	return nil
}

func mainE() error {
	if len(os.Args) <= 1 {
		return errors.New("usage: midi <file>...")
	}
	wd := os.Getenv("BUILD_WORKING_DIRECTORY")
	fmt.Println("args", os.Args)
	for _, arg := range os.Args[1:] {
		fmt.Println(arg)
		fname := arg
		if !filepath.IsAbs(fname) && wd != "" {
			fname = filepath.Join(wd, fname)
		}
		if err := dumpFile(fname); err != nil {
			logrus.Errorf("file %q: %v", arg, err)
		}
	}
	return nil
}

func main() {
	if err := mainE(); err != nil {
		logrus.Error(err)
		os.Exit(1)
	}
}
