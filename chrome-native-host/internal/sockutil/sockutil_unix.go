//go:build !windows

package sockutil

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"syscall"
	"time"
)

const DefaultPathValue = "/tmp/chrome-native-host.sock"

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
// process and clears it so a fresh listener can bind. On unix this handles
// stale socket files; on Windows it is a no-op.
func Prepare(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // No existing socket, safe to proceed
		}
		return fmt.Errorf("failed to stat UDS socket: %w", err)
	}

	if info.Mode()&os.ModeSocket == 0 {
		return fmt.Errorf("path %s exists but is not a socket (mode: %v)", path, info.Mode())
	}

	conn, err := net.DialTimeout("unix", path, 200*time.Millisecond)
	if err == nil {
		_ = conn.Close()

		// The socket is responding, but the owning process may be shutting
		// down (race between old process SIGTERM/stdin-close and new process
		// startup). Retry with short intervals — the old process typically
		// exits within 200-300ms based on observed logs.
		const maxRetries = 5
		const retryInterval = 300 * time.Millisecond

		slog.Info("socket appears active, retrying in case old process is shutting down", "path", path, "maxRetries", maxRetries)
		stillAlive := true
		for i := 0; i < maxRetries; i++ {
			time.Sleep(retryInterval)
			c, e := net.DialTimeout("unix", path, 200*time.Millisecond)
			if e != nil {
				if IsConnRefused(e) {
					slog.Info("previous process exited during retry", "path", path, "attempt", i+1)
					stillAlive = false
					break
				}
				return fmt.Errorf("socket at %s dial failed with unexpected error during retry %d: %w", path, i+1, e)
			}
			_ = c.Close()
		}
		if stillAlive {
			return fmt.Errorf("chrome-native-host already listening at %s", path)
		}
		// Fall through to stale socket cleanup below
	} else if !IsConnRefused(err) {
		// Only treat connection-refused errors as stale sockets.
		// Other dial failures (permission denied, path is a directory, etc.)
		// indicate a real problem and should not be silently removed.
		return fmt.Errorf("socket at %s exists and dial failed with unexpected error: %w", path, err)
	}

	// Revalidate before cleanup: another replacement process may have
	// bound a live socket at this path while we were in the retry loop.
	// If the socket is now active, abort — the other process owns it.
	conn, err = net.DialTimeout("unix", path, 200*time.Millisecond)
	if err == nil {
		_ = conn.Close()
		return fmt.Errorf("chrome-native-host already listening at %s (recheck)", path)
	}
	if !IsConnRefused(err) {
		return fmt.Errorf("socket at %s recheck dial failed with unexpected error: %w", path, err)
	}

	// Socket is stale. Rename first to free the path immediately, then
	// remove the renamed file. A unique suffix avoids colliding with a
	// leftover .stale file from a previous crashed cleanup.
	stalePath := fmt.Sprintf("%s.stale.%d", path, os.Getpid())
	if err := os.Rename(path, stalePath); err != nil {
		// Rename failed — the file may have been removed by the dying
		// process (Go's net.Listener.Close removes UDS files). Check
		// if the path is already gone; if so, we're done.
		if os.IsNotExist(err) {
			return nil
		}
		// If rename fails for other reasons, try direct remove as fallback
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("failed to remove stale UDS socket: %w", err)
		}
		return nil
	}
	// Successfully renamed, now remove the renamed file
	if err := os.Remove(stalePath); err != nil {
		// Log but don't fail - the important thing is the original path is clear
		slog.Warn("failed to remove renamed stale socket", "path", stalePath, "error", err)
	}
	return nil
}

// StatPath stats the transport path, if the transport exposes a filesystem
// path. On unix this is os.Lstat; on Windows it reports the path as absent.
func StatPath(path string) (os.FileInfo, error) {
	return os.Lstat(path)
}

// RestrictPermissions tightens transport access to the owning user where the
// transport supports it. On unix the socket file is chmod 0700; on Windows
// named-pipe ACLs are handled by the OS, so this is a no-op.
func RestrictPermissions(path string) error {
	return os.Chmod(path, 0700)
}

// IsConnRefused reports whether the error indicates the peer is not listening
// (connection refused or socket file does not exist), as opposed to a
// permission error or other dial failure.
func IsConnRefused(err error) bool {
	if err == nil {
		return false
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		var sysErr *os.SyscallError
		if errors.As(opErr.Err, &sysErr) {
			return sysErr.Err == syscall.ECONNREFUSED || sysErr.Err == syscall.ENOENT
		}
	}
	errStr := err.Error()
	return containsAny(errStr, "connection refused", "no such file or directory")
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if len(sub) > 0 && indexOf(s, sub) >= 0 {
			return true
		}
	}
	return false
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
