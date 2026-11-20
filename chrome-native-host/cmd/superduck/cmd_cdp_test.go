package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestParseCDPParamsToleratesShellMangledJSON(t *testing.T) {
	for raw, want := range map[string]map[string]any{
		`{"depth":1}`:          {"depth": float64(1)},
		`{depth:1}`:            {"depth": float64(1)},
		`{ depth : 2 }`:        {"depth": float64(2)},
		`{'nodeId':17}`:        {"nodeId": float64(17)},
		`{"expression":"1+1"}`: {"expression": "1+1"},
	} {
		got, err := parseCDPParams(raw)
		if err != nil {
			t.Fatalf("parseCDPParams(%q) error = %v", raw, err)
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("parseCDPParams(%q) = %v, want %v", raw, got, want)
		}
	}
	for _, raw := range []string{`[]`, `{oops}`, `{expression:document.title}`, ``} {
		if _, err := parseCDPParams(raw); err == nil {
			t.Fatalf("parseCDPParams(%q) accepted invalid params", raw)
		}
	}
}

func TestReadJSONTextStripsBOM(t *testing.T) {
	path := filepath.Join(t.TempDir(), "params.json")
	if err := os.WriteFile(path, []byte("\ufeff{\"depth\":3}"), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	text, err := readJSONText(path)
	if err != nil {
		t.Fatalf("readJSONText() error = %v", err)
	}
	if text != `{"depth":3}` {
		t.Fatalf("readJSONText() = %q, want the BOM stripped", text)
	}
	if _, err := parseCDPParams(text); err != nil {
		t.Fatalf("parseCDPParams() error = %v", err)
	}
}

func TestCdpRejectsAmbiguousInput(t *testing.T) {
	for name, args := range map[string][]string{
		"no method":            {},
		"two positionals":      {"Runtime.evaluate", "extra"},
		"params not object":    {"Runtime.evaluate", "--params", "[]"},
		"params not json":      {"Runtime.evaluate", "--params", "{oops}"},
		"params and file":      {"Runtime.evaluate", "--params", `{"a":1}`, "--params-file", "p.json"},
		"event flag on send":   {"Runtime.evaluate", "--pattern", "Runtime."},
		"empty batch":          {"--batch", "[]"},
		"batch not json":       {"--batch", "not json"},
		"batch plus method":    {"--batch", `[{"method":"Runtime.evaluate"}]`, "Runtime.evaluate"},
		"script plus batch":    {"--script", "s.json", "--batch-file", "b.json"},
		"batch with event set": {"--batch", `[{"method":"Runtime.evaluate"}]`, "--wait-ms", "500"},
		"events plus batch":    {"events", "--batch", `[{"method":"Runtime.evaluate"}]`},
		"events with method":   {"events", "Runtime.evaluate"},
		"status with params":   {"status", "--params", `{"a":1}`},
		"status with method":   {"status", "Runtime.evaluate"},
		"targets with params":  {"targets", "--params-file", "p.json"},
		"targets with target":  {"targets", "--target", "abc"},
		"events with target":   {"events", "--target", "abc"},
		"status with target":   {"status", "--target", "abc"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := cmdCdp(args); err == nil {
				t.Fatalf("cmdCdp(%q) accepted invalid input", args)
			}
		})
	}
}

func TestCdpSubcommandLabel(t *testing.T) {
	for name, tc := range map[string]struct {
		rest []string
		want string
	}{
		"domain":  {[]string{"Network.getResponseBody", "--params", "{}"}, "Network"},
		"events":  {[]string{"events", "--pattern", "Debugger."}, "events"},
		"status":  {[]string{"status"}, "status"},
		"targets": {[]string{"targets", "--pattern", "worker"}, "targets"},
		"batch":   {[]string{"--batch", "[]"}, "batch"},
		"no-args": {nil, ""},
	} {
		t.Run(name, func(t *testing.T) {
			if got := extractSubcommand("cdp", tc.rest); got != tc.want {
				t.Fatalf("extractSubcommand(cdp, %q) = %q, want %q", tc.rest, got, tc.want)
			}
		})
	}
}
