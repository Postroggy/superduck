package main

import (
	"errors"
	"testing"
)

type mockRegistryKey struct {
	values map[string]string
	closed bool
}

func (k *mockRegistryKey) SetStringValue(name, value string) error {
	if k.values == nil {
		k.values = map[string]string{}
	}
	k.values[name] = value
	return nil
}

func (k *mockRegistryKey) Close() error {
	k.closed = true
	return nil
}

type mockRegistryWriter struct {
	created    []string
	access     uint32
	createdKey *mockRegistryKey
	createErr  error
}

func (w *mockRegistryWriter) CreateKey(path string, access uint32) (registryKey, bool, error) {
	w.created = append(w.created, path)
	w.access = access
	if w.createErr != nil {
		return nil, false, w.createErr
	}
	if w.createdKey == nil {
		w.createdKey = &mockRegistryKey{}
	}
	return w.createdKey, false, nil
}

func TestWriteNativeHostRegistryKeyCreatesKeyWithDefaultValue(t *testing.T) {
	orig := registryWriter
	w := &mockRegistryWriter{}
	registryWriter = w
	defer func() { registryWriter = orig }()

	if err := writeNativeHostRegistryKey("chrome", "com.me.superduck_browser_extension", `C:\Users\me\AppData\Local\SuperDuck\com.me.superduck_browser_extension.json`); err != nil {
		t.Fatalf("writeNativeHostRegistryKey: %v", err)
	}

	wantPath := `Software\Google\Chrome\NativeMessagingHosts\com.me.superduck_browser_extension`
	if len(w.created) != 1 || w.created[0] != wantPath {
		t.Fatalf("created keys = %v, want [%s]", w.created, wantPath)
	}

	if w.createdKey == nil {
		t.Fatal("no registry key returned from CreateKey")
	}
	if w.createdKey.values[""] != `C:\Users\me\AppData\Local\SuperDuck\com.me.superduck_browser_extension.json` {
		t.Errorf("default value = %q, want manifest path", w.createdKey.values[""])
	}
	if !w.createdKey.closed {
		t.Error("registry key not closed")
	}
}

func TestWriteNativeHostRegistryKeyEdgePath(t *testing.T) {
	orig := registryWriter
	w := &mockRegistryWriter{}
	registryWriter = w
	defer func() { registryWriter = orig }()

	if err := writeNativeHostRegistryKey("edge", "com.me.superduck_browser_extension", `C:\x.json`); err != nil {
		t.Fatalf("writeNativeHostRegistryKey: %v", err)
	}

	wantPath := `Software\Microsoft\Edge\NativeMessagingHosts\com.me.superduck_browser_extension`
	if len(w.created) != 1 || w.created[0] != wantPath {
		t.Fatalf("created keys = %v, want [%s]", w.created, wantPath)
	}
}

func TestWriteNativeHostRegistryKeyBravePath(t *testing.T) {
	orig := registryWriter
	w := &mockRegistryWriter{}
	registryWriter = w
	defer func() { registryWriter = orig }()

	if err := writeNativeHostRegistryKey("brave", "com.me.superduck_browser_extension", `C:\x.json`); err != nil {
		t.Fatalf("writeNativeHostRegistryKey: %v", err)
	}

	wantPath := `Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.me.superduck_browser_extension`
	if len(w.created) != 1 || w.created[0] != wantPath {
		t.Fatalf("created keys = %v, want [%s]", w.created, wantPath)
	}
}

func TestWriteNativeHostRegistryKeyUnsupportedBrowser(t *testing.T) {
	orig := registryWriter
	w := &mockRegistryWriter{}
	registryWriter = w
	defer func() { registryWriter = orig }()

	if err := writeNativeHostRegistryKey("firefox", "host", "C:\\x.json"); err == nil {
		t.Fatal("expected error for unsupported browser")
	}
	if len(w.created) != 0 {
		t.Fatalf("created keys = %v, want none", w.created)
	}
}

func TestWriteNativeHostRegistryKeyPropagatesCreateError(t *testing.T) {
	orig := registryWriter
	w := &mockRegistryWriter{createErr: errors.New("access denied")}
	registryWriter = w
	defer func() { registryWriter = orig }()

	if err := writeNativeHostRegistryKey("chrome", "host", "C:\\x.json"); err == nil {
		t.Fatal("expected error to propagate from CreateKey")
	}
}

func TestWriteNativeHostRegistryKeyNilWriterIsNoop(t *testing.T) {
	orig := registryWriter
	registryWriter = nil
	defer func() { registryWriter = orig }()

	if err := writeNativeHostRegistryKey("chrome", "host", "C:\\x.json"); err != nil {
		t.Fatalf("nil writer should be a no-op, got %v", err)
	}
}

func TestWindowsRegistryPaths(t *testing.T) {
	cases := []struct {
		browser string
		want    string
		ok      bool
	}{
		{"chrome", `Software\Google\Chrome\NativeMessagingHosts`, true},
		{"CHROME", `Software\Google\Chrome\NativeMessagingHosts`, true},
		{"edge", `Software\Microsoft\Edge\NativeMessagingHosts`, true},
		{"brave", `Software\BraveSoftware\Brave-Browser\NativeMessagingHosts`, true},
		{"firefox", "", false},
		{"", "", false},
	}
	for _, c := range cases {
		got, ok := windowsRegistryPaths(c.browser)
		if got != c.want || ok != c.ok {
			t.Errorf("windowsRegistryPaths(%q) = (%q, %v), want (%q, %v)", c.browser, got, ok, c.want, c.ok)
		}
	}
}
