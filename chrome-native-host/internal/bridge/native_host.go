package bridge

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
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

	// Authenticate with the native host using the shared token.
	token, err := readAuthToken()
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
	if authResp.Error != "" {
		conn.Close()
		return nil, fmt.Errorf("UDS authentication failed: %s", authResp.Error)
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

	// Validate computer tool parameters based on action
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

func readAuthToken() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	path := filepath.Join(home, ".superduck", "uds-token")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}
	token := string(bytes.TrimSpace(data))
	if token == "" {
		return "", fmt.Errorf("empty auth token in %s", path)
	}
	return token, nil
}
