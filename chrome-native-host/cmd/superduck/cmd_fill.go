package main

import (
	"encoding/json"
	"flag"
	"fmt"

	"chrome-native-host/internal/cliclient"
)

func cmdFill(argv []string) error {
	fs := flag.NewFlagSet("fill", flag.ContinueOnError)
	selector := fs.String("selector", "", "CSS selector for the input")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	value := ""
	if *selector == "" && len(rest) >= 2 {
		*selector = rest[0]
		value = rest[1]
	} else if len(rest) >= 1 {
		value = rest[0]
	}
	if *selector == "" {
		return fmt.Errorf("usage: superduck fill <selector> <value>  (or --selector CSS <value>)")
	}

	args := map[string]any{"selector": *selector, "value": value}
	if gflags.Tab != 0 {
		args["tabId"] = gflags.Tab
	}

	rec := cliclient.AuditRecord{Cmd: "fill"}
	raw, err := cliclient.RunTool("superduck_fill", args, clientOpts(), &rec)
	if err != nil {
		return err
	}

	if gflags.JSON {
		fmt.Println(raw)
		return nil
	}
	var data map[string]any
	if jerr := json.Unmarshal([]byte(raw), &data); jerr == nil {
		fmt.Printf("filled <%s> with %q (tab %s)\n", data["tag"], data["value"], numAsInt(data["tabId"]))
		return nil
	}
	fmt.Println(raw)
	return nil
}
