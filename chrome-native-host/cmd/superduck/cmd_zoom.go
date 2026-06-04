package main

import (
	"flag"
	"fmt"
	"strconv"
	"time"

	"chrome-native-host/internal/cliclient"
)

// cmdZoom: `superduck zoom --tab <id> <x0> <y0> <x1> <y1> [--output PATH]`
// captures a region as an image. The native-host returns the same payload
// shape as `screenshot`, so we reuse the image-extraction / file-saving logic.
func cmdZoom(argv []string) error {
	fs := flag.NewFlagSet("zoom", flag.ContinueOnError)
	output := fs.String("output", "", "Save the captured image to this path or directory")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for zoom")
	}
	rest := fs.Args()
	if len(rest) < 4 {
		return fmt.Errorf("usage: superduck zoom --tab <id> <x0> <y0> <x1> <y1> [--output PATH]")
	}
	region := make([]float64, 4)
	for i := 0; i < 4; i++ {
		v, err := strconv.ParseFloat(rest[i], 64)
		if err != nil {
			return fmt.Errorf("invalid region value %q: %v", rest[i], err)
		}
		region[i] = v
	}

	args := map[string]any{"action": "zoom", "tabId": gflags.Tab, "region": region}
	rec := cliclient.AuditRecord{Cmd: "zoom"}
	v, err := callWithRetry("computer", args, 6, 500*time.Millisecond)
	if err != nil {
		_ = cliclient.WriteAudit(rec)
		return err
	}
	rec.OK = true
	_ = cliclient.WriteAudit(rec)

	return handleImageCapture(v, *output, "zoom")
}
