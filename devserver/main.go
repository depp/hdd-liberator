package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/sirupsen/logrus"
	"github.com/spf13/pflag"

	"moria.us/js13k/html"

	pb "moria.us/js13k/proto/compiler"
)

const (
	htmlType = "text/html; charset=UTF-8"
	textType = "text/plain; charset=UTF-8"
)

// workspaceRoot is the path root workspace directory.
var workspaceRoot string

type contextKey struct{}

func (contextKey) String() string {
	return "devserver context key"
}

type handler struct {
	script             script
	statusTemplate     cachedTemplate
	buildErrorTemplate cachedTemplate
	releaseMap         sourcemap
}

func loadTemplate(name string) (*template.Template, error) {
	return template.ParseFiles(filepath.Join(workspaceRoot, "devserver", name))
}

func (h *handler) init() {
	dir := filepath.Join(workspaceRoot, "devserver")
	h.statusTemplate.filename = filepath.Join(dir, "status.gohtml")
	h.buildErrorTemplate.filename = filepath.Join(dir, "build_error.gohtml")
}

func getHandler(ctx context.Context) *handler {
	val := ctx.Value(contextKey{})
	if val == nil {
		panic("missing context key")
	}
	v, ok := val.(*handler)
	if !ok {
		panic("context key has wrong value")
	}
	return v
}

func logResponse(r *http.Request, status int, msg string) {
	if status >= 400 {
		if msg == "" {
			msg = http.StatusText(status)
		}
		logrus.Errorln(status, r.URL, msg)
	} else {
		logrus.Infoln(status, r.URL)
	}
}

func (h *handler) serveStatus(w http.ResponseWriter, r *http.Request, status int, msg string) {
	var b bytes.Buffer
	type tdata struct {
		Status     int
		StatusText string
		Message    string
	}
	d := tdata{
		Status:     status,
		StatusText: http.StatusText(status),
		Message:    msg,
	}
	ctype := htmlType
	if err := h.statusTemplate.execute(&b, &d); err != nil {
		logrus.Errorln("statusTemplate.Execute:", err)
		b.Reset()
		ctype = textType
		fmt.Fprintf(&b, "%d %s\n%s\n", d.Status, d.StatusText, d.Message)
	}
	hdr := w.Header()
	hdr.Set("Content-Type", ctype)
	hdr.Set("Content-Length", strconv.Itoa(b.Len()))
	hdr.Set("Cache-Control", "no-cache")
	w.WriteHeader(status)
	w.Write(b.Bytes())
}

func (h *handler) serveError(w http.ResponseWriter, r *http.Request, a ...interface{}) {
	const status = http.StatusInternalServerError
	msg := fmt.Sprint(a...)
	logResponse(r, status, msg)
	h.serveStatus(w, r, status, msg)
}

func (h *handler) serveErrorf(w http.ResponseWriter, r *http.Request, format string, a ...interface{}) {
	const status = http.StatusInternalServerError
	msg := fmt.Sprintf(format, a...)
	logResponse(r, status, msg)
	h.serveStatus(w, r, status, msg)
}

func serveKnownFile(w http.ResponseWriter, r *http.Request, filename string) {
	ctx := r.Context()
	h := getHandler(ctx)
	fp, err := os.Open(filepath.Join(workspaceRoot, filename))
	if err != nil {
		h.serveError(w, r, err)
		return
	}
	defer fp.Close()
	st, err := fp.Stat()
	if err != nil {
		h.serveError(w, r, err)
		return
	}
	logResponse(r, http.StatusOK, "")
	hdr := w.Header()
	hdr.Set("Cache-Control", "no-cache")
	http.ServeContent(w, r, filename, st.ModTime(), fp)
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	serveKnownFile(w, r, "demo/index.html")
}

func serveScript(w http.ResponseWriter, r *http.Request) {
	serveKnownFile(w, r, "demo/main.js")
}

func serveFavicon(w http.ResponseWriter, r *http.Request) {
	serveKnownFile(w, r, "favicon.ico")
}

func (h *handler) buildRelease(ctx context.Context) ([]byte, error) {
	data, sm, err := h.script.build(ctx)
	if err != nil {
		return nil, err
	}
	var smURL *url.URL
	if q := h.releaseMap.set(sm); q != nil {
		smURL = &url.URL{Path: "release.map", RawQuery: q.Encode()}
	}

	var w html.Writer

	w.OpenTag("meta")
	w.Attr("charset", "UTF-8")

	w.OpenTag("title")
	w.Text("JS13K Demo")
	w.CloseTag("title")

	w.OpenTag("canvas")
	w.Attr("id", "g")
	w.CloseTag("canvas")

	w.OpenTag("script")
	w.Attr("type", "module")
	w.Text(string(data))
	if smURL != nil {
		w.Text("//# sourceMappingURL=")
		w.Text(smURL.String())
	}
	w.CloseTag("script")

	return w.Finish()
}

