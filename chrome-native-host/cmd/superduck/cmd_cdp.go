package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
)

// readJSONText reads a JSON file for --params-file / --batch-file. A UTF-8 BOM
// is stripped because Windows editors and `Set-Content -Encoding utf8` add one,
// and encoding/json rejects it as an invalid leading character.
func readJSONText(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return strings.TrimPrefix(string(data), "\ufeff"), nil
}

var bareJSONKey = regexp.MustCompile(`([{/,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)`)

func countSet(values ...string) int {
	n := 0
	for _, value := range values {
		if value != "" {
			n++
		}
	}
	return n
}

// parseCDPParams decodes a params object, tolerating shell-mangled JSON.
// Windows PowerShell strips the double quotes out of native arguments, so
// `--params '{"depth":1}'` reaches the process as `{depth:1}`; quoting the bare
// keys and retrying keeps that form usable. Values that were quoted away are
// unrecoverable — those need `--params-file`.
func parseCDPParams(raw string) (map[string]any, error) {
	var params map[string]any
	if err := json.Unmarshal([]byte(raw), &params); err == nil {
		return params, nil
	}
	repaired := bareJSONKey.ReplaceAllString(strings.ReplaceAll(raw, "'", `"`), `$1"$2"$3`)
	if err := json.Unmarshal([]byte(repaired), &params); err != nil {
		return nil, fmt.Errorf("CDP params must be a JSON object: %w", err)
	}
	return params, nil
}

