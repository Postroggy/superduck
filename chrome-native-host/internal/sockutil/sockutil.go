// Package sockutil provides the local transport between the superduck CLI and
// the chrome-native-host process. Unix builds use a Unix domain socket at
// /tmp/chrome-native-host.sock; Windows builds use a named pipe because Unix
// domain sockets do not exist on Windows.
package sockutil

import (
	"net"
	"time"
)

// DefaultPath returns the platform-specific local transport address.
func DefaultPath() string {
	return defaultPath()
}

// Listen creates a listener on the platform-specific transport.
func Listen(path string) (net.Listener, error) {
	return listen(path)
}

// DialTimeout connects to the platform-specific transport with a timeout.
func DialTimeout(path string, timeout time.Duration) (net.Conn, error) {
	return dialTimeout(path, timeout)
}
