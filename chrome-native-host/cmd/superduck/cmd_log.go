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
	lines, err := tailLines(f, *tail)
	if err != nil {
		return err
	}
	for _, line := range lines {
		fmt.Println(line)
	}
	return nil
}

// tailLines returns the last n non-empty lines from f, in original
// (oldest-to-newest) order. An empty file returns an empty slice.
// Empty lines (lines that are blank even after \r stripping) are dropped
// to match the previous ring-buffer behavior, which never recorded "".
func tailLines(f *os.File, n int) ([]string, error) {
	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}
	size := stat.Size()
	if size == 0 {
		return nil, nil
	}

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
			return nil, err
		}

		chunk := string(buf) + leftover
		chunkLines := splitLines(chunk)

		if pos > 0 {
			leftover = chunkLines[0]
			chunkLines = chunkLines[1:]
		} else {
			leftover = ""
		}

		for i := len(chunkLines) - 1; i >= 0 && len(lines) < n; i-- {
			if chunkLines[i] != "" {
				lines = append(lines, chunkLines[i])
			}
		}
	}

	// Reverse so the caller gets oldest-to-newest order.
	for i, j := 0, len(lines)-1; i < j; i, j = i+1, j-1 {
		lines[i], lines[j] = lines[j], lines[i]
	}
	return lines, nil
}

// splitLines splits a string into lines on \n, stripping a trailing \r
// from each line so CRLF and bare-LF inputs both produce the same lines.
func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, trimCR(s[start:i]))
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, trimCR(s[start:]))
	}
	return lines
}

func trimCR(s string) string {
	if len(s) > 0 && s[len(s)-1] == '\r' {
		return s[:len(s)-1]
	}
	return s
}
