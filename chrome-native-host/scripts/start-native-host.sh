#!/bin/bash

# Start Chrome Native Host (dual channel: stdio + UDS)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$SCRIPT_DIR/chrome-native-host"
SOCKET="/tmp/chrome-native-host.sock"

# Check if already running
if [ -S "$SOCKET" ]; then
    echo "Chrome Native Host appears to be already running (socket exists)"
    echo "If it's not running, remove the socket file:"
    echo "  rm $SOCKET"
    exit 1
fi

# Check if binary exists
if [ ! -f "$BINARY" ]; then
    echo "Error: chrome-native-host binary not found"
    echo "Run 'make all' to build it"
    exit 1
fi

echo "Starting Chrome Native Host..."
echo "Dual channel mode: stdio + UDS"
echo ""
echo "Channels:"
echo "  - stdio: Chrome Extension communication"
echo "  - UDS:   MCP Server communication ($SOCKET)"
echo ""
echo "Log: /tmp/chrome-native-host.log"
echo ""
echo "Press Ctrl+C to stop"
echo ""

exec "$BINARY"
