package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"text/tabwriter"

	"chrome-native-host/internal/cliclient"
)

func cmdTabs(argv []string) error {
	fs := flag.NewFlagSet("tabs", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	rec := cliclient.AuditRecord{Cmd: "tabs"}
	raw, err := cliclient.RunTool("superduck_list_tabs", nil, clientOpts(), &rec)
	if err != nil {
		return err
	}

	if gflags.JSON {
		fmt.Println(raw)
		return nil
	}
	var data struct {
		ActiveWindowID int `json:"activeWindowId"`
		Tabs           []struct {
			ID            int    `json:"id"`
			WindowID      int    `json:"windowId"`
			URL           string `json:"url"`
			Title         string `json:"title"`
			Active        bool   `json:"active"`
			FocusedWindow bool   `json:"focusedWindow"`
		} `json:"tabs"`
	}
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		fmt.Println(raw)
		return nil
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ACTIVE\tID\tWIN\tTITLE\tURL")
	for _, t := range data.Tabs {
		mark := " "
		if t.Active && t.FocusedWindow {
			mark = "►"
		} else if t.Active {
			mark = "•"
		}
		fmt.Fprintf(w, "%s\t%d\t%d\t%s\t%s\n", mark, t.ID, t.WindowID, truncate(t.Title, 40), truncate(t.URL, 60))
	}
	w.Flush()
	return nil
}
