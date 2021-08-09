package html

import "testing"

func TestCheckScript(t *testing.T) {
	cases := []string{
		"",
		"<tag>",
		"script",
	}
	for _, c := range cases {
		if err := checkScript([]byte(c)); err != nil {
			t.Errorf("checkScript(%q): %v (expect ok)", c, err)
		}
	}
	cases = []string{
		"<!--",
		"<script",
		"<SCRIPT",
		"</script",
		"</sCrIpT",
	}
	for _, c := range cases {
		cases2 := []string{
			c,
			"prefix " + c + " suffix",
		}
		for _, c := range cases2 {
			if checkScript([]byte(c)) == nil {
				t.Errorf("checkScript(%q): ok (expect error)", c)
			}
		}
	}
}
