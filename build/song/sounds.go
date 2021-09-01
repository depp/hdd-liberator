package song

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const CodeFile = "code.py"

type sounds struct {
	Instruments map[string][]byte `json:"instruments"`
}

func compileSounds(ctx context.Context, filename string) (*sounds, error) {
	cmd := exec.CommandContext(ctx, "python3", filename)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(out.Bytes()))
	dec.DisallowUnknownFields()
	var s sounds
	if err := dec.Decode(&s); err != nil {
		return nil, fmt.Errorf("%s: %v", filepath.Base(filename), err)
	}
	return &s, nil
}
