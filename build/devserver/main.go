package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/sirupsen/logrus"
	"github.com/spf13/pflag"

	"moria.us/js13k/build/compiler"
	"moria.us/js13k/build/project"

	pb "moria.us/js13k/proto/compiler"
)

const (
	htmlType = "text/html; charset=UTF-8"
	textType = "text/plain; charset=UTF-8"
)

type contextKey struct{}

func (contextKey) String() string {
	return "devserver context key"
}

type handler struct {
	baseDir            string
	config             string
	statusTemplate     *cachedTemplate
	buildErrorTemplate *cachedTemplate
	gameTemplate       *cachedTemplate
	releaseMap         sourcemap

	compiler compiler.Locked
}

func newHandler(baseDir, config string) *handler {
	return &handler{
		baseDir:            baseDir,
		config:             config,
		statusTemplate:     newTemplate(baseDir, "build/devserver/status.gohtml"),
		buildErrorTemplate: newTemplate(baseDir, "build/devserver/build_error.gohtml"),
		gameTemplate:       newTemplate(baseDir, "game/index.gohtml"),
	}
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
	} else if msg == "" {
		logrus.Infoln(status, r.URL)
	} else {
		logrus.Infoln(status, r.URL, msg)
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

func (h *handler) serveRedirect(w http.ResponseWriter, r *http.Request, u *url.URL) {
	loc := u.String()
	const status = http.StatusTemporaryRedirect
	logResponse(r, status, "-> "+loc)
	w.Header().Set("Location", loc)
	h.serveStatus(w, r, http.StatusTemporaryRedirect, "")
}

func (h *handler) serveTemplate(w http.ResponseWriter, r *http.Request, t *cachedTemplate, data interface{}) {
	var buf bytes.Buffer
	if err := t.execute(&buf, data); err != nil {
		h.serveError(w, r, err)
		return
	}
	hdr := w.Header()
	hdr.Set("Cache-Control", "no-cache")
	hdr.Set("Content-Length", strconv.Itoa(buf.Len()))
	hdr.Set("Content-Type", htmlType)
	w.Write(buf.Bytes())
}

func serveKnownFile(w http.ResponseWriter, r *http.Request, filename string) {
	ctx := r.Context()
	h := getHandler(ctx)
	fp, err := os.Open(filepath.Join(h.baseDir, filename))
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

func redirectAddSlash(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h := getHandler(ctx)
	u := *r.URL
	u.Path += "/"
	h.serveRedirect(w, r, &u)
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h := getHandler(ctx)
	p, err := project.Load(h.baseDir, h.config)
	if err != nil {
		h.serveError(w, r, err)
		return
	}
	type idata struct {
		Title string
		Main  string
	}
	h.serveTemplate(w, r, h.gameTemplate, &idata{
		Title: p.Config.Title,
		Main:  path.Join("/", p.Config.SourceDir, p.Config.MainStandard),
	})
}

func serveFavicon(w http.ResponseWriter, r *http.Request) {
	serveKnownFile(w, r, "favicon.ico")
}

func (h *handler) buildRelease(ctx context.Context) ([]byte, error) {
	p, err := project.Load(h.baseDir, h.config)
	if err != nil {
		return nil, err
	}
	d, err := p.CompileCompo(ctx, &h.compiler)
	if err != nil {
		return nil, err
	}
	var smURL *url.URL
	if q := h.releaseMap.set(d.SourceMap); q != nil {
		smURL = &url.URL{Path: "main.map", RawQuery: q.Encode()}
	}
	return d.BuildHTML(smURL)
}

type errorData struct {
	Diagnostics []*pb.Diagnostic
	srcLoader   srcLoader
}

func (h *handler) serveBuildError(w http.ResponseWriter, r *http.Request, e *compiler.Error) {
	var buf bytes.Buffer
	if err := h.buildErrorTemplate.execute(&buf, &errorData{
		Diagnostics: e.Diagnostics,
		srcLoader:   srcLoader{baseDir: h.baseDir},
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
		if e, ok := err.(*compiler.Error); ok {
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

func serveFile(w http.ResponseWriter, r *http.Request, dir, name, ctype string) {
	ctx := r.Context()
	h := getHandler(ctx)
	if !safePath.MatchString(name) {
		h.serveNotFound(w, r)
		return
	}
	fp, err := os.Open(filepath.Join(h.baseDir, dir, name))
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

func serveStatic(w http.ResponseWriter, r *http.Request) {
	serveFile(w, r, "", r.URL.Path[1:], "")
}

func mainE() error {
	fHost := pflag.String("host", "localhost", "host to serve from, or * to bind to all local addresses")
	fPort := pflag.Int("port", 9013, "port to serve from")
	pflag.Parse()
	if args := pflag.Args(); len(args) != 0 {
		return fmt.Errorf("unexpected argument: %q", args[0])
	}

	baseDir := os.Getenv("BUILD_WORKSPACE_DIRECTORY")
	if baseDir == "" {
		return errors.New("BUILD_WORKSPACE_DIRECTORY is not set (this must be run from Bazel)")
	}
	ctx := context.Background()
	log := logrus.StandardLogger()
	host := *fHost
	var addrs []net.IPAddr
	if host == "*" {
		addrs = []net.IPAddr{{IP: net.IPv6zero}}
		host = "localhost"
	} else {
		var err error
		rslv := net.DefaultResolver
		addrs, err = rslv.LookupIPAddr(ctx, host)
		if err != nil {
			return fmt.Errorf("could not look up host: %v", err)
		}
		if host == "" {
			host = "localhost"
		}
	}
	h := newHandler(baseDir, "js13k.json")
	ctx = context.WithValue(ctx, contextKey{}, h)
	mx := chi.NewMux()
	mx.Get("/", serveIndex)
	mx.Get("/favicon.ico", serveFavicon)
	mx.Get("/release", redirectAddSlash)
	mx.Get("/release/", serveRelease)
	mx.Get("/release/main.map", serveReleaseMap)
	mx.Get("/static/*", serveStatic)
	mx.Get("/game/*", serveStatic)
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