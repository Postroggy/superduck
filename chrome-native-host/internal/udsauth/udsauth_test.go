package udsauth

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerate(t *testing.T) {
	t1, err := Generate()
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}
	if len(t1) != 64 {
		t.Errorf("expected 64 hex chars (32 bytes), got %d", len(t1))
	}
	for _, c := range t1 {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("non-hex char in token: %c", c)
		}
	}

	// Two consecutive tokens must differ (probability of collision is ~0).
	t2, err := Generate()
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}
	if t1 == t2 {
		t.Error("two consecutive tokens are identical — RNG broken")
	}
}

func TestTokenPath(t *testing.T) {
	path := TokenPath()
	if path == "" {
		t.Fatal("TokenPath returned empty string")
	}
	if filepath.Base(path) != TokenFileName {
		t.Errorf("expected basename %q, got %q", TokenFileName, filepath.Base(path))
	}
	if !strings.HasSuffix(filepath.Dir(path), ".superduck") {
		t.Errorf("expected parent dir to end in .superduck, got %q", filepath.Dir(path))
	}
}

func TestWriteAndReadToken(t *testing.T) {
	// Redirect $HOME to a temp dir so we don't touch the user's real token.
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	const want = "abcd1234"
	if err := WriteToken(want); err != nil {
		t.Fatalf("WriteToken failed: %v", err)
	}

	// Verify the file was created with the expected mode bits.
	info, err := os.Stat(TokenPath())
	if err != nil {
		t.Fatalf("stat token file: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("token file mode = %o, want 0o600", perm)
	}

	// Verify the parent directory was created with 0o700.
	parentInfo, err := os.Stat(filepath.Dir(TokenPath()))
	if err != nil {
		t.Fatalf("stat token dir: %v", err)
	}
	if perm := parentInfo.Mode().Perm(); perm != 0o700 {
		t.Errorf("token dir mode = %o, want 0o700", perm)
	}

	got, err := ReadToken()
	if err != nil {
		t.Fatalf("ReadToken failed: %v", err)
	}
	if got != want {
		t.Errorf("ReadToken = %q, want %q", got, want)
	}
}

func TestReadToken_TrimsWhitespace(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	// WriteToken creates the parent dir; then overwrite the file with
	// whitespace-padded content to verify ReadToken trims it.
	if err := WriteToken("placeholder"); err != nil {
		t.Fatalf("WriteToken: %v", err)
	}
	if err := os.WriteFile(TokenPath(), []byte("  token-with-padding  \n"), 0o600); err != nil {
		t.Fatalf("write token: %v", err)
	}
	got, err := ReadToken()
	if err != nil {
		t.Fatalf("ReadToken failed: %v", err)
	}
	if got != "token-with-padding" {
		t.Errorf("ReadToken = %q, want %q", got, "token-with-padding")
	}
}

func TestReadToken_Empty(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	if err := WriteToken("placeholder"); err != nil {
		t.Fatalf("WriteToken: %v", err)
	}
	if err := os.WriteFile(TokenPath(), []byte("   \n"), 0o600); err != nil {
		t.Fatalf("write token: %v", err)
	}
	if _, err := ReadToken(); err == nil {
		t.Error("ReadToken on whitespace-only file should return error")
	}
}

func TestReadToken_Missing(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	if _, err := ReadToken(); err == nil {
		t.Error("ReadToken on missing file should return error")
	}
}
