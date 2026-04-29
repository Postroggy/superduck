.PHONY: all clean native-host mcp-server superduck install test lint lint-install release-binaries

# Pinned linter version. Bump deliberately and re-run `make lint`.
GOLANGCI_LINT_VERSION ?= v2.6.0

# Build output directory
BUILD_DIR := build

all: native-host mcp-server superduck

native-host:
	@echo "Building native-host..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/chrome-native-host ./cmd/native-host

mcp-server:
	@echo "Building mcp-server..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/chrome-mcp-server ./cmd/mcp-server

superduck:
	@echo "Building superduck CLI..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/superduck ./cmd/superduck

# Cross-compile both binaries (superduck CLI + chrome-native-host companion)
# into the npm sub-packages. Users install via `npm install -g superduck-cli`
# and `superduck init` reads chrome-native-host from the same bin dir.
release-binaries:
	@echo "Cross-building superduck + chrome-native-host for all platforms..."
	GOOS=darwin  GOARCH=arm64 go build -o ../npm/packages/superduck-darwin-arm64/bin/superduck ./cmd/superduck
	GOOS=darwin  GOARCH=arm64 go build -o ../npm/packages/superduck-darwin-arm64/bin/chrome-native-host ./cmd/native-host
	GOOS=darwin  GOARCH=amd64 go build -o ../npm/packages/superduck-darwin-x64/bin/superduck ./cmd/superduck
	GOOS=darwin  GOARCH=amd64 go build -o ../npm/packages/superduck-darwin-x64/bin/chrome-native-host ./cmd/native-host
	GOOS=linux   GOARCH=arm64 go build -o ../npm/packages/superduck-linux-arm64/bin/superduck ./cmd/superduck
	GOOS=linux   GOARCH=arm64 go build -o ../npm/packages/superduck-linux-arm64/bin/chrome-native-host ./cmd/native-host
	GOOS=linux   GOARCH=amd64 go build -o ../npm/packages/superduck-linux-x64/bin/superduck ./cmd/superduck
	GOOS=linux   GOARCH=amd64 go build -o ../npm/packages/superduck-linux-x64/bin/chrome-native-host ./cmd/native-host
	@echo "Done. Binaries placed in npm/packages/*/bin/"

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

# Install golangci-lint at the pinned version into $GOPATH/bin (or $HOME/go/bin).
lint-install:
	@echo "Installing golangci-lint $(GOLANGCI_LINT_VERSION)..."
	GOBIN=$${GOBIN:-$$HOME/go/bin} go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)

# Run the Go linter. Uses an installed golangci-lint if present on PATH,
# otherwise falls back to $HOME/go/bin/golangci-lint (where lint-install puts it).
lint:
	@echo "Running golangci-lint..."
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run ./...; \
	elif [ -x "$$HOME/go/bin/golangci-lint" ]; then \
		"$$HOME/go/bin/golangci-lint" run ./...; \
	else \
		echo "golangci-lint not found. Run 'make lint-install' first."; \
		exit 1; \
	fi

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
