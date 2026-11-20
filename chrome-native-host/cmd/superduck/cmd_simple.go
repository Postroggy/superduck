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

func runSimpleResultOnly(toolName, cmdLabel string, args map[string]any) error {
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for %s", cmdLabel)
	}
	args["tabId"] = gflags.Tab
	rec := cliclient.AuditRecord{Cmd: cmdLabel}
	raw, err := cliclient.RunToolJSON(toolName, args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	output, err := toolResultOnly(raw)
	if err != nil {
		return err
	}
	fmt.Println(output)
	return nil
}

func toolResultOnly(raw string) (string, error) {
	var response struct {
		Output json.RawMessage `json:"output"`
	}
	if err := json.Unmarshal([]byte(raw), &response); err != nil || len(response.Output) == 0 {
		return "", fmt.Errorf("tool response has no result")
	}
	var text string
	if response.Output[0] == '"' {
		if err := json.Unmarshal(response.Output, &text); err != nil {
			return "", err
		}
		return text, nil
	}
	return string(response.Output), nil
}

func readStdin() (string, error) {
	b, err := io.ReadAll(os.Stdin)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
