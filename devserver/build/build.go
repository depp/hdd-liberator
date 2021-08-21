package build

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/url"
	"path/filepath"

	"github.com/sirupsen/logrus"

	"moria.us/js13k/html"

	pb "moria.us/js13k/proto/compiler"
)

// A Config contains the project configuration.
type Config struct {
	Title string `json:"title"`
	Main  string `json:"main"`
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
		log.Warnf("missing 'title'")
	}
	if c.Main == "" {
		log.Warnf("missing 'main'")
	}
	return &p, nil
}

func (p *Project) BuildRequest() *pb.BuildRequest {
	return &pb.BuildRequest{
		File:            []string{p.Config.Main},
		BaseDirectory:   p.BaseDir,
		OutputSourceMap: "release.map",
	}
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
