package main

import (
	"flag"
	"fmt"
)

// cmdTypeText is `superduck type --tab <id> <text>` — typing characters into
// the focused element of the target tab.
func cmdTypeText(argv []string) error {
	fs := flag.NewFlagSet("type", flag.ContinueOnError)
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}

	args := fs.Args()
	if len(args) < 1 {
		return fmt.Errorf("usage: superduck type --tab <id> <text>")
	}
	return runAction("type", map[string]any{"text": args[0]})
}
