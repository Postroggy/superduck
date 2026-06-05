package main

import (
	"flag"
	"fmt"
	"time"

	"chrome-native-host/internal/cliclient"
)

// cmdScreenshot captures a screenshot of the target tab via the native-host
// UDS. It invokes the same `computer` tool that `superduck computer ...` uses,
// but is exposed as a top-level command for ergonomic use.
func cmdScreenshot(argv []string) error {
	fs := flag.NewFlagSet("screenshot", flag.ContinueOnError)
	output := fs.String("output", "", "Save the captured image to this path or directory (trailing / uses native-host UUID as filename)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for screenshot (use `superduck tabs` to find a tab id)")
	}
	args := map[string]any{"action": "screenshot", "tabId": gflags.Tab}

	rec := cliclient.AuditRecord{Cmd: "screenshot"}
	v, err := callWithRetry("computer", args, 6, 500*time.Millisecond)
	if err != nil {
		_ = cliclient.WriteAudit(rec)
		return err
	}
	rec.OK = true
	_ = cliclient.WriteAudit(rec)

	return handleImageCapture(v, *output, "screenshot")
}
