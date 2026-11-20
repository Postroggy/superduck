package main

import "flag"

// cmdNetwork: superduck network --tab <id> [--url-pattern P] [--clear] [--limit N]
//
//	--bodies also pulls request/response bodies and WebSocket frames.
func cmdNetwork(argv []string) error {
	fs := flag.NewFlagSet("network", flag.ContinueOnError)
	urlPattern := fs.String("url-pattern", "", "Substring URL filter")
	clearFlag := fs.Bool("clear", false, "Clear after reading")
	limit := fs.Int("limit", 0, "Max requests (default 100)")
	bodies := fs.Bool("bodies", false, "Include request/response bodies and WebSocket frames")
	maxBodyChars := fs.Int("max-body-chars", 0, "Clip each body to N chars with --bodies (default 4000)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	args := map[string]any{}
	if *urlPattern != "" {
		args["urlPattern"] = *urlPattern
	}
	if *clearFlag {
		args["clear"] = true
	}
	if *limit > 0 {
		args["limit"] = *limit
	}
	if *bodies {
		args["includeBodies"] = true
	}
	if *maxBodyChars > 0 {
		args["maxBodyChars"] = *maxBodyChars
	}
	return runSimpleTool("read_network_requests", "network", args)
}
