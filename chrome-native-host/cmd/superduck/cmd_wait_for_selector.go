package main

import (
	"flag"
	"fmt"
)

// cmdWaitForSelector: superduck wait_for_selector --tab <id> <selector> [--timeout N] [--absent]
//
// Waits until a CSS selector matches an element (or, with --absent, until it
// matches none) in the page. The extension's `computer` tool polls the page
// every 250ms, so this is the primitive to use instead of fixed `wait` seconds
// on lazily-rendered content (infinite scroll, SPA data, async lists).
func cmdWaitForSelector(argv []string) error {
	fs := flag.NewFlagSet("wait_for_selector", flag.ContinueOnError)
	timeout := fs.Int("timeout", 10, "Max seconds to wait (default 10, max 60)")
	absent := fs.Bool("absent", false, "Wait until the selector is ABSENT (e.g. a spinner disappears) instead of present")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 1 {
		return fmt.Errorf("usage: superduck wait_for_selector --tab <id> <css-selector> [--timeout N] [--absent]")
	}
	if *timeout <= 0 {
		return fmt.Errorf("--timeout must be positive, got %d", *timeout)
	}
	if *timeout > 60 {
		return fmt.Errorf("--timeout cannot exceed 60 seconds, got %d", *timeout)
	}

	return runAction("wait_for_selector", map[string]any{
		"selector": rest[0],
		"timeout":  *timeout,
		"absent":   *absent,
	})
}
