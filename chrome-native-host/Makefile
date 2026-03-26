.PHONY: all clean native-host mcp-server install test

# Build output directory
BUILD_DIR := build

all: native-host mcp-server

native-host:
	@echo "Building native-host..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/chrome-native-host ./cmd/native-host

mcp-server:
	@echo "Building mcp-server..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/chrome-mcp-server ./cmd/mcp-server

clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(BUILD_DIR)
	rm -f chrome-native-host chrome-mcp-server

install: all
	@echo "Installing binaries..."
	@mkdir -p ~/bin
	cp $(BUILD_DIR)/chrome-native-host ~/bin/
	cp $(BUILD_DIR)/chrome-mcp-server ~/bin/
	@echo "Done. Add ~/bin to your PATH if not already added."

test:
	@echo "Running tests..."
	go test ./...

# Development helpers
dev-native-host: native-host
	@echo "Starting native-host in development mode..."
	$(BUILD_DIR)/chrome-native-host --uds

dev-mcp-server: mcp-server
	@echo "Starting mcp-server in development mode..."
	$(BUILD_DIR)/chrome-mcp-server

# Show project structure
tree:
	@tree -I '.git|.idea|build' -L 3
