package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestCmdExecOutputWritesRawResponseToFile verifies that `exec --output <path>`
// writes the raw tool response to disk (bypassing the terminal channel) and
// prints only a summary line to stdout.
func TestCmdExecOutputWritesRawResponseToFile(t *testing.T) {
	socketPath, reqCh, wait := startFakeCLIToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "window.__out = [...]; window.__out"},
			},
			"structuredContent": map[string]any{
				"tabContext": map[string]any{
					"currentTabId":    42,
					"executedOnTabId": 42,
					"tabCount":        1,
					"availableTabs":   []map[string]any{{"id": 42, "title": "Example", "url": "https://example.com/"}},
				},
			},
		},
	})
	withCLIFlags(t, globalFlags{
		SocketPath: socketPath,
		Timeout:    time.Second,
		Tab:        42,
	})

	outFile := filepath.Join(t.TempDir(), "exec-out.txt")
	out := captureStdout(t, func() {
		if err := cmdExec([]string{"--output", outFile, "window.__out"}); err != nil {
			t.Fatalf("cmdExec() error = %v", err)
		}
	})

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "javascript_tool"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}
	if req.Params.Args["action"] != "javascript_exec" {
		t.Fatalf("action = %q, want javascript_exec", req.Params.Args["action"])
	}

	// The raw response lands in the file verbatim (human-readable text).
	b, err := os.ReadFile(outFile)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if !strings.Contains(string(b), "window.__out = [...]; window.__out") {
		t.Fatalf("output file = %q, want raw tool response", string(b))
	}

	// stdout gets only the summary line.
	if !strings.Contains(out, "wrote") || !strings.Contains(out, "exec-out.txt") {
		t.Fatalf("stdout = %q, want 'wrote N bytes to <path>' summary", out)
	}
}

// TestCmdTabsJSONUsesStableEnvelope verifies that `tabs --json` wraps the raw
// tool response in the same RunToolJSON envelope as tab_group (so
// `.tabContext.currentTabId` and `.output` are consistently shaped).
func TestCmdTabsJSONUsesStableEnvelope(t *testing.T) {
	socketPath, reqCh, wait := startFakeCLIToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "ACTIVE\tID\tWIN\tTITLE\tURL\n►\t42\t1\tExample\thttps://example.com/"},
			},
			"structuredContent": map[string]any{
				"activeWindowId": 1,
				"tabs": []map[string]any{
					{"id": 42, "windowId": 1, "url": "https://example.com/", "title": "Example", "active": true, "focusedWindow": true},
				},
			},
		},
	})
	withCLIFlags(t, globalFlags{
		JSON:       true,
		SocketPath: socketPath,
		Timeout:    time.Second,
	})

	out := captureStdout(t, func() {
		if err := cmdTabs([]string{}); err != nil {
			t.Fatalf("cmdTabs() error = %v", err)
		}
	})

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "superduck_list_tabs"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}

	// Envelope must contain tool/ok/output plus the promoted structured fields.
	for _, wantKey := range []string{`"tool"`, `"ok"`, `"output"`, `"activeWindowId"`, `"tabs"`} {
		if !strings.Contains(out, wantKey) {
			t.Fatalf("envelope = %s, missing %s", out, wantKey)
		}
	}
	if !strings.Contains(out, `"id":42`) {
		t.Fatalf("envelope = %s, missing tab id 42", out)
	}
}
