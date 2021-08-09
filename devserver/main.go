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
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/sirupsen/logrus"
	"github.com/spf13/pflag"
)

// chdirRoot changes the current directory to the root of the project. Looks
// upwards from the current directory.
func chdirRoot() error {
	const (
		maxDepth = 10       // Maximum number of directories to search before giving up.
		rootFile = "go.mod" // A file in root directory, and not in other directories.
	)
	for i := 0; i < maxDepth; i++ {
		switch _, err := os.Stat(rootFile); {
		case err == nil:
			return nil
		case os.IsNotExist(err):
		default:
			return err
		}
		if err := os.Chdir(".."); err != nil {
			return err
		}
	}
	return errors.New("could not find project root directory")
}

const (
	htmlType = "text/html; charset=UTF-8"
	textType = "text/plain; charset=UTF-8"
)

var statusTemplate = template.Must(template.New("status").Parse(`<!doctype HTML>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>{{.Status}} {{.StatusText}}</title>
  </head>
  <body>
    <h1>{{.Status}} {{.StatusText}}</h1>
	{{if .Message}}<p>{{.Message}}</p>{{end}}
  </body>
</html>
`))

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

func serveStatus(w http.ResponseWriter, r *http.Request, status int, msg string) {
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
	if err := statusTemplate.Execute(&b, &d); err != nil {
		logrus.Errorln("statusTemplate.Execute:", err)
		b.Reset()
		ctype = textType
		fmt.Fprintf(&b, "%d %s\n%s\n", d.Status, d.StatusText, d.Message)
	}
	hdr := w.Header()
	hdr.Set("Content-Type", ctype)
	hdr.Set("Content-Length", strconv.Itoa(b.Len()))
	w.WriteHeader(status)
	w.Write(b.Bytes())
}

func serveErrorf(w http.ResponseWriter, r *http.Request, format string, a ...interface{}) {
	const status = http.StatusInternalServerError
	msg := fmt.Sprintf(format, a...)
	logResponse(r, status, msg)
	serveStatus(w, r, status, msg)
}

func serveKnownFile(w http.ResponseWriter, r *http.Request, filename string) {
	fp, err := os.Open(filename)
	if err != nil {
		serveErrorf(w, r, "%v", err)
		return
	}
	defer fp.Close()
	st, err := fp.Stat()
	if err != nil {
		serveErrorf(w, r, "%v", err)
		return
	}
	logResponse(r, http.StatusOK, "")
	http.ServeContent(w, r, filename, st.ModTime(), fp)
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	serveKnownFile(w, r, "demo/index.html")
}

func serveScript(w http.ResponseWriter, r *http.Request) {
	serveKnownFile(w, r, "demo/main.js")
}

func serveNotFound(w http.ResponseWriter, r *http.Request) {
	logResponse(r, http.StatusNotFound, "")
	serveStatus(w, r, http.StatusNotFound, fmt.Sprintf("Page not found: %q", r.URL))
}

func mainE() error {
	fHost := pflag.String("host", "localhost", "host to serve from")
	fPort := pflag.Int("port", 9013, "port to serve from")
	pflag.Parse()
	if args := pflag.Args(); len(args) != 0 {
		return fmt.Errorf("unexpected argument: %q", args[0])
	}

	if err := chdirRoot(); err != nil {
		return err
	}
	ctx := context.Background()
	log := logrus.StandardLogger()
	rslv := net.DefaultResolver
	addrs, err := rslv.LookupIPAddr(ctx, *fHost)
	if err != nil {
		return fmt.Errorf("could not look up host: %v", err)
	}
	mx := chi.NewMux()
	mx.Get("/", serveIndex)
	mx.Get("/main.js", serveScript)
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
