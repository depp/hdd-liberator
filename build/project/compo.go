package project

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/net/html"

	html2 "moria.us/js13k/build/html"

	pb "moria.us/js13k/proto/compiler"
)

// TargetSize is the maximum permitted size of the zip file, in bytes, accodring
// to competition rules.
const TargetSize = 13 * 1024

// A CompoData contains the data and compiled JavaScript for a compo build.
type CompoData struct {
	Config         Config
	Data           string
	Diagnostics    []*pb.Diagnostic
	CompiledScript ScriptData
	MinifiedScript ScriptData
	HTMLTemplate   []byte
}

func isAlnum(c byte) bool {
	return 'a' <= c && c <= 'z' ||
		'A' <= c && c <= 'Z' ||
		'0' <= c && c <= '9' ||
		c == '_'
}

func readVariable(t string) (n, rem string) {
	var i int
	for i < len(t) && isAlnum(t[i]) {
		i++
	}
	return t[:i], t[i:]
}

func (d *CompoData) expandText(t string, sourceMapURL *url.URL) (string, error) {
	var b strings.Builder
	for len(t) > 0 {
		switch c := t[0]; c {
		case ' ', '\t', '\n', '\r':
			t = t[1:]
		case '"':
			t = t[1:]
			for {
				if len(t) == 0 {
					return "", errors.New("missing <\">")
				}
				c := t[0]
				if c == '$' {
					var name string
					name, t = readVariable(t[1:])
					switch name {
					case "":
						return "", errors.New("missing variable name after $")
					case "title":
						b.WriteString(d.Config.Title)
					case "code":
						b.Write(d.MinifiedScript.Code)
						if sourceMapURL != nil {
							b.WriteString("//# sourceMappingURL=")
							b.WriteString(sourceMapURL.String())
						}
					case "data":
						b.WriteString(d.Data)
					default:
						return "", fmt.Errorf("unknown variable: %s", name)
					}
					continue
				}
				if c == '"' {
					t = t[1:]
					break
				}
				// Note: No way to escape $ at the moment.
				v, _, tail, err := strconv.UnquoteChar(t, '"')
				if err != nil {
					return "", err
				}
				t = tail
				b.WriteRune(v)
			}
		default:
			return "", fmt.Errorf("unexpected character in HTML body: %q", c)
		}
	}
	return b.String(), nil
}

// BuildHTML returns the HTML page.
//
// If sourceMapURL is non-nil, a link to the source map for the JavaScript code
// will be inserted. The URL should be nil for the submitted build.
func (d *CompoData) BuildHTML(sourceMapURL *url.URL) ([]byte, error) {
	if !utf8.Valid(d.HTMLTemplate) {
		return nil, errors.New("HTML template is not UTF-8")
	}
	var w html2.Writer
	t := html.NewTokenizer(bytes.NewReader(d.HTMLTemplate))
	for {
		switch tt := t.Next(); tt {
		case html.ErrorToken:
			if err := t.Err(); err != io.EOF {
				return nil, fmt.Errorf("bad HTML template: %v", t.Err())
			}
			return w.Finish()
		case html.TextToken:
			s, err := d.expandText(string(t.Text()), sourceMapURL)
			if err != nil {
				return nil, err
			}
			w.Text(s)
		case html.StartTagToken:
			name, hasattr := t.TagName()
			w.OpenTag(string(name))
			for hasattr {
				var key, val []byte
				key, val, hasattr = t.TagAttr()
				w.Attr(string(key), string(val))
			}
		case html.EndTagToken:
			name, _ := t.TagName()
			w.CloseTag(string(name))
		case html.SelfClosingTagToken:
			name, _ := t.TagName()
			return nil, fmt.Errorf("cannot use self-closing tag: <%s/>", string(name))
		case html.CommentToken:
		case html.DoctypeToken:
			w.WriteDocType()
		default:
			return nil, fmt.Errorf("unknown HTML token type: %d", tt)
		}
	}
}
