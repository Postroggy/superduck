package main

import (
	"fmt"
	"strconv"
)

// cmdResize: superduck resize --tab <id> <width> <height>
func cmdResize(argv []string) error {
	if len(argv) < 2 {
		return fmt.Errorf("usage: superduck resize --tab <id> <width> <height>")
	}
	w, err := strconv.Atoi(argv[0])
	if err != nil {
		return fmt.Errorf("invalid width: %v", err)
	}
	h, err := strconv.Atoi(argv[1])
	if err != nil {
		return fmt.Errorf("invalid height: %v", err)
	}
	if w <= 0 || w > 7680 {
		return fmt.Errorf("width must be between 1 and 7680 pixels, got %d", w)
	}
	if h <= 0 || h > 4320 {
		return fmt.Errorf("height must be between 1 and 4320 pixels, got %d", h)
	}
	return runSimpleTool("resize_window", "resize", map[string]any{"width": w, "height": h})
}
