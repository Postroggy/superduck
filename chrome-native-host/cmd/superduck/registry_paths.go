package main

import "strings"

// registryKeyWriter abstracts HKCU registry key creation so the install
// logic can be unit-tested without touching the real registry.
type registryKeyWriter interface {
	CreateKey(path string, access uint32) (registryKey, bool, error)
}

// registryKey is the subset of golang.org/x/sys/windows/registry.Key that the
// installer needs; kept as an interface so tests can fake it.
type registryKey interface {
	SetStringValue(name, value string) error
	Close() error
}

// registryWriter is swappable for tests; nil disables registry writes.
// On Windows builds it is set to registryPkg{} via init() in
// registry_windows.go. Windows registry keys use a shared lock, so callers
// should run these sequentially.
var registryWriter registryKeyWriter

// windowsRegistryPaths maps a browser name to the HKCU subkey base under which
// its native messaging hosts are registered on Windows. Per Chromium docs:
//
//	Chrome / Chrome for Testing / Chromium: Software\Google\Chrome\NativeMessagingHosts
//	Edge:                                  Software\Microsoft\Edge\NativeMessagingHosts
//	Brave:                                 Software\BraveSoftware\Brave-Browser\NativeMessagingHosts
func windowsRegistryPaths(browser string) (string, bool) {
	switch strings.ToLower(browser) {
	case "chrome":
		return `Software\Google\Chrome\NativeMessagingHosts`, true
	case "edge":
		return `Software\Microsoft\Edge\NativeMessagingHosts`, true
	case "brave":
		return `Software\BraveSoftware\Brave-Browser\NativeMessagingHosts`, true
	default:
		return "", false
	}
}
