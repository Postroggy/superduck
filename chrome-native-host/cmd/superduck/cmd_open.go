package main

import (
	"encoding/json"
	"flag"
	"fmt"

	"chrome-native-host/internal/cliclient"
)

func cmdOpen(argv []string) error {
	fs := flag.NewFlagSet("open", flag.ContinueOnError)
	newTab := fs.Bool("new-tab", false, "Open in a new tab instead of navigating the active tab")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 1 {
		return fmt.Errorf("usage: superduck open <url> [--new-tab]")
	}
	url := rest[0]

	args := map[string]any{"url": url, "newTab": *newTab}
	if gflags.Tab != 0 {
		args["tabId"] = gflags.Tab
	}

	rec := cliclient.AuditRecord{Cmd: "open"}
	rec.SetURL(url)
	raw, err := cliclient.RunTool("superduck_open", args, clientOpts(), &rec)
	if err != nil {
		return err
	}

	if gflags.JSON {
		fmt.Println(raw)
		return nil
	}
	var data map[string]any
	if jerr := json.Unmarshal([]byte(raw), &data); jerr == nil {
		fmt.Printf("opened %s in tab %s (window %s, newTab=%v)\n",
			url, numAsInt(data["tabId"]), numAsInt(data["windowId"]), data["newTab"])
		return nil
	}
	fmt.Println(raw)
	return nil
}
