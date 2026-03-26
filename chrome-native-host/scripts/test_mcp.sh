#!/bin/bash

# Test MCP Server by sending JSON-RPC requests via stdin

echo "Testing MCP Server..."

# Test 1: Initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | ./chrome-mcp-server &
SERVER_PID=$!

sleep 1

# Test 2: List tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | ./chrome-mcp-server

sleep 1

# Cleanup
kill $SERVER_PID 2>/dev/null

echo "Test complete. Check /tmp/chrome-mcp-server.log for details."
