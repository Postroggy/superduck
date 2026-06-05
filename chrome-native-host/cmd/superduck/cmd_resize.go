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
	if w <= 0 {
		return fmt.Errorf("width must be a positive number, got %d", w)
	}
	if h <= 0 {
		return fmt.Errorf("height must be a positive number, got %d", h)
	}
	return runSimpleTool("resize_window", "resize", map[string]any{"width": w, "height": h})
}
