package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
)

// cmdExec: superduck exec --tab <id> <js-code>
//
//	superduck exec --tab <id> --file <path>
//	echo "expr" | superduck exec --tab <id> --stdin
//
// Runs JavaScript in the page context via the extension's `javascript_tool`
// (action "javascript_exec"). The result of the last expression is returned.
// Per the tool docs, do NOT use `return ...` — write a bare expression.
func cmdExec(argv []string) error {
	fs := flag.NewFlagSet("exec", flag.ContinueOnError)
	file := fs.String("file", "", "Read JS source from this file")
	stdin := fs.Bool("stdin", false, "Read JS source from stdin")
	resultOnly := fs.Bool("result-only", false, "Print only the execution result")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}

	rest := fs.Args()
	if (*stdin && *file != "") || ((*stdin || *file != "") && len(rest) != 0) || (!*stdin && *file == "" && len(rest) != 1) {
		return fmt.Errorf("usage: superduck --tab <id> exec [--result-only] <js-code> | --file PATH | --stdin")
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
		code = rest[0]
	}
	if strings.TrimSpace(code) == "" {
		return fmt.Errorf("JavaScript source is empty")
	}

	args := map[string]any{
		"action": "javascript_exec",
		"text":   code,
	}
	if *resultOnly {
		args["resultOnly"] = true
		return runSimpleResultOnly("javascript_tool", "exec", args)
	}
	return runSimpleTool("javascript_tool", "exec", args)
}
