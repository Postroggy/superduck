package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"

	"chrome-native-host/internal/protocol"
	"chrome-native-host/internal/udsauth"
)

const (
	UDSPath        = "/tmp/chrome-native-host.sock"
	ConnectTimeout = 5 * time.Second
	ConnectRetries = 3
	DefaultTimeout = 30 * time.Second
	MaxTimeout     = 5 * time.Minute
)

// NativeHostBridge handles communication with the Chrome Native Host
type NativeHostBridge struct {
	conn   net.Conn
	connMu sync.Mutex
}

// New creates a new bridge to the Chrome Native Host
func New() (*NativeHostBridge, error) {
	conn, err := connectWithRetry()
	if err != nil {
		return nil, err
	}

	// Authenticate with the native host using the shared token.
	token, err := udsauth.ReadToken()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to read UDS auth token: %w", err)
	}

	authReq := map[string]string{"type": "auth", "token": token}
	if err := protocol.SendMessage(conn, authReq); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to send auth: %w", err)
	}

	// Wait for auth response
	raw, err := protocol.ReadMessage(conn)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("auth response read failed: %w", err)
	}
	var authResp struct {
		Type  string `json:"type"`
		OK    string `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &authResp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("auth response parse failed: %w", err)
	}
	if authResp.Type != "auth_response" || authResp.OK != "true" {
		conn.Close()
		if authResp.Error != "" {
			return nil, fmt.Errorf("UDS authentication failed: %s", authResp.Error)
		}
		return nil, fmt.Errorf("UDS authentication failed: unexpected response type=%q ok=%q", authResp.Type, authResp.OK)
	}

	slog.Info("connected to chrome-native-host", "path", UDSPath)

	return &NativeHostBridge{
		conn: conn,
	}, nil
}

func connectWithRetry() (net.Conn, error) {
	var conn net.Conn
	var err error

	for i := 0; i < ConnectRetries; i++ {
		conn, err = net.DialTimeout("unix", UDSPath, ConnectTimeout)
		if err == nil {
			return conn, nil
		}
		slog.Warn("failed to connect to UDS", "attempt", i+1, "max", ConnectRetries, "error", err)
		if i < ConnectRetries-1 {
			time.Sleep(time.Second)
		}
	}

	return nil, fmt.Errorf("failed to connect to chrome-native-host at %s: %w\nMake sure chrome-native-host is running with --uds flag", UDSPath, err)
}

// Close closes the connection to the native host
func (b *NativeHostBridge) Close() error {
	b.connMu.Lock()
	defer b.connMu.Unlock()
	if b.conn != nil {
		err := b.conn.Close()
		b.conn = nil
		return err
	}
	return nil
}

// reconnect attempts to re-establish the connection if it's broken
func (b *NativeHostBridge) reconnect() error {
	b.connMu.Lock()
	defer b.connMu.Unlock()

	// Check if current connection is still valid
	if b.conn != nil {
		// Try a zero-byte read with immediate deadline to check if connection is alive
		b.conn.SetReadDeadline(time.Now())
		var buf [1]byte
		n, err := b.conn.Read(buf[:])
		b.conn.SetReadDeadline(time.Time{})

		// If we got data (shouldn't happen) or a non-timeout error, connection is broken
		if n > 0 || (err != nil && !isTimeoutError(err)) {
			slog.Warn("connection appears broken, reconnecting", "error", err)
			b.conn.Close()
			b.conn = nil
		}
	}

	// Establish new connection if needed
	if b.conn == nil {
		slog.Info("attempting to reconnect to chrome-native-host")
		conn, err := connectWithRetry()
		if err != nil {
			return err
		}
		b.conn = conn
		slog.Info("reconnected to chrome-native-host")
	}

	return nil
}

// ExecuteTool sends a tool request to the native host and returns the result.
// It respects the context deadline and will attempt reconnection if the connection is lost.
func (b *NativeHostBridge) ExecuteTool(ctx context.Context, toolName string, args map[string]interface{}) (interface{}, error) {
	// Ensure we have a valid connection
	if err := b.reconnect(); err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}

	// Normalize arguments before forwarding
	args = b.normalizeArgs(toolName, args)

	slog.Debug("forwarding to native host", "tool", toolName, "args", args)

	// Calculate timeout from context or use default
	timeout := DefaultTimeout
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining > 0 && remaining < MaxTimeout {
			timeout = remaining
		}
	}

	b.connMu.Lock()
	defer b.connMu.Unlock()

	// Set deadline on the connection
	deadline := time.Now().Add(timeout)
	if err := b.conn.SetDeadline(deadline); err != nil {
		return nil, fmt.Errorf("failed to set deadline: %w", err)
	}

	// Send tool_request to native host
	req := map[string]interface{}{
		"type":   "tool_request",
		"method": "execute_tool",
		"params": map[string]interface{}{
			"tool": toolName,
			"args": args,
		},
	}

	// Bound each send/recv so a half-open UDS connection can't block forever.
	// Use 35s read deadline to accommodate the schema-maximum 30s wait action
	// plus 5s forwarding headroom.
	_ = b.conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
	if err := protocol.SendMessage(b.conn, req); err != nil {
		_ = b.conn.SetWriteDeadline(time.Time{})
		return nil, fmt.Errorf("failed to send to native host: %w", err)
	}
	_ = b.conn.SetWriteDeadline(time.Time{})

	// Wait for tool_response
	_ = b.conn.SetReadDeadline(time.Now().Add(35 * time.Second))
	response, err := protocol.ReadMessage(b.conn)
	_ = b.conn.SetReadDeadline(time.Time{})
	if err != nil {
		// Check if it's a timeout
		if isTimeoutError(err) {
			return nil, fmt.Errorf("tool execution timed out after %v: %w", timeout, err)
		}
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Clear the deadline
	b.conn.SetDeadline(time.Time{})

	var resp protocol.ToolResponseMsg
	if err := json.Unmarshal(response, &resp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("tool error: %v", resp.Error.Content)
	}

	if resp.Result != nil && resp.Result.StructuredContent != nil {
		return resp.Result.StructuredContent, nil
	}

	return resp.Result.Content, nil
}

func isTimeoutError(err error) bool {
	if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
		return true
	}
	return false
}

// normalizeArgs normalizes tool arguments to match Chrome extension expectations
func (b *NativeHostBridge) normalizeArgs(tool string, args map[string]interface{}) map[string]interface{} {
	normalized := make(map[string]interface{})
	for k, v := range args {
		normalized[k] = v
	}

	// Validate computer tool parameters (duration bounds, etc.)
	if tool == "computer" {
		validateComputerArgs(normalized)
	}

	return normalized
}

func validateComputerArgs(args map[string]interface{}) {
	// Validate duration is within schema limits
	if duration, ok := args["duration"].(float64); ok {
		if duration > 30 {
			slog.Warn("duration exceeds schema maximum", "duration", duration, "max", 30)
		}
		if duration < 0 {
			slog.Warn("negative duration", "duration", duration)
		}
	}
}
