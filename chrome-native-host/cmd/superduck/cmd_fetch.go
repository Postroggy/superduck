package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"chrome-native-host/internal/cliclient"
)

type headerFlags []string

func (h *headerFlags) String() string     { return strings.Join(*h, ",") }
func (h *headerFlags) Set(s string) error { *h = append(*h, s); return nil }

func cmdFetch(argv []string) error {
	fs := flag.NewFlagSet("fetch", flag.ContinueOnError)
	var method, data string
	fs.StringVar(&method, "method", "GET", "HTTP method")
	fs.StringVar(&method, "X", "GET", "Alias for --method")
	fs.StringVar(&data, "data", "", "Request body")
	fs.StringVar(&data, "d", "", "Alias for --data")
	allowCross := fs.Bool("allow-cross-origin", false, "Allow target host outside source eTLD+1")
	var hdrs headerFlags
	fs.Var(&hdrs, "H", "Header (-H 'Key: Value', repeatable)")
	fs.Var(&hdrs, "header", "Header (repeatable)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 1 {
		return fmt.Errorf("usage: superduck fetch <url> [--method M] [-H 'K:V'] [--data BODY] [--allow-cross-origin]")
	}
	url := rest[0]

	headerMap := map[string]any{}
	for _, h := range hdrs {
		i := strings.Index(h, ":")
		if i < 0 {
			return fmt.Errorf("invalid header (missing ':'): %q", h)
		}
		headerMap[strings.TrimSpace(h[:i])] = strings.TrimSpace(h[i+1:])
	}

	args := map[string]any{
		"url":              url,
		"method":           strings.ToUpper(method),
		"allowCrossOrigin": *allowCross,
	}
	if data != "" {
		args["body"] = data
	}
	if len(headerMap) > 0 {
		args["headers"] = headerMap
	}
	if gflags.Tab != 0 {
		args["sourceTabId"] = gflags.Tab
	}

	rec := cliclient.AuditRecord{Cmd: "fetch", CrossOrigin: *allowCross}
	rec.SetURL(url)
	raw, err := cliclient.TimedCall("superduck_background_fetch", args, clientOpts(), &rec)

	var resp map[string]any
	if err == nil {
		if jerr := json.Unmarshal([]byte(raw), &resp); jerr == nil {
			if s, ok := resp["status"].(float64); ok {
				rec.Status = int(s)
			}
		}
	}
	_ = cliclient.WriteAudit(rec)
	if err != nil {
		return err
	}

	if gflags.JSON {
		fmt.Println(raw)
		return nil
	}
	if resp != nil {
		fmt.Fprintf(os.Stderr, "HTTP %v %v  (cross-origin=%v, source=%v target=%v)\n",
			resp["status"], resp["statusText"], !asBool(resp["sameDomain"]),
			resp["sourceETld"], resp["targetETld"])
		if hs, ok := resp["headers"].(map[string]any); ok {
			for k, v := range hs {
				if strings.EqualFold(k, "content-type") || strings.EqualFold(k, "content-length") {
					fmt.Fprintf(os.Stderr, "%s: %v\n", k, v)
				}
			}
		}
		fmt.Fprintln(os.Stderr)
		if b, ok := resp["body"].(string); ok {
			fmt.Println(b)
			return nil
		}
	}
	fmt.Println(raw)
	return nil
}

func asBool(v any) bool {
	b, _ := v.(bool)
	return b
}
