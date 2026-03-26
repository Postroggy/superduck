#!/bin/bash

# Test the complete MCP setup

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOCKET="/tmp/chrome-native-host.sock"

echo "=== Testing Chrome Native Host MCP Setup ==="
echo ""

# Check if binaries exist
if [ ! -f "$SCRIPT_DIR/chrome-native-host" ]; then
    echo "Error: chrome-native-host not found. Run 'make all' first."
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/chrome-mcp-server" ]; then
    echo "Error: chrome-mcp-server not found. Run 'make all' first."
    exit 1
fi

# Check if Native Host is running
if [ ! -S "$SOCKET" ]; then
    echo "Error: Chrome Native Host is not running in UDS mode"
    echo "Start it with: ./start-native-host.sh"
    echo "Or manually: ./chrome-native-host --uds"
    exit 1
fi

echo "✓ Binaries found"
echo "✓ Chrome Native Host is running (socket exists)"
echo ""

# Test MCP Server connection
echo "Testing MCP Server..."
echo ""

# Test 1: Initialize
echo "Test 1: Initialize"
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | timeout 5 "$SCRIPT_DIR/chrome-mcp-server" 2>/dev/null | head -1 | jq -r '.result.serverInfo.name' || {
    echo "✗ Initialize failed"
    exit 1
}
echo "✓ Initialize successful"
echo ""

# Test 2: List tools
echo "Test 2: List tools"
TOOLS=$(echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | timeout 5 "$SCRIPT_DIR/chrome-mcp-server" 2>/dev/null | head -1 | jq -r '.result.tools | length')
if [ "$TOOLS" -gt 0 ]; then
    echo "✓ Found $TOOLS tools"
else
    echo "✗ No tools found"
    exit 1
fi
echo ""

echo "=== All tests passed! ==="
echo ""
echo "Setup is working correctly. You can now:"
echo "1. Configure Claude Desktop with the MCP server"
echo "2. Use Chrome control tools in Claude"
echo ""
echo "Logs:"
echo "  Native Host: tail -f /tmp/chrome-native-host.log"
echo "  MCP Server:  tail -f /tmp/chrome-mcp-server.log"
