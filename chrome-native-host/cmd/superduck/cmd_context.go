package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"chrome-native-host/internal/cliclient"
)

func cmdContext(argv []string) error {
	fs := flag.NewFlagSet("context", flag.ContinueOnError)
	full := fs.Bool("full", false, "Return whole-page innerText (warning: may be large)")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	args := map[string]any{}
	if gflags.Tab != 0 {
		args["tabId"] = gflags.Tab
	}
	if *full {
		args["full"] = true
	}

	rec := cliclient.AuditRecord{Cmd: "context"}
	raw, err := cliclient.TimedCall("superduck_active_context", args, clientOpts(), &rec)

	var data map[string]any
	if err == nil {
		_ = json.Unmarshal([]byte(raw), &data)
		if data != nil {
			if t, ok := data["tabId"].(float64); ok {
				n := int(t)
				rec.TabID = &n
			}
			if u, ok := data["url"].(string); ok {
				rec.SetURL(u)
			}
		}
	}
	_ = cliclient.WriteAudit(rec)
	if gflags.JSON {
		if err != nil {
			out, _ := json.Marshal(map[string]any{"ok": false, "error": err.Error()})
			fmt.Println(string(out))
			return err
		}
		fmt.Println(raw)
		return nil
	}
	if err != nil {
		return err
	}

	if data != nil {
		fmt.Fprintf(os.Stdout, "tab    %s  (window %s)\n", numAsInt(data["tabId"]), numAsInt(data["windowId"]))
		fmt.Fprintf(os.Stdout, "url    %s\n", data["url"])
		fmt.Fprintf(os.Stdout, "title  %s\n", data["title"])
		if sel, _ := data["selection"].(string); sel != "" {
			fmt.Fprintf(os.Stdout, "selection:\n  %s\n", truncate(sel, 500))
		}
		text, _ := data["text"].(string)
		fmt.Fprintln(os.Stdout)
		fmt.Println(text)
		if *full {
			fmt.Fprintf(os.Stderr, "(--full: %d chars; consider piping to head/less for token cost)\n", len(text))
		}
		return nil
	}
	fmt.Println(raw)
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func numAsInt(v any) string {
	if f, ok := v.(float64); ok {
		return fmt.Sprintf("%d", int64(f))
	}
	return fmt.Sprintf("%v", v)
}
