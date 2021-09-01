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

func (p *Project) terser(ctx context.Context, in ScriptData) (out ScriptData, err error) {
	const (
		inname  = "main.js"
		outname = "min.js"
	)
	tc := p.Config.Terser
	if tc == nil {
		return out, nil
	}
	dir, err := ioutil.TempDir("", "js13k.devserver.*")
	if err != nil {
		return out, err
	}
	defer os.RemoveAll(dir)

	if err := ioutil.WriteFile(filepath.Join(dir, inname), in.Code, 0666); err != nil {
		return out, err
	}
	if err := ioutil.WriteFile(filepath.Join(dir, inname+".map"), in.SourceMap, 0666); err != nil {
		return out, err
	}

	cmd := exec.CommandContext(ctx, filepath.Join(p.BaseDir, "node_modules/.bin/terser"),
		filepath.Join(dir, inname),
		"--source-map=content="+jsonString(filepath.Join(dir, inname+".map")),
		"--output="+filepath.Join(dir, outname))
	if tc.Compress != "" {
		cmd.Args = append(cmd.Args, "--compress="+tc.Compress)
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return out, err
	}

	data, err := ioutil.ReadFile(filepath.Join(dir, outname))
	if err != nil {
		return out, err
	}
	srcmap, err := ioutil.ReadFile(filepath.Join(dir, outname+".map"))
	if err != nil {
		return out, err
	}
	return ScriptData{
		Code:      data,
		SourceMap: srcmap,
	}, nil
}
