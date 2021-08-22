package build

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/sirupsen/logrus"

	"moria.us/js13k/html"

	pb "moria.us/js13k/proto/compiler"
)

func defineBoolean(name string, value bool) *pb.Define {
	return &pb.Define{
		Name:  name,
		Value: &pb.Define_Boolean{Boolean: value},
	}
}

// A Config contains the project configuration.
type Config struct {
	Title        string   `json:"title"`
	MainCompo    string   `json:"main.compo"`
	MainStandard string   `json:"main.standard"`
	SourceDirs   []string `json:"srcDirs"`
}

// A Project is a JS13K project which can be built.
type Project struct {
	BaseDir string
	Config  Config
}

// LoadProject loads a project with the given base directory and configuration
// file.
func LoadProject(base, config string) (*Project, error) {
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
		log.Warnf("missing or empty 'title'")
	}
	if c.MainCompo == "" {
		log.Warnf("missing or empty 'main.compo'")
	}
	if c.MainStandard == "" {
		log.Warnf("missing or empty 'main.standard'")
	}
	if len(c.SourceDirs) == 0 {
		log.Warnf("missing or empty 'srcDir'")
	}
	return &p, nil
}

var sourceName = regexp.MustCompile("^[a-zA-Z0-9]+([-._][a-zA-Z0-9]+)*$")

func listSources(srcs []string, absDir, relDir string, depth int) ([]string, error) {
	const maxDepth = 10
	if depth > maxDepth {
		return nil, fmt.Errorf("source directory too deep: %q", relDir)
	}
	fs, err := ioutil.ReadDir(absDir)
	if err != nil {
		return nil, err
	}
	for _, f := range fs {
		name := f.Name()
		if sourceName.MatchString(name) {
			switch f.Mode() & os.ModeType {
			case 0:
				if strings.HasSuffix(name, ".js") {
					srcs = append(srcs, path.Join(relDir, name))
				}
			case os.ModeDir:
				srcs, err = listSources(srcs, filepath.Join(absDir, name), path.Join(relDir, name), depth+1)
				if err != nil {
					return nil, err
				}
			}
		}
	}
	return srcs, nil
}

func (p *Project) BuildRequest() (*pb.BuildRequest, error) {
	var srcs []string
	for _, d := range p.Config.SourceDirs {
		var err error
		srcs, err = listSources(srcs, filepath.Join(p.BaseDir, d), d, 0)
		if err != nil {
			return nil, err
		}
	}
	return &pb.BuildRequest{
		File:            srcs,
		EntryPoint:      []string{p.Config.MainCompo},
		BaseDirectory:   p.BaseDir,
		OutputSourceMap: "main.map",
		Define: []*pb.Define{
			defineBoolean("COMPO", true),
		},
	}, nil
}

func (p *Project) BuildHTML(ctx context.Context, rsp *pb.BuildResponse, sourceMapURL *url.URL) ([]byte, error) {
	code := rsp.GetCode()
	var w html.Writer

	w.OpenTag("meta")
	w.Attr("charset", "UTF-8")

	w.OpenTag("title")
	w.Text(p.Config.Title)
	w.CloseTag("title")

	w.OpenTag("canvas")
	w.Attr("id", "g")
	w.CloseTag("canvas")

	w.OpenTag("script")
	w.Attr("type", "module")
	w.Text(string(code))
	if sourceMapURL != nil {
		w.Text("//# sourceMappingURL=")
		w.Text(sourceMapURL.String())
	}
	w.CloseTag("script")

	return w.Finish()
}