// cmdCdp: superduck --tab <id> cdp <METHOD> [--params JSON] [--params-file PATH]
//
//	superduck --tab <id> cdp --batch '<json array>' | --batch-file PATH | --script PATH|-
//	superduck --tab <id> cdp status
//	superduck --tab <id> cdp events [--pattern P] [--wait-ms N] [--cursor N] [--limit N] [--clear]
//	superduck cdp targets [--pattern P]
//	superduck --target <targetId> cdp <METHOD> [--params-file PATH]
//
// Forwards an arbitrary Chrome DevTools Protocol call to the selected tab, the
// same channel the DevTools panel uses. Domains must be enabled explicitly
// first (`cdp Network.enable`, `cdp Debugger.enable`, ...). Results are plain CDP
// JSON, so agents can drive breakpoints, CSSOM queries, network bodies and
// WebSocket frames without waiting on dedicated tools. `--target` drives a
// worker / service worker instead of a tab.
func cmdCdp(argv []string) error {
	fs := flag.NewFlagSet("cdp", flag.ContinueOnError)
	paramsJSON := fs.String("params", "", "CDP parameters as a JSON object")
	paramsFile := fs.String("params-file", "", "Read the CDP parameters from this JSON file")
	batchJSON := fs.String("batch", "", `JSON array of {"method","params"} commands`)
	batchFile := fs.String("batch-file", "", "Read the batch JSON from this file")
	scriptFile := fs.String("script", "", `Same as --batch-file; accepts "-" for stdin`)
	targetID := fs.String("target", "", "Drive a worker/service-worker targetId instead of a tab")
	continueOnError := fs.Bool("continue-on-error", false, "Keep going after a failed command")
	pattern := fs.String("pattern", "", "events/targets: case-insensitive substring filter")
	cursor := fs.Int("cursor", 0, "events: return events with seq > cursor")
	limit := fs.Int("limit", 0, "events: max events (default 200)")
	waitMs := fs.Int("wait-ms", 0, "events: wait up to N ms for matching events (max 15000)")
	clearFlag := fs.Bool("clear", false, "events: drop the buffered events after reading")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()

	// run dispatches to the extension tool with whichever debuggee was requested.
	run := func(args map[string]any) error {
		if *targetID != "" {
			args["targetId"] = *targetID
		} else if gflags.Tab != 0 {
			args["tabId"] = gflags.Tab
		}
		return runToolOutput("superduck_cdp", "cdp", args)
	}

	if len(rest) > 0 && rest[0] == "targets" {
		if len(rest) > 1 {
			return fmt.Errorf("cdp targets takes no positional arguments")
		}
		if *targetID != "" || *paramsJSON != "" || *paramsFile != "" || *batchJSON != "" ||
			*batchFile != "" || *scriptFile != "" || *continueOnError {
			return fmt.Errorf("cdp targets takes no target, params or script")
		}
		if *cursor > 0 || *limit > 0 || *waitMs > 0 || *clearFlag {
			return fmt.Errorf("event flags belong to 'cdp events'")
		}
		args := map[string]any{"action": "targets"}
		if *pattern != "" {
			args["pattern"] = *pattern
		}
		return run(args)
	}

	if len(rest) > 0 && rest[0] == "status" {
		if len(rest) > 1 {
			return fmt.Errorf("cdp status takes no positional arguments")
		}
		if *targetID != "" {
			return fmt.Errorf("cdp status needs a tab; worker targets answer commands only")
		}
		if gflags.Tab == 0 {
			return fmt.Errorf("--tab <id> is required for cdp status")
		}
		if *paramsJSON != "" || *paramsFile != "" || *batchJSON != "" || *batchFile != "" ||
			*scriptFile != "" || *continueOnError {
			return fmt.Errorf("cdp status takes no params or script")
		}
		if *pattern != "" || *cursor > 0 || *limit > 0 || *waitMs > 0 || *clearFlag {
			return fmt.Errorf("event flags belong to 'cdp events'")
		}
		return run(map[string]any{"action": "status"})
	}

	if len(rest) > 0 && rest[0] == "events" {
		if len(rest) > 1 {
			return fmt.Errorf("cdp events takes no positional arguments")
		}
		if *targetID != "" {
			return fmt.Errorf("cdp events needs a tab; worker targets answer commands only")
		}
		if *paramsJSON != "" || *paramsFile != "" || *batchJSON != "" || *batchFile != "" ||
			*scriptFile != "" || *continueOnError {
			return fmt.Errorf("cdp events does not take commands or params")
		}
		args := map[string]any{"action": "events"}
		if *pattern != "" {
			args["pattern"] = *pattern
		}
		if *cursor > 0 {
			args["cursor"] = *cursor
		}
		if *limit > 0 {
			args["limit"] = *limit
		}
		if *waitMs > 0 {
			args["waitMs"] = *waitMs
		}
		if *clearFlag {
			args["clear"] = true
		}
		return run(args)
	}

	if *batchJSON != "" || *batchFile != "" || *scriptFile != "" {
		if countSet(*batchJSON, *batchFile, *scriptFile) > 1 || len(rest) != 0 ||
			*paramsJSON != "" || *paramsFile != "" {
			return fmt.Errorf("cdp --batch/--script takes no method, params or positional arguments")
		}
		if *pattern != "" || *cursor > 0 || *limit > 0 || *waitMs > 0 || *clearFlag {
			return fmt.Errorf("cdp --batch/--script has no event flags; use 'cdp events'")
		}
		raw := *batchJSON
		switch {
		case *batchFile != "":
			text, err := readJSONText(*batchFile)
			if err != nil {
				return err
			}
			raw = text
		case "-" == *scriptFile:
			text, err := readStdin()
			if err != nil {
				return err
			}
			raw = text
		case *scriptFile != "":
			text, err := readJSONText(*scriptFile)
			if err != nil {
				return err
			}
			raw = text
		}
		var commands []map[string]any
		if err := json.Unmarshal([]byte(raw), &commands); err != nil || len(commands) == 0 {
			return fmt.Errorf("--batch needs a non-empty JSON array of {\"method\",\"params\"} commands")
		}
		args := map[string]any{"action": "batch", "commands": commands}
		if *continueOnError {
			args["continueOnError"] = true
		}
		return run(args)
	}

	if len(rest) != 1 {
		return fmt.Errorf("usage: superduck --tab <id> cdp <METHOD> [--params JSON | --params-file PATH]\n       superduck --tab <id> cdp --batch '<json>' | --batch-file PATH | --script PATH|-  [--continue-on-error]\n       superduck --tab <id> cdp status\n       superduck --tab <id> cdp events [--pattern M] [--wait-ms N] [--cursor N] [--limit N] [--clear]\n       superduck cdp targets [--pattern M]\n       superduck --target <targetId> cdp <METHOD> [--params-file PATH]")
	}
	if *pattern != "" || *cursor > 0 || *limit > 0 || *waitMs > 0 || *clearFlag {
		return fmt.Errorf("event flags belong to 'cdp events'")
	}
	method := strings.TrimSpace(rest[0])
	if *paramsJSON != "" && *paramsFile != "" {
		return fmt.Errorf("--params and --params-file are mutually exclusive")
	}

	args := map[string]any{"action": "send", "method": method}
	raw := *paramsJSON
	if *paramsFile != "" {
		text, err := readJSONText(*paramsFile)
		if err != nil {
			return err
		}
		raw = text
	}
	if strings.TrimSpace(raw) != "" {
		params, err := parseCDPParams(raw)
		if err != nil {
			return err
		}
		args["params"] = params
	}
	return run(args)
}
