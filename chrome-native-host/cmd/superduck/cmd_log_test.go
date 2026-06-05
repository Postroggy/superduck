package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSplitLines(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		// splitLines on "" returns nil (no allocation); accept either.
		{"empty", "", nil},
		{"single line no newline", "hello", []string{"hello"}},
		{"single line with newline", "hello\n", []string{"hello"}},
		{"multiple LF", "a\nb\nc\n", []string{"a", "b", "c"}},
		{"multiple CRLF", "a\r\nb\r\nc\r\n", []string{"a", "b", "c"}},
		// A bare \r in the middle of a line is preserved — splitLines
		// only strips \r when it immediately precedes \n. Classic Mac
		// CR-only line endings aren't a target use case.
		{"bare CR mid-line is preserved", "a\r\nb\rc\n", []string{"a", "b\rc"}},
		{"no trailing newline", "a\nb\nc", []string{"a", "b", "c"}},
		{"empty middle line", "a\n\nb\n", []string{"a", "", "b"}},
		{"CR in middle of line is preserved", "a\rb\n", []string{"a\rb"}},
		{"just a CR (no LF)", "a\rb", []string{"a\rb"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitLines(tt.in)
			if len(got) == 0 && len(tt.want) == 0 {
				return // both empty/nil
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("splitLines(%q) = %#v, want %#v", tt.in, got, tt.want)
			}
		})
	}
}

func TestTrimCR(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", ""},
		{"foo", "foo"},
		{"foo\r", "foo"},
		{"foo\r\n", "foo\r\n"}, // trimCR only strips a single trailing \r
		{"\r", ""},
	}
	for _, tt := range tests {
		if got := trimCR(tt.in); got != tt.want {
			t.Errorf("trimCR(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

// helper: write content to a temp file and return the *os.File.
func writeTempFile(t *testing.T, content string) *os.File {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "log.txt")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open temp file: %v", err)
	}
	t.Cleanup(func() { f.Close() })
	return f
}

func TestTailLines_EmptyFile(t *testing.T) {
	f := writeTempFile(t, "")
	got, err := tailLines(f, 10)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	if got != nil && len(got) != 0 {
		t.Errorf("expected empty/nil result, got %#v", got)
	}
}

func TestTailLines_FitsInOneChunk(t *testing.T) {
	// 30 short lines, well under the 8KB chunk size.
	var b strings.Builder
	for i := 0; i < 30; i++ {
		b.WriteString("line\n")
	}
	f := writeTempFile(t, b.String())

	got, err := tailLines(f, 5)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	want := []string{"line", "line", "line", "line", "line"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func TestTailLines_ExactlyOneChunk(t *testing.T) {
	// Build a file whose total size is exactly the chunk size (8192).
	// "abcd\n" is 5 bytes, so 1638 lines = 8190 bytes, plus 2 more
	// bytes to land on 8192.
	var b strings.Builder
	for i := 0; i < 1638; i++ {
		b.WriteString("abcd\n") // 5 * 1638 = 8190
	}
	b.WriteString("xy") // 8190 + 2 = 8192
	if b.Len() != 8192 {
		t.Fatalf("setup error: expected 8192 bytes, got %d", b.Len())
	}
	f := writeTempFile(t, b.String())

	got, err := tailLines(f, 3)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	want := []string{"abcd", "abcd", "xy"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func TestTailLines_SpansMultipleChunks(t *testing.T) {
	// Force at least two chunk reads. Each line is 6 bytes, so we need
	// more than 8KB / 6 = 1365 lines to exceed a single chunk.
	var b strings.Builder
	for i := 0; i < 2000; i++ {
		b.WriteString("xyz\n")
	}
	f := writeTempFile(t, b.String())

	got, err := tailLines(f, 5)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	if len(got) != 5 {
		t.Fatalf("got %d lines, want 5", len(got))
	}
	for _, line := range got {
		if line != "xyz" {
			t.Errorf("unexpected line content: %q", line)
		}
	}
}

func TestTailLines_LineSpansChunkBoundary(t *testing.T) {
	// Build: <8190 bytes of "a\n"> (4095 lines) + "longline_ending_here" (no \n)
	// = total 8190 + 20 = 8210 bytes. The final line straddles the 8192
	// boundary and is not terminated.
	var b strings.Builder
	for i := 0; i < 4095; i++ {
		b.WriteString("a\n")
	}
	b.WriteString("longline_ending_here")
	f := writeTempFile(t, b.String())

	got, err := tailLines(f, 2)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	// The last line of the file is not \n-terminated and is the only
	// one that survives the tail cap of 2. The line before it ("a") is
	// also picked up.
	want := []string{"a", "longline_ending_here"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func TestTailLines_CRLF(t *testing.T) {
	f := writeTempFile(t, "one\r\ntwo\r\nthree\r\nfour\r\n")

	got, err := tailLines(f, 2)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	want := []string{"three", "four"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func TestTailLines_NGreaterThanTotal(t *testing.T) {
	f := writeTempFile(t, "a\nb\nc\n")

	got, err := tailLines(f, 100)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func TestTailLines_NZero(t *testing.T) {
	f := writeTempFile(t, "a\nb\nc\n")

	got, err := tailLines(f, 0)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected 0 lines, got %d: %#v", len(got), got)
	}
}

func TestTailLines_DropsEmptyLines(t *testing.T) {
	// tailFile historically stored "" for empty lines (ring buffer slot
	// count matched the input line count), but printing "" looks like
	// a blank record. The new implementation drops them — pin that.
	f := writeTempFile(t, "a\n\nb\n\n\nc\n")

	got, err := tailLines(f, 10)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func TestTailLines_NoTrailingNewline(t *testing.T) {
	f := writeTempFile(t, "first\nsecond\nthird")

	got, err := tailLines(f, 2)
	if err != nil {
		t.Fatalf("tailLines: %v", err)
	}
	want := []string{"second", "third"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}
