package project

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/embed"
	"moria.us/js13k/build/song"

	pb "moria.us/js13k/proto/compiler"
)

// A Compiler compiles JavaScript source code.
type Compiler interface {
	Compile(ctx context.Context, req *pb.BuildRequest) (*pb.BuildResponse, error)
}

func defineBoolean(name string, value bool) *pb.Define {
	return &pb.Define{
		Name:  name,
		Value: &pb.Define_Boolean{Boolean: value},
	}
}

// A Terser contains the configuration for running Terser.
type Terser struct {
	Compress string `json:"compress"`
}

// A Config contains the project configuration.
type Config struct {
	Title        string    `json:"title"`
	Filename     string    `json:"filename"`
	MainCompo    string    `json:"main.compo"`
	MainStandard string    `json:"main.standard"`
	SourceDir    string    `json:"srcDir"`
	Timestamp    time.Time `json:"timestamp"`
	Terser       *Terser   `json:"terser"`
}

// A Project is a JS13K project which can be built.
type Project struct {
	BaseDir string
	Config  Config
}

// Load loads a project with the given base directory and configuration
// file.
func Load(base, config string) (*Project, error) {
	p := Project{
		BaseDir: filepath.Clean(base),
	}
	data, err := ioutil.ReadFile(filepath.Join(base, config))
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	c := &p.Config
	if err := dec.Decode(c); err != nil {
		return nil, fmt.Errorf("invalid config %q: %v", config, err)
	}
	log := logrus.StandardLogger().WithField("config", config)
	if c.Title == "" {
		log.Warn("missing or empty 'title'")
	}
	if c.Filename == "" {
		log.Warn("missing or empty 'filename'")
	} else if !safeName.MatchString(c.Filename) {
		log.Warnf("invalid filename: %q", c.Filename)
		c.Filename = ""
	}
	if c.MainCompo == "" {
		log.Warn("missing or empty 'main.compo'")
	}
	if c.MainStandard == "" {
		log.Warn("missing or empty 'main.standard'")
	}
	if c.SourceDir == "" {
		log.Warn("missing or empty 'srcDir'")
	}
	return &p, nil
}

var (
	safeName   = regexp.MustCompile(`^[a-zA-Z0-9]+([-._][a-zA-Z0-9]+)*$`)
	sourceName = regexp.MustCompile(`^[a-zA-Z0-9]+([-._][a-zA-Z0-9]+)*\.js$`)
)

// IsSourceName returns true if the filename is the name of a source file.
func IsSourceName(name string) bool {
	return sourceName.MatchString(name) && !strings.HasSuffix(name, ".test.js")
}

func (p *Project) buildData(ctx context.Context) (string, error) {
	cd, err := song.Compile(ctx, filepath.Join(p.BaseDir, "music/songs.json"))
	if err != nil {
		return "", err
	}
	s, err := embed.Encode(cd.Data)
	if err != nil {
		return "", fmt.Errorf("encode: %v", err)
	}
	return s, nil
}

// listSources returns a list of all JavaScript source files which might be used
// to compile the game. This just lists all JavaScript source files in the
// source directory, the compiler or browser will figure out which ones to
// include based on the entry point.
func (p *Project) listSources() ([]string, error) {
	fs, err := ioutil.ReadDir(filepath.Join(p.BaseDir, p.Config.SourceDir))
	if err != nil {
		return nil, err
	}
	var srcs []string
	for _, f := range fs {
		if f.Mode().IsRegular() {
			if name := f.Name(); IsSourceName(name) {
				srcs = append(srcs, path.Join(p.Config.SourceDir, name))
			}
		}
	}
	return srcs, nil
}

func (p *Project) CompileOptimized(ctx context.Context, c Compiler) (*OptimizedData, error) {
	srcs, err := p.listSources()
	if err != nil {
		return nil, err
	}
	rsp, err := c.Compile(ctx, &pb.BuildRequest{
		File:            srcs,
		EntryPoint:      []string{path.Join(p.Config.SourceDir, p.Config.MainStandard)},
		BaseDirectory:   p.BaseDir,
		OutputSourceMap: "main.map",
		Define: []*pb.Define{
			defineBoolean("COMPO", false),
		},
	})
	if err != nil {
		return nil, err
	}
	return &OptimizedData{
		Config:      p.Config,
		Diagnostics: rsp.GetDiagnostic(),
		Script: ScriptData{
			Code:      rsp.GetCode(),
			SourceMap: rsp.GetSourceMap(),
		},
	}, nil
}

func (p *Project) CompileCompo(ctx context.Context, c Compiler) (*CompoData, error) {
	dd, err := p.buildData(ctx)
	if err != nil {
		return nil, err
	}
	srcs, err := p.listSources()
	if err != nil {
		return nil, err
	}
	rsp, err := c.Compile(ctx, &pb.BuildRequest{
		File:            srcs,
		EntryPoint:      []string{path.Join(p.Config.SourceDir, p.Config.MainCompo)},
		BaseDirectory:   p.BaseDir,
		OutputSourceMap: "main.map",
		Define: []*pb.Define{
			defineBoolean("COMPO", true),
		},
	})
	if err != nil {
		return nil, err
	}
	cd := CompoData{
		Config:      p.Config,
		Data:        dd,
		Diagnostics: rsp.GetDiagnostic(),
	}
	scr := ScriptData{
		Code:      rsp.GetCode(),
		SourceMap: rsp.GetSourceMap(),
	}
	if len(scr.Code) != 0 {
		mscr, err := p.terser(ctx, scr)
		if err != nil {
			return nil, err
		}
		cd.CompiledScript = scr
		cd.MinifiedScript = mscr
	}
	return &cd, nil
}

// A ScriptData contains JavaScript source file and its source map.
type ScriptData struct {
	Code      []byte
	SourceMap []byte
}

// An OptimizedData contains the data and compiled JavaScript for an optimized
// (but non-competition) build.
type OptimizedData struct {
	Config      Config
	Diagnostics []*pb.Diagnostic
	Script      ScriptData
}
