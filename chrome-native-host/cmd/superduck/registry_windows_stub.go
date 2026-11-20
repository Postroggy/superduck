//go:build !windows

package main

// writeNativeHostRegistryKey is a no-op on non-Windows hosts: the manifest
// directories are used directly and no HKCU registry keys exist.
func writeNativeHostRegistryKey(browser, hostName, manifestPath string) error {
	return nil
}

func readNativeHostRegistryManifest(browser, hostName string) (string, bool) {
	return "", false
}
