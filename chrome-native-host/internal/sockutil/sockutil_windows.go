//go:build windows

package sockutil

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"github.com/Microsoft/go-winio"
)

const DefaultPathValue = `\\.\pipe\superduck-native-host`

func defaultPath() string {
	return DefaultPathValue
}

// listen creates a named-pipe listener. Windows does not support Unix domain
// sockets for listening, so we use go-winio's named-pipe implementation,
// which the Go "unix" dialer can still connect to.
func listen(path string) (net.Listener, error) {
	cfg := &winio.PipeConfig{
		// Owner-only DACL: the CLI, MCP server and Chrome-launched
		// native-host all run as the same user (HKCU-installed), so no one
		// else should be able to dial this pipe.
		SecurityDescriptor: "D:P(A;;GA;;;OW)",
	}
	l, err := winio.ListenPipe(path, cfg)
	if err != nil {
		return nil, fmt.Errorf("listen named pipe: %w", err)
	}
	return l, nil
}

func dialTimeout(path string, timeout time.Duration) (net.Conn, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return winio.DialPipeContext(ctx, path)
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
// transport supports it. On Windows the pipe DACL is fixed at creation time
// (see listen), so this is a no-op.
func RestrictPermissions(path string) error {
	return nil
}

// IsConnRefused reports whether the error indicates the peer is not listening,
// as opposed to a permission error or other dial failure. On Windows a missing
// pipe surfaces as "cannot find the file specified" and a pipe with no active
// server as "pipe has been ended" / connection-refused style errors.
func IsConnRefused(err error) bool {
	if err == nil {
		return false
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		var sysErr *os.SyscallError
		if errors.As(opErr.Err, &sysErr) {
			return containsRefused(sysErr.Err.Error())
		}
	}
	return containsRefused(err.Error())
}

func containsRefused(s string) bool {
	lower := strings.ToLower(s)
	for _, sub := range []string{
		"no such file",
		"cannot find the file",
		"connection refused",
		"actively refused",
		"pipe",
	} {
		if strings.Contains(lower, sub) {
			return true
		}
	}
	return false
}