func (h *handler) serveBuildError(w http.ResponseWriter, r *http.Request, e *buildError) {
	var buf bytes.Buffer
	type edata struct {
		Diagnostics []*pb.Diagnostic
	}
	if err := h.buildErrorTemplate.execute(&buf, &edata{
		Diagnostics: e.diagnostics,
	}); err != nil {
		h.serveErrorf(w, r, "buildErrorTemplate.Execute: %v", err)
		return
	}
	logResponse(r, http.StatusInternalServerError, "Build failed")
	hdr := w.Header()
	hdr.Set("Content-Type", htmlType)
	hdr.Set("Content-Length", strconv.Itoa(buf.Len()))
	w.Write(buf.Bytes())
}

func serveRelease(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h := getHandler(ctx)
	data, err := h.buildRelease(ctx)
	if err != nil {
		if e, ok := err.(*buildError); ok {
			h.serveBuildError(w, r, e)
		} else {
			h.serveErrorf(w, r, "Could not build: %v", err)
		}
		return
	}
	logResponse(r, http.StatusOK, "")
	hdr := w.Header()
	hdr.Set("Content-Type", htmlType)
	hdr.Set("Content-Length", strconv.Itoa(len(data)))
	hdr.Set("Cache-Control", "no-cache")
	w.Write(data)
}

func serveReleaseMap(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h := getHandler(ctx)
	h.releaseMap.serve(h, w, r)
}

func (h *handler) serveNotFound(w http.ResponseWriter, r *http.Request) {
	logResponse(r, http.StatusNotFound, "")
	h.serveStatus(w, r, http.StatusNotFound, fmt.Sprintf("Page not found: %q", r.URL))
}

func serveNotFound(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h := getHandler(ctx)
	h.serveNotFound(w, r)
}

var safePath = regexp.MustCompile(
	"^[a-zA-Z0-9][-._a-zA-Z0-9]*(?:/[a-zA-Z0-9][-._a-zA-Z0-9]*)*$")

func serveStatic(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h := getHandler(ctx)
	rctx := chi.RouteContext(ctx)
	name := rctx.URLParam("*")
	if !safePath.MatchString(name) {
		h.serveNotFound(w, r)
		return
	}
	fp, err := os.Open(filepath.Join(workspaceRoot, "devserver", "static", name))
	if err != nil {
		if os.IsNotExist(err) {
			h.serveNotFound(w, r)
		} else {
			h.serveError(w, r, err)
		}
		return
	}
	defer fp.Close()
	st, err := fp.Stat()
	if err != nil {
		h.serveError(w, r, err)
		return
	}
	logResponse(r, http.StatusOK, "")
	hdr := w.Header()
	hdr.Set("Cache-Control", "no-cache")
	http.ServeContent(w, r, name, st.ModTime(), fp)
}

func mainE() error {
	fHost := pflag.String("host", "localhost", "host to serve from")
	fPort := pflag.Int("port", 9013, "port to serve from")
	pflag.Parse()
	if args := pflag.Args(); len(args) != 0 {
		return fmt.Errorf("unexpected argument: %q", args[0])
	}

	workspaceRoot = os.Getenv("BUILD_WORKSPACE_DIRECTORY")
	if workspaceRoot == "" {
		return errors.New("BUILD_WORKSPACE_DIRECTORY is not set (this must be run from Bazel)")
	}
	ctx := context.Background()
	log := logrus.StandardLogger()
	rslv := net.DefaultResolver
	addrs, err := rslv.LookupIPAddr(ctx, *fHost)
	if err != nil {
		return fmt.Errorf("could not look up host: %v", err)
	}
	var h handler
	h.init()
	ctx = context.WithValue(ctx, contextKey{}, &h)
	mx := chi.NewMux()
	mx.Get("/", serveIndex)
	mx.Get("/favicon.ico", serveFavicon)
	mx.Get("/main.js", serveScript)
	mx.Get("/release", serveRelease)
	mx.Get("/release.map", serveReleaseMap)
	mx.Get("/static/*", serveStatic)
	mx.NotFound(serveNotFound)
	s := http.Server{
		Handler:     mx,
		BaseContext: func(_ net.Listener) context.Context { return ctx },
	}
	var root *url.URL
	for _, addr := range addrs {
		ta := net.TCPAddr{
			IP:   addr.IP,
			Zone: addr.Zone,
			Port: *fPort,
		}
		l, err := net.ListenTCP("tcp", &ta)
		if err != nil {
			return err
		}
		if root == nil {
			host := *fHost
			if host == "" {
				host = "localhost"
			}
			root = &url.URL{
				Scheme: "http",
				Host:   net.JoinHostPort(host, strconv.Itoa(*fPort)),
				Path:   "/",
			}
			log.Infoln("Serving on:", root)
		}
		go func(l *net.TCPListener) {
			err := s.Serve(l)
			log.Fatalln("serve:", err)
		}(l)
	}
	if root == nil {
		return errors.New("no address to serve on")
	}
	select {}
}

func main() {
	if err := mainE(); err != nil {
		logrus.Error(err)
		os.Exit(1)
	}
}
