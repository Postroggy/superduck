package main

import (
	"flag"
	"fmt"
	"strconv"
)

func viewportParams(width, height int, dpr float64, mobile bool) map[string]any {
	if dpr <= 0 {
		dpr = 1
	}
	return map[string]any{
		"width":             width,
		"height":            height,
		"deviceScaleFactor": dpr,
		"mobile":            mobile,
	}
}

// cmdViewport: superduck viewport --tab <id> <width> <height> [--dpr N] [--mobile]
//
//	superduck viewport --tab <id> --clear [--reload]
func cmdViewport(argv []string) error {
	fs := flag.NewFlagSet("viewport", flag.ContinueOnError)
	dpr := fs.Float64("dpr", 0, "deviceScaleFactor of the emulated viewport, e.g. 2 for retina")
	mobile := fs.Bool("mobile", false, "Emulate a mobile viewport")
	clearViewport := fs.Bool("clear", false, "Drop the emulation and go back to the real window size")
	reload := fs.Bool("reload", false, "With --clear: reload the page so it lays out at the real size again")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for viewport")
	}
	args := map[string]any{"action": "send", "tabId": gflags.Tab}
	if *clearViewport {
		args["method"] = "Emulation.clearDeviceMetricsOverride"
		if err := runToolOutput("superduck_cdp", "viewport", args); err != nil {
			return err
		}
		if *reload {
			return runToolOutput("superduck_cdp", "viewport", map[string]any{
				"action": "send",
				"tabId":  gflags.Tab,
				"method": "Page.reload",
			})
		}
		return nil
	}

	rest := fs.Args()
	if len(rest) != 2 {
		return fmt.Errorf("usage: superduck viewport --tab <id> <width> <height> [--dpr N] [--mobile]")
	}
	width, err := strconv.Atoi(rest[0])
	if err != nil || width <= 0 {
		return fmt.Errorf("invalid width: %s", rest[0])
	}
	height, err := strconv.Atoi(rest[1])
	if err != nil || height <= 0 {
		return fmt.Errorf("invalid height: %s", rest[1])
	}

	args["method"] = "Emulation.setDeviceMetricsOverride"
	args["params"] = viewportParams(width, height, *dpr, *mobile)
	return runToolOutput("superduck_cdp", "viewport", args)
}
