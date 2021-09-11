package project

import (
	"context"
	"encoding/json"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
)

func jsonString(s string) string {
	data, err := json.Marshal(s)
	if err != nil {
		panic("json.Marshal: " + err.Error())
	}
	return string(data)
}

func (p *Project) minify(ctx context.Context, in ScriptData) (out ScriptData, err error) {
	const (
		inname  = "main.js"
		outname = "min.js"
	)
	dir, err := ioutil.TempDir("", "js13k.devserver.*")
	if err != nil {
		return out, err
	}
	defer os.RemoveAll(dir)

	injs := filepath.Join(dir, inname)
	inmap := filepath.Join(dir, inname+".map")
	outjs := filepath.Join(dir, outname)
	outmap := filepath.Join(dir, outname+".map")
	if err := ioutil.WriteFile(injs, in.Code, 0666); err != nil {
		return out, err
	}
	if err := ioutil.WriteFile(inmap, in.SourceMap, 0666); err != nil {
		return out, err
	}

	cmd := exec.CommandContext(ctx, "node", filepath.Join(p.BaseDir, "scripts/minify.js"),
		injs, inmap, outjs, outmap)
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return out, err
	}

	data, err := ioutil.ReadFile(outjs)
	if err != nil {
		return out, err
	}
	srcmap, err := ioutil.ReadFile(outmap)
	if err != nil {
		return out, err
	}
	return ScriptData{
		Code:      data,
		SourceMap: srcmap,
	}, nil
}
