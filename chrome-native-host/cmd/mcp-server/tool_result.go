package main

import (
	"chrome-native-host/internal/converter"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func buildCallToolResult(result any) *mcp.CallToolResult {
	callResult := &mcp.CallToolResult{
		Content: converter.ToMCPContent(result),
	}

	// Preserve native-host object results so fields like imageId and tabContext
	// remain available to MCP clients via structuredContent.
	if m, ok := result.(map[string]interface{}); ok {
		callResult.StructuredContent = m
		if errMsg, hasError := m["error"].(string); hasError && errMsg != "" {
			callResult.IsError = true
		}
	}

	return callResult
}
