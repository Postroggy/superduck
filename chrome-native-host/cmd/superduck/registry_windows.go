package main

import (
	"fmt"

	"golang.org/x/sys/windows/registry"
)

// Windows native messaging host registration:
//   - HKCU\Software\Google\Chrome\NativeMessagingHosts\<name> (Chrome)
//   - HKCU\Software\Microsoft\Edge\NativeMessagingHosts\<name>   (Edge)
//   - HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\<name> (Brave)
//
// Each key holds a single default value pointing at the manifest JSON file.
// Chrome documentation: https://developer.chrome.com/docs/extensions/how-to/native-messaging

type registryPkg struct{}

func (registryPkg) CreateKey(path string, access uint32) (registryKey, bool, error) {
	return registry.CreateKey(registry.CURRENT_USER, path, access)
}

func init() {
	registryWriter = registryPkg{}
}

// writeNativeHostRegistryKey writes a HKCU registry key pointing the browser
// at the manifest JSON file. If registryWriter is nil the call is a no-op
// (used by tests and non-Windows builds).
func writeNativeHostRegistryKey(browser, hostName, manifestPath string) error {
	if registryWriter == nil {
		return nil
	}
	base, ok := windowsRegistryPaths(browser)
	if !ok {
		return fmt.Errorf("unsupported browser for registry install: %s", browser)
	}
	keyPath := base + `\` + hostName
	key, _, err := registryWriter.CreateKey(keyPath, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("create registry key %s: %w", keyPath, err)
	}
	defer key.Close()
	if err := key.SetStringValue("", manifestPath); err != nil {
		return fmt.Errorf("set default value on %s: %w", keyPath, err)
	}
	return nil
}
