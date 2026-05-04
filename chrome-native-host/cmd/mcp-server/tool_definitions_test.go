package main

import (
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestRegisterToolsUsesValidSchemas(t *testing.T) {
	t.Parallel()
	if got, want := len(toolDefinitions), 19; got != want {
		t.Fatalf("toolDefinitions length = %d, want %d", got, want)
	}

	server := mcp.NewServer(&mcp.Implementation{
		Name:    "test-server",
		Version: "1.0.0",
	}, nil)

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("registerTools panicked: %v", r)
		}
	}()

	registerTools(server, nil)
}
