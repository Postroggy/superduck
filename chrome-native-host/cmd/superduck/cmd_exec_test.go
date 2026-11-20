package main

import "testing"

func TestExecRejectsAmbiguousSources(t *testing.T) {
	for _, args := range [][]string{
		{"--file", "script.js", "--stdin"},
		{"--stdin", "document.title"},
		{"document.title", "document.URL"},
		{"  "},
	} {
		if err := cmdExec(args); err == nil {
			t.Errorf("cmdExec(%q) accepted invalid source selection", args)
		}
	}
}

func TestToolResultOnly(t *testing.T) {
	for name, tc := range map[string]struct {
		raw  string
		want string
	}{
		"text":   {`{"output":"hello\nworld","tabContext":{"currentTabId":1}}`, "hello\nworld"},
		"object": {`{"output":{"width":1000}}`, `{"width":1000}`},
		"json":   {`{"output":"[1,2,3]"}`, `[1,2,3]`},
	} {
		t.Run(name, func(t *testing.T) {
			got, err := toolResultOnly(tc.raw)
			if err != nil || got != tc.want {
				t.Fatalf("toolResultOnly() = (%q, %v), want %q", got, err, tc.want)
			}
		})
	}
}
