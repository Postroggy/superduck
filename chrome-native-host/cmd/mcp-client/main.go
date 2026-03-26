package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: mcp-client <command> [args...]")
		fmt.Println("\nCommands:")
		fmt.Println("  list-tools              - List all available tools")
		fmt.Println("  call <tool> <json>      - Call a tool with JSON arguments")
		fmt.Println("  test-navigate <url>     - Test navigate tool")
		fmt.Println("  test-read-page          - Test read_page tool")
		os.Exit(1)
	}

	command := os.Args[1]

	// Create MCP client
	client := mcp.NewClient(&mcp.Implementation{
		Name:    "chrome-mcp-test-client",
		Version: "1.0.0",
	}, nil)

	// Create transport using CommandTransport
	serverPath := "./build/chrome-mcp-server"
	transport := &mcp.CommandTransport{
		Command: exec.Command(serverPath),
	}

	ctx := context.Background()

	// Connect to the server
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		log.Fatalf("Failed to connect to server: %v", err)
	}
	defer session.Close()

	fmt.Println("✓ Connected to MCP server")
	fmt.Printf("✓ Server: %s v%s\n\n",
		session.InitializeResult().ServerInfo.Name,
		session.InitializeResult().ServerInfo.Version)

	// Execute command
	switch command {
	case "list-tools":
		listTools(ctx, session)
	case "call":
		if len(os.Args) < 4 {
			log.Fatal("Usage: mcp-client call <tool> <json>")
		}
		callTool(ctx, session, os.Args[2], os.Args[3])
	case "test-navigate":
		if len(os.Args) < 3 {
			log.Fatal("Usage: mcp-client test-navigate <url>")
		}
		testNavigate(ctx, session, os.Args[2])
	case "test-read-page":
		testReadPage(ctx, session)
	default:
		log.Fatalf("Unknown command: %s", command)
	}
}

func listTools(ctx context.Context, session *mcp.ClientSession) {
	result, err := session.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		log.Fatalf("Failed to list tools: %v", err)
	}

	fmt.Printf("📋 Available Tools (%d):\n\n", len(result.Tools))
	for i, tool := range result.Tools {
		fmt.Printf("%d. %s\n", i+1, tool.Name)
		fmt.Printf("   Description: %s\n", tool.Description)
		if tool.InputSchema != nil {
			schemaJSON, _ := json.MarshalIndent(tool.InputSchema, "   ", "  ")
			fmt.Printf("   Input Schema: %s\n", string(schemaJSON))
		}
		fmt.Println()
	}
}

func callTool(ctx context.Context, session *mcp.ClientSession, toolName string, argsJSON string) {
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		log.Fatalf("Failed to parse JSON arguments: %v", err)
	}

	fmt.Printf("🔧 Calling tool: %s\n", toolName)
	fmt.Printf("   Arguments: %s\n\n", argsJSON)

	result, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name:      toolName,
		Arguments: args,
	})
	if err != nil {
		log.Fatalf("Failed to call tool: %v", err)
	}

	fmt.Println("📤 Result:")
	fmt.Printf("   isError: %v\n", result.IsError)
	if result.StructuredContent != nil {
		structuredJSON, _ := json.MarshalIndent(result.StructuredContent, "   ", "  ")
		fmt.Printf("   Structured Content: %s\n", string(structuredJSON))
	}
	for i, content := range result.Content {
		fmt.Printf("\n[%d] ", i+1)
		switch c := content.(type) {
		case *mcp.TextContent:
			fmt.Printf("Text:\n%s\n", c.Text)
		case *mcp.ImageContent:
			fmt.Printf("Image: %s (%d bytes)\n", c.MIMEType, len(c.Data))
		default:
			fmt.Printf("Unknown content type: %T\n", content)
		}
	}
}

func testNavigate(ctx context.Context, session *mcp.ClientSession, url string) {
	args := map[string]interface{}{
		"url": url,
	}

	argsJSON, _ := json.Marshal(args)
	callTool(ctx, session, "navigate", string(argsJSON))
}

func testReadPage(ctx context.Context, session *mcp.ClientSession) {
	args := map[string]interface{}{}
	argsJSON, _ := json.Marshal(args)
	callTool(ctx, session, "read_page", string(argsJSON))
}
