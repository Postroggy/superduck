#!/bin/bash
set -euo pipefail

HOST_NAME="com.me.superduck_browser_extension"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_BINARY="$PROJECT_DIR/build/chrome-native-host"
MCP_BINARY="$PROJECT_DIR/build/chrome-mcp-server"

# Detect OS and set manifest directories for all supported browsers
MANIFEST_DIRS=()
case "$(uname -s)" in
  Darwin)
    MANIFEST_DIRS+=("$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts")
    MANIFEST_DIRS+=("$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts")
    MANIFEST_DIRS+=("$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    ;;
  Linux)
    MANIFEST_DIRS+=("$HOME/.config/google-chrome/NativeMessagingHosts")
    MANIFEST_DIRS+=("$HOME/.config/microsoft-edge/NativeMessagingHosts")
    MANIFEST_DIRS+=("$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    CLAUDE_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

echo "=== Building binaries ==="
cd "$SCRIPT_DIR/.."
make all

echo ""
echo "=== Installing Native Host (Chrome, Edge, Brave) ==="

for MANIFEST_DIR in "${MANIFEST_DIRS[@]}"; do
  mkdir -p "$MANIFEST_DIR"
  MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"
  cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$HOST_NAME",
  "description": "SuperDuck Browser Extension Native Host",
  "path": "$HOST_BINARY",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://komnjkkihimgafgblijcchlgeiogpjgi/"]
}
EOF
  echo "  ✓ $MANIFEST_PATH"
done

echo ""
echo "=== MCP Server Configuration ==="
echo "1. Start Chrome Native Host:"
echo "   ./chrome-native-host"
echo ""
echo "   (Dual channel mode: stdio + UDS will start automatically)"
echo ""
echo "2. Add the following to your Claude Desktop config:"
echo ""
echo "File: $CLAUDE_CONFIG"
echo ""
echo '{'
echo '  "mcpServers": {'
echo '    "chrome": {'
echo "      \"command\": \"$MCP_BINARY\""
echo '    }'
echo '  }'
echo '}'
echo ""
echo "IMPORTANT:"
echo "1. Edit the manifest and replace the extension ID with your actual extension ID."
echo "   You can find it at chrome://extensions/ or edge://extensions/"
echo "2. Start chrome-native-host before using MCP server"
echo ""
echo "Installation complete!"
