package main

import (
	"errors"
	"testing"

	"chrome-native-host/internal/cliclient"
)

func TestExtractSubcommand(t *testing.T) {
	t.Parallel()
	cases := []struct {
		cmd, want string
		rest      []string
	}{
		{"tab_group", "list", []string{"list"}},
		{"tab_group", "list", []string{"ls", "--create-if-empty"}},
		{"tab_group", "new", []string{"new"}},
		{"tab_group", "unknown", []string{"weird"}},
		{"tab_group", "", nil},
		{"gif", "start", []string{"start"}},
		{"gif", "export", []string{"export", "--download"}},
		{"gif", "unknown", []string{"foo"}},
		{"shortcuts", "list", []string{"list"}},
		{"shortcuts", "get", []string{"get", "my-shortcut"}},
		{"navigate", "back", []string{"back"}},
		{"navigate", "url", []string{"https://example.com"}},
		{"navigate", "url", []string{"--tab", "https://example.com"}},
		{"screenshot", "", []string{"--output", "/tmp"}},
	}
	for _, tc := range cases {
		got := extractSubcommand(tc.cmd, tc.rest)
		if got != tc.want {
			t.Errorf("extractSubcommand(%q, %v) = %q, want %q", tc.cmd, tc.rest, got, tc.want)
		}
	}
}

func TestClassify(t *testing.T) {
	t.Parallel()
	cases := []struct {
		err      error
		wantCode int
		wantKind string
	}{
		{nil, 0, ""},
		{cliclient.ErrNotConnected, ExitNotConnected, "not_connected"},
		{cliclient.ErrTimeout, ExitTimeout, "timeout"},
		{&cliclient.ToolError{Msg: "bad"}, ExitToolError, "tool_error"},
		{errNoArgs, ExitUsage, "usage_error"},
		{errors.New("nope"), ExitUsage, "usage_error"},
	}
	for _, tc := range cases {
		code, kind := classify(tc.err)
		if code != tc.wantCode || kind != tc.wantKind {
			t.Errorf("classify(%v) = (%d, %q), want (%d, %q)", tc.err, code, kind, tc.wantCode, tc.wantKind)
		}
	}
}
