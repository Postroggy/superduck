package main

import (
	"encoding/json"
	"flag"
	"fmt"

	"chrome-native-host/internal/cliclient"
)

func cmdPress(argv []string) error {
	fs := flag.NewFlagSet("press", flag.ContinueOnError)
	selector := fs.String("selector", "", "Optional selector to focus before pressing")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 1 {
		return fmt.Errorf("usage: superduck press <key> [--selector CSS]  (e.g. Enter, Tab, Escape)")
	}
	key := rest[0]

	args := map[string]any{"key": key}
	if *selector != "" {
		args["selector"] = *selector
	}
	if gflags.Tab != 0 {
		args["tabId"] = gflags.Tab
	}

	rec := cliclient.AuditRecord{Cmd: "press"}
	raw, err := cliclient.RunTool("superduck_press", args, clientOpts(), &rec)
	if err != nil {
		return err
	}

	if gflags.JSON {
		fmt.Println(raw)
		return nil
	}
	var data map[string]any
	if jerr := json.Unmarshal([]byte(raw), &data); jerr == nil {
		fmt.Printf("pressed %q on <%s> (tab %s)\n", data["key"], data["tag"], numAsInt(data["tabId"]))
		return nil
	}
	fmt.Println(raw)
	return nil
}
