package analytics

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestNewDisabledWithoutKey(t *testing.T) {
	t.Setenv(envWriteKey, "")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")
	PostHogWriteKey = ""

	c := New(Options{})
	if c.Enabled() {
		t.Fatalf("expected client disabled when no API key is configured")
	}
}

func TestNewDisabledWhenOptedOut(t *testing.T) {
	t.Setenv(envWriteKey, "phc_test_key")
	t.Setenv(envDisabled, "true")
	t.Setenv(envCI, "")

	c := New(Options{})
	if c.Enabled() {
		t.Fatalf("expected client disabled when SUPERDUCK_ANALYTICS_DISABLED=true")
	}
}

func TestNewDisabledInCI(t *testing.T) {
	t.Setenv(envWriteKey, "phc_test_key")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "true")

	c := New(Options{})
	if c.Enabled() {
		t.Fatalf("expected client disabled in CI")
	}
}

func TestEnabledClientCapturesEvents(t *testing.T) {
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")

	var hits int32
	var lastBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/capture/" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		buf := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(buf)
		lastBody = buf
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(Options{
		APIKey:     "phc_test_key",
		Host:       srv.URL,
		DistinctID: "user-123",
		HTTPClient: srv.Client(),
	})
	if !c.Enabled() {
		t.Fatalf("expected client enabled")
	}

	c.Capture("cli.command", map[string]any{"command": "screenshot", "ok": true})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c.Flush(ctx)

	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("expected exactly 1 capture call, got %d", hits)
	}

	var got map[string]any
	if err := json.Unmarshal(lastBody, &got); err != nil {
		t.Fatalf("response body was not JSON: %v\nbody=%s", err, string(lastBody))
	}
	if got["api_key"] != "phc_test_key" {
		t.Errorf("api_key not propagated: %v", got["api_key"])
	}
	if got["distinct_id"] != "user-123" {
		t.Errorf("distinct_id not propagated: %v", got["distinct_id"])
	}
	if got["event"] != "cli.command" {
		t.Errorf("event not propagated: %v", got["event"])
	}
	props, ok := got["properties"].(map[string]any)
	if !ok {
		t.Fatalf("properties missing or not an object")
	}
	if props["command"] != "screenshot" {
		t.Errorf("custom property dropped: %v", props["command"])
	}
	if props["$lib"] != "superduck-cli" {
		t.Errorf("expected $lib stamped, got %v", props["$lib"])
	}
}

func TestCaptureNoOpWhenDisabled(t *testing.T) {
	t.Setenv(envWriteKey, "")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")
	PostHogWriteKey = ""

	c := New(Options{})

	// Use a sentinel server that fails the test if hit.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("disabled client should not POST to %s", r.URL)
	}))
	defer srv.Close()
	c.host = srv.URL // even if someone forces a host, disabled means disabled

	c.Capture("cli.command", nil)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	c.Flush(ctx)
}

func TestCaptureRejectsEmptyEventName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("empty event name should not produce a capture call")
	}))
	defer srv.Close()

	c := New(Options{
		APIKey:     "phc_test_key",
		Host:       srv.URL,
		DistinctID: "user-123",
		HTTPClient: srv.Client(),
	})
	c.Capture("", map[string]any{"x": 1})

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	c.Flush(ctx)
}

func TestBuildCaptureBodyDoesNotAllowOverridingLibFields(t *testing.T) {
	body := buildCaptureBody("k", "u", "evt", map[string]any{
		"$lib":   "evil",
		"custom": 42,
	}, time.Unix(0, 0).UTC())

	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	props := got["properties"].(map[string]any)
	if props["$lib"] != "superduck-cli" {
		t.Errorf("$lib was overwritten by caller: %v", props["$lib"])
	}
	if props["custom"].(float64) != 42 {
		t.Errorf("custom prop was lost: %v", props["custom"])
	}
}

func TestLoadOrCreateDistinctIDPersistsAcrossCalls(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	// On macOS UserHomeDir checks $HOME first, so the override above is enough.

	first := loadOrCreateDistinctID()
	if first == "" {
		t.Fatalf("expected non-empty id")
	}
	if _, err := os.Stat(filepath.Join(tmp, ".superduck", "analytics-id")); err != nil {
		t.Fatalf("expected id file to be persisted: %v", err)
	}
	second := loadOrCreateDistinctID()
	if first != second {
		t.Errorf("expected stable id across calls, got %q vs %q", first, second)
	}
}
