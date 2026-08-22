//go:build windows

package sockutil

import (
	"errors"
	"net"
	"os"
	"strings"
	"time"
)

const DefaultPathValue = `\\.\pipe\superduck-native-host`

func defaultPath() string {
	return DefaultPathValue
}

func listen(path string) (net.Listener, error) {
	return net.Listen("unix", path)
}

func dialTimeout(path string, timeout time.Duration) (net.Conn, error) {
	return net.DialTimeout("unix", path, timeout)
}

// Prepare checks the transport for a stale listener left by a crashed
// process and clears it so a fresh listener can bind. On Windows named pipes
// are kernel objects that vanish when the last handle closes, so there is no
// stale state to clear.
func Prepare(path string) error {
	return nil
}

// StatPath stats the transport path, if the transport exposes a filesystem
// path. On Windows named pipes have no filesystem path, so this always
// reports success with a nil FileInfo; callers must not dereference it.
func StatPath(path string) (os.FileInfo, error) {
	return nil, nil
}

// RestrictPermissions tightens transport access to the owning user where the
// transport supports it. On Windows named-pipe ACLs are handled by the OS, so
// this is a no-op.
func RestrictPermissions(path string) error {
	return nil
}

// IsConnRefused reports whether the error indicates the peer is not listening,
// as opposed to a permission error or other dial failure. On Windows the
// named-pipe wrapper reports "no such file or directory" for a missing pipe
// and "connection refused" style errors for an inactive one.
func IsConnRefused(err error) bool {
	if err == nil {
		return false
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		var sysErr *os.SyscallError
		if errors.As(opErr.Err, &sysErr) {
			return strings.Contains(strings.ToLower(sysErr.Err.Error()), "no such file") ||
				strings.Contains(strings.ToLower(sysErr.Err.Error()), "connection refused")
		}
	}
	return strings.Contains(strings.ToLower(err.Error()), "no such file") ||
		strings.Contains(strings.ToLower(err.Error()), "connection refused")
}
