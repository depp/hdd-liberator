package html

import "testing"

func TestCheckScript(t *testing.T) {
	type testcase struct {
		ok   bool
		text string
	}
	cases := []testcase{
		{true, ""},
		{true, "<tag>"},
		{true, "script"},
		{false, "<!--"},
		{false, "<script"},
		{false, "<SCRIPT"},
		{false, "</script"},
		{false, "</sCrIpT"},
	}
	for _, c := range cases {
		for i := 0; i < 2; i++ {
			var w Writer
			w.OpenTag("script")
			if i == 1 {
				w.Text("prefix ")
			}
			w.Text(c.text)
			if i == 1 {
				w.Text(" suffix")
			}
			w.CloseTag("script")
			_, err := w.Finish()
			if c.ok {
				if err != nil {
					t.Errorf("script %q: %v (expect ok)", c.text, err)
				}
			} else {
				if err == nil {
					t.Errorf("script %q: ok (expect err)", c.text)
				}
			}
		}
	}
}
