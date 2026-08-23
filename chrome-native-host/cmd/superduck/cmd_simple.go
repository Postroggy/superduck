package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"chrome-native-host/internal/cliclient"
)

// runSimpleTool dispatches a tool call that just needs args + tabId, then
// prints the response (raw JSON envelope if --json, otherwise textual content).
func runSimpleTool(toolName, cmdLabel string, args map[string]any) error {
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for %s", cmdLabel)
	}
	args["tabId"] = gflags.Tab
	return runToolOutput(toolName, cmdLabel, args)
}

func runToolOutput(toolName, cmdLabel string, args map[string]any) error {
	rec := cliclient.AuditRecord{Cmd: cmdLabel}
	if gflags.JSON {
		raw, err := cliclient.RunToolJSON(toolName, args, clientOpts(), &rec)
		if raw != "" {
			fmt.Println(raw)
		}
		return err
	}
	raw, err := cliclient.RunTool(toolName, args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	fmt.Println(raw)
	return nil
}

// runSimpleToolToFile dispatches a tool call like runSimpleTool but writes the
// RAW tool response to a file instead of printing it. This bypasses the
// terminal channel entirely — large or structured payloads land on disk
// verbatim (no human-readable reformatting), so callers can parse them without
// hitting the CLI output limits or terminal-encoding noise.
func runSimpleToolToFile(toolName, cmdLabel string, args map[string]any, path string) error {
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for %s", cmdLabel)
	}
	args["tabId"] = gflags.Tab

	rec := cliclient.AuditRecord{Cmd: cmdLabel}
	// RunToolJSON + stripTabContextText gives the PURE tool output (no synthetic
	// "Tab Context" tail), so files written via --output are directly parseable
	// (e.g. JSON payloads) instead of carrying the human-readable suffix.
	raw, err := cliclient.RunToolJSON(toolName, args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	var envelope struct {
		Output string `json:"output"`
	}
	if jsonErr := json.Unmarshal([]byte(raw), &envelope); jsonErr == nil && envelope.Output != "" {
		raw = envelope.Output
	}
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %d bytes to %s\n", len(raw), path)
	return nil
}

func readStdin() (string, error) {
	b, err := io.ReadAll(os.Stdin)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
