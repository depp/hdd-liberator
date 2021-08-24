package main

import (
	"context"
	"errors"
	"io/ioutil"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/compiler"
	"moria.us/js13k/build/project"
)

func mainE() error {
	ctx := context.Background()
	baseDir := os.Getenv("BUILD_WORKSPACE_DIRECTORY")
	if baseDir == "" {
		return errors.New("BUILD_WORKSPACE_DIRECTORY is not set (this must be run from Bazel)")
	}
	p, err := project.Load(baseDir, "js13k.json")
	if err != nil {
		return err
	}
	if p.Config.Filename == "" {
		return errors.New("no zip filename")
	}
	var c compiler.Compiler
	defer c.Close()
	d, err := p.CompileCompo(ctx, &c)
	if err != nil {
		return err
	}
	z, err := d.BuildZip(ctx)
	if err != nil {
		return err
	}
	zpath := filepath.Join(baseDir, p.Config.Filename+".zip")
	if err := ioutil.WriteFile(zpath, z, 0666); err != nil {
		return err
	}
	logrus.Infoln("Output:", zpath)
	logrus.Infoln("Size:", len(z))
	n := len(z) - project.TargetSize
	if n <= 0 {
		logrus.Infof("Size OK: %d bytes free (%.1f%%)", -n, float64(-n*100)/project.TargetSize)
	} else {
		logrus.Errorf("Size over: %d bytes over (%.1f%%)", n, float64(n*100)/project.TargetSize)
	}
	return nil
}

func main() {
	if err := mainE(); err != nil {
		logrus.Error(err)
		os.Exit(1)
	}
}
