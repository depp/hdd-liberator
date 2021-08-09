package html

import (
	"fmt"
	"regexp"
)

// scriptProhibited matches all strings which cannot appear inside an HTML script element, according
// to our conservative rules. Technically, some of these strings can appear if they are correctly
// paired.
//
// https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
var scriptProhibited = regexp.MustCompile("(?i)<!--|</?script")

type badScriptError struct {
	offset int
	text   string
}

func (e *badScriptError) Error() string {
	return fmt.Sprintf("script contains prohibited string: offset=%d, string=%q", e.offset, e.text)
}

// checkScript checks that the given text can appear inside an html script element. If not, returns
// an error.
func checkScript(text []byte) error {
	loc := scriptProhibited.FindIndex(text)
	if loc != nil {
		return &badScriptError{offset: loc[0], text: string(text[loc[0]:loc[1]])}
	}
	return nil
}
