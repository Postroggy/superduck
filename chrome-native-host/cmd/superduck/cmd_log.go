package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"

	"chrome-native-host/internal/cliclient"
)

func cmdLog(argv []string) error {
	fs := flag.NewFlagSet("log", flag.ContinueOnError)
	tail := fs.Int("tail", 0, "Show only last N records (capped at 100000)")
	if err := fs.Parse(argv); err != nil {
		return err
	}
	if *tail > 100000 {
		*tail = 100000
	}

	path, err := cliclient.AuditPath()
	if err != nil {
		return err
	}
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintln(os.Stderr, "no audit log yet:", path)
			return nil
		}
		return err
	}
	defer f.Close()

	if *tail <= 0 {
		// No tail specified, print all lines
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 1024*1024), 1024*1024)
		for sc.Scan() {
			fmt.Println(sc.Text())
		}
		return sc.Err()
	}

	// Efficient tail implementation: read from end of file
	return tailFile(f, *tail)
}

// tailFile efficiently reads the last n lines from a file
func tailFile(f *os.File, n int) error {
	// Get file size
	stat, err := f.Stat()
	if err != nil {
		return err
	}
	size := stat.Size()
	if size == 0 {
		return nil
	}

	// Read from end in chunks
	const chunkSize = 8192
	lines := make([]string, 0, n)
	pos := size
	var leftover string

	for pos > 0 && len(lines) < n {
		readSize := int64(chunkSize)
		if pos < readSize {
			readSize = pos
		}
		pos -= readSize

		buf := make([]byte, readSize)
		if _, err := f.ReadAt(buf, pos); err != nil {
			return err
		}

		// Combine with leftover from previous chunk
		chunk := string(buf) + leftover
		chunkLines := splitLines(chunk)

		// First line might be incomplete, save it for next iteration
		if pos > 0 {
			leftover = chunkLines[0]
			chunkLines = chunkLines[1:]
		} else {
			leftover = ""
		}

		// Add lines in reverse order
		for i := len(chunkLines) - 1; i >= 0 && len(lines) < n; i-- {
			if chunkLines[i] != "" {
				lines = append(lines, chunkLines[i])
			}
		}
	}

	// Print lines in correct order (reverse of how we collected them)
	for i := len(lines) - 1; i >= 0; i-- {
		fmt.Println(lines[i])
	}

	return nil
}

// splitLines splits a string into lines, handling both \n and \r\n
func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			line := s[start:i]
			// Remove trailing \r if present
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			lines = append(lines, line)
			start = i + 1
		}
	}
	// Handle last line without newline
	if start < len(s) {
		line := s[start:]
		if len(line) > 0 && line[len(line)-1] == '\r' {
			line = line[:len(line)-1]
		}
		lines = append(lines, line)
	}
	return lines
}
