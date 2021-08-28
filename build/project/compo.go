package project

import (
	"archive/zip"
	"bytes"
	"context"
	"net/url"

	"golang.org/x/text/encoding/charmap"

	"moria.us/js13k/build/html"

	pb "moria.us/js13k/proto/compiler"
)

// TargetSize is the maximum permitted size of the zip file, in bytes, accodring
// to competition rules.
const TargetSize = 13 * 1024

// A CompoData contains the data and compiled JavaScript for a compo build.
type CompoData struct {
	Config      Config
	SourceMap   []byte
	Diagnostics []*pb.Diagnostic
	Code        []byte
}

// BuildHTML returns the HTML page.
//
// If sourceMapURL is non-nil, a link to the source map for the JavaScript code
// will be inserted. The URL should be nil for the submitted build.
func (d *CompoData) BuildHTML(sourceMapURL *url.URL) ([]byte, error) {
	var w html.Writer
	w.SetCharset(charmap.Windows1252)

	w.OpenTag("meta")
	w.Attr("charset", "l1")

	if d.Config.Title != "" {
		w.OpenTag("title")
		w.Text(d.Config.Title)
		w.CloseTag("title")
	}

	w.OpenTag("canvas")
	w.Attr("id", "g")
	w.Attr("style", "display:none")
	w.CloseTag("canvas")

	w.OpenTag("button")
	w.Attr("id", "b")
	w.Attr("style", "font-size:60")
	// U+25B6 black right-pointing triangle
	// U+FE0f variation selector 16 (previous character is emoji)
	w.Text("\u25b6\ufe0f")

	w.OpenTag("script")
	w.Attr("type", "module")
	w.Text(string(d.Code))
	if sourceMapURL != nil {
		w.Text("//# sourceMappingURL=")
		w.Text(sourceMapURL.String())
	}
	w.CloseTag("script")

	return w.Finish()
}

// BuildZip creates a zip file containing the final product.
func (d *CompoData) BuildZip(ctx context.Context) ([]byte, error) {
	h, err := d.BuildHTML(nil)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	f, err := z.CreateHeader(&zip.FileHeader{
		Name:     "index.html",
		Modified: d.Config.Timestamp,
	})
	if err != nil {
		return nil, err
	}
	if _, err := f.Write(h); err != nil {
		return nil, err
	}
	if err := z.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
