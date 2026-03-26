#!/usr/bin/env python3
"""
对比 Go MCP Server 和 TypeScript 中的工具定义
"""

# Go 中的工具定义（从 mcp_server.go 提取）
go_tools = {
    "javascript_tool": {
        "properties": ["action", "text", "tabId"],
        "required": ["action", "text", "tabId"],
        "types": {
            "action": "string",
            "text": "string",
            "tabId": "number"
        }
    },
    "navigate": {
        "properties": ["url", "tabId"],
        "required": ["url", "tabId"],
        "types": {
            "url": "string",
            "tabId": "number"
        }
    },
    "computer": {
        "properties": ["action", "coordinate", "text", "duration", "scroll_direction",
                      "scroll_amount", "start_coordinate", "region", "repeat", "ref",
                      "modifiers", "tabId"],
        "required": ["tabId"],
        "types": {
            "action": "string (enum)",
            "coordinate": "array[number, number]",
            "text": "string",
            "duration": "number (0-30)",
            "scroll_direction": "string (enum)",
            "scroll_amount": "number (1-10)",
            "start_coordinate": "array[number, number]",
            "region": "array[number, number, number, number]",
            "repeat": "number (1-100)",
            "ref": "string",
            "modifiers": "string",
            "tabId": "number"
        }
    },
