package bridge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadAuthToken(t *testing.T) {
	// Create a temp home directory with a token file
	tmpHome := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpHome)
	defer os.Setenv("HOME", origHome)

	dir := filepath.Join(tmpHome, ".superduck")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}

	// Test: missing token file
	_, err := readAuthToken()
	if err == nil {
		t.Fatal("expected error for missing token file")
	}

	// Test: empty token file
	emptyPath := filepath.Join(dir, "uds-token")
	if err := os.WriteFile(emptyPath, []byte(""), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = readAuthToken()
	if err == nil {
		t.Fatal("expected error for empty token")
	}

	// Test: valid token
	validToken := "abc123def456"
	if err := os.WriteFile(emptyPath, []byte(validToken+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := readAuthToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != validToken {
		t.Errorf("token = %q, want %q", got, validToken)
	}
}

func TestValidateComputerArgs(t *testing.T) {
	tests := []struct {
		name string
		args map[string]interface{}
	}{
		{"valid duration", map[string]interface{}{"duration": float64(5)}},
		{"zero duration", map[string]interface{}{"duration": float64(0)}},
		{"max duration", map[string]interface{}{"duration": float64(30)}},
		{"no duration", map[string]interface{}{"action": "screenshot"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic
			validateComputerArgs(tt.args)
		})
	}
}
