package main

import (
	"flag"
	"fmt"
	"os"
)

// cmdExec: superduck exec --tab <id> <js-code>
//
//	superduck exec --tab <id> --file <path> [--output <path>]
//	echo "expr" | superduck exec --tab <id> --stdin [--output <path>]
//
// Runs JavaScript in the page context via the extension's `javascript_tool`
// (action "javascript_exec"). The result of the last expression is returned.
//
// Execution model (important):
//   - Code runs inside an async function wrapper in the page context; top-level
//     `return` is NOT supported (raises "Illegal return statement"). Write a
//     bare expression to return its value: `window.myData.value`, not
//     `return window.myData.value`.
//   - Multi-statement code is fine (`const x = 1; x + 1`); for large results
//     store them on window and read back: `window.__out = [...]; window.__out`.
//   - Output limits: single string values > 1000 chars are truncated (the
//     marker states the original length); total output > 51200 chars is cut.
//     Use `page_text --format html` to extract large page content instead.
//
// --output <path> writes the raw tool response to a file, bypassing the
// terminal channel entirely: the response is written as-is (no human-readable
// reformatting), so large or structured payloads can be parsed from disk
// without hitting the CLI's output limits or JSON-over-terminal noise.
func cmdExec(argv []string) error {
	fs := flag.NewFlagSet("exec", flag.ContinueOnError)
	file := fs.String("file", "", "Read JS source from this file")
	stdin := fs.Bool("stdin", false, "Read JS source from stdin")
	output := fs.String("output", "", "Write the raw tool response to this file instead of stdout (bypasses terminal channel)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}

	var code string
	switch {
	case *file != "":
		b, err := os.ReadFile(*file)
		if err != nil {
			return err
		}
		code = string(b)
	case *stdin:
		s, err := readStdin()
		if err != nil {
			return err
		}
		code = s
	default:
		rest := fs.Args()
		if len(rest) < 1 {
			return fmt.Errorf("usage: superduck exec --tab <id> <js-code> | --file PATH | --stdin [--output PATH]")
		}
		code = rest[0]
	}

	args := map[string]any{
		"action": "javascript_exec",
		"text":   code,
	}
	if *output != "" {
		return runSimpleToolToFile("javascript_tool", "exec", args, *output)
	}
	return runSimpleTool("javascript_tool", "exec", args)
}
