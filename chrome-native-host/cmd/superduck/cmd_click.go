package main

import (
	"encoding/json"
	"flag"
	"fmt"

	"chrome-native-host/internal/cliclient"
)

func cmdClick(argv []string) error {
	fs := flag.NewFlagSet("click", flag.ContinueOnError)
	selector := fs.String("selector", "", "CSS selector to click")
	text := fs.String("text", "", "Click element by visible text (case-insensitive substring)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	if *selector == "" && *text == "" && len(rest) >= 1 {
		*text = rest[0]
	}
	if *selector == "" && *text == "" {
		return fmt.Errorf("usage: superduck click (--selector CSS | --text STR | <text>)")
	}

	args := map[string]any{}
	if *selector != "" {
		args["selector"] = *selector
	}
	if *text != "" {
		args["text"] = *text
	}
	if gflags.Tab != 0 {
		args["tabId"] = gflags.Tab
	}

	rec := cliclient.AuditRecord{Cmd: "click"}
	raw, err := cliclient.RunTool("superduck_click", args, clientOpts(), &rec)
	if err != nil {
		return err
	}

	if gflags.JSON {
		fmt.Println(raw)
		return nil
	}
	var data map[string]any
	if jerr := json.Unmarshal([]byte(raw), &data); jerr == nil {
		fmt.Printf("clicked <%s> %q (tab %s)\n", data["tag"], data["text"], numAsInt(data["tabId"]))
		return nil
	}
	fmt.Println(raw)
	return nil
}
