package bridge

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"time"

	"chrome-native-host/internal/protocol"
)

const (
	UDSPath        = "/tmp/chrome-native-host.sock"
	ConnectTimeout = 5 * time.Second
	ConnectRetries = 3
)

// NativeHostBridge handles communication with the Chrome Native Host
type NativeHostBridge struct {
	conn net.Conn
}

// New creates a new bridge to the Chrome Native Host
func New() (*NativeHostBridge, error) {
	var conn net.Conn
	var err error

	// Retry connection with timeout
	for i := 0; i < ConnectRetries; i++ {
		conn, err = net.DialTimeout("unix", UDSPath, ConnectTimeout)
		if err == nil {
			break
		}
		slog.Warn("failed to connect to UDS", "attempt", i+1, "max", ConnectRetries, "error", err)
		if i < ConnectRetries-1 {
			time.Sleep(time.Second)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("failed to connect to chrome-native-host at %s: %w\nMake sure chrome-native-host is running with --uds flag", UDSPath, err)
	}

	slog.Info("connected to chrome-native-host", "path", UDSPath)

	return &NativeHostBridge{
		conn: conn,
	}, nil
}

// Close closes the connection to the native host
func (b *NativeHostBridge) Close() error {
	if b.conn != nil {
		return b.conn.Close()
	}
	return nil
}

// ExecuteTool sends a tool request to the native host and returns the result
func (b *NativeHostBridge) ExecuteTool(toolName string, args map[string]interface{}) (interface{}, error) {
	// Normalize arguments before forwarding
	args = b.normalizeArgs(toolName, args)

	slog.Debug("forwarding to native host", "tool", toolName, "args", args)

	// Send tool_request to native host
	req := map[string]interface{}{
		"type":   "tool_request",
		"method": "execute_tool",
		"params": map[string]interface{}{
			"tool": toolName,
			"args": args,
		},
	}

	if err := protocol.SendMessage(b.conn, req); err != nil {
		return nil, fmt.Errorf("failed to send to native host: %w", err)
	}

	// Wait for tool_response
	response, err := protocol.ReadMessage(b.conn)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

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

// normalizeArgs normalizes tool arguments to match Chrome extension expectations
func (b *NativeHostBridge) normalizeArgs(tool string, args map[string]interface{}) map[string]interface{} {
	normalized := make(map[string]interface{})
	for k, v := range args {
		normalized[k] = v
	}

	// Handle computer tool duration parameter (convert milliseconds to seconds if needed)
	if tool == "computer" {
		if duration, ok := normalized["duration"].(float64); ok {
			// If duration > 30, assume it's in milliseconds and convert to seconds
			if duration > 30 {
				normalized["duration"] = duration / 1000
				slog.Debug("converted duration from milliseconds to seconds", "original", duration, "converted", normalized["duration"])
			}
			// Validate max duration
			if normalized["duration"].(float64) > 30 {
				slog.Warn("duration exceeds maximum", "duration", normalized["duration"], "max", 30)
			}
		}
	}

	return normalized
}
