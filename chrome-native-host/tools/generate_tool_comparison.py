#!/usr/bin/env python3
"""
自动对比 Go 和 TypeScript 中的 MCP 工具定义
"""
import json
import re

# Go 工具定义（从 mcp_server.go 手动提取）
go_tools_def = {
    "javascript_tool": {
        "properties": {
            "action": {"type": "string", "required": True},
            "text": {"type": "string", "required": True},
            "tabId": {"type": "number", "required": True}
        }
    },
    "navigate": {
        "properties": {
            "url": {"type": "string", "required": True},
            "tabId": {"type": "number", "required": True}
        }
    },
    "computer": {
        "properties": {
            "action": {"type": "string", "required": False, "enum": True},
            "coordinate": {"type": "array", "required": False},
            "text": {"type": "string", "required": False},
            "duration": {"type": "number", "required": False, "min": 0, "max": 30},
            "scroll_direction": {"type": "string", "required": False, "enum": True},
            "scroll_amount": {"type": "number", "required": False, "min": 1, "max": 10},
            "start_coordinate": {"type": "array", "required": False},
            "region": {"type": "array", "required": False},
            "repeat": {"type": "number", "required": False, "min": 1, "max": 100},
            "ref": {"type": "string", "required": False},
            "modifiers": {"type": "string", "required": False},
            "tabId": {"type": "number", "required": True}
        }
    },
    "find": {
        "properties": {
            "query": {"type": "string", "required": True},
            "tabId": {"type": "number", "required": True}
        }
    },
    "form_input": {
        "properties": {
            "ref": {"type": "string", "required": True},
            "value": {"type": "any", "required": True},
            "tabId": {"type": "number", "required": True}
        }
    },
    "get_page_text": {
        "properties": {
            "tabId": {"type": "number", "required": True},
            "max_chars": {"type": "number", "required": False}
        }
    },
    "read_page": {
        "properties": {
            "filter": {"type": "string", "required": False, "enum": ["interactive", "all"]},
            "tabId": {"type": "number", "required": True},
            "depth": {"type": "number", "required": False},
            "ref_id": {"type": "string", "required": False},
            "max_chars": {"type": "number", "required": False}
        }
    },
    "resize_window": {
        "properties": {
            "width": {"type": "number", "required": True},
            "height": {"type": "number", "required": True},
            "tabId": {"type": "number", "required": True}
        }
    },
    "turn_answer_start": {
        "properties": {}
    },
    "update_plan": {
        "properties": {
            "domains": {"type": "array", "required": True},
            "approach": {"type": "array", "required": True}
        }
    },
    "upload_image": {
        "properties": {
            "imageId": {"type": "string", "required": True},
            "ref": {"type": "string", "required": False},
            "coordinate": {"type": "array", "required": False},
            "tabId": {"type": "number", "required": True},
            "filename": {"type": "string", "required": False}
        }
    },
    "read_console_messages": {
        "properties": {
            "tabId": {"type": "number", "required": True},
            "onlyErrors": {"type": "boolean", "required": False},
            "clear": {"type": "boolean", "required": False},
            "pattern": {"type": "string", "required": False},
            "limit": {"type": "number", "required": False}
        }
    },
    "read_network_requests": {
        "properties": {
            "tabId": {"type": "number", "required": True},
            "urlPattern": {"type": "string", "required": False},
            "clear": {"type": "boolean", "required": False},
            "limit": {"type": "number", "required": False}
        }
    },
    "gif_creator": {
        "properties": {
            "action": {"type": "string", "required": True},
            "tabId": {"type": "number", "required": True},
            "coordinate": {"type": "array", "required": False},
            "download": {"type": "boolean", "required": False},
            "filename": {"type": "string", "required": False},
            "options": {"type": "object", "required": False}
        }
    },
    "tabs_context_mcp": {
        "properties": {
            "createIfEmpty": {"type": "boolean", "required": False}
        }
    },
    "tabs_create_mcp": {
        "properties": {}
    },
    "shortcuts_list": {
        "properties": {}
    },
    "shortcuts_execute": {
        "properties": {
            "shortcutId": {"type": "string", "required": False},
            "command": {"type": "string", "required": False}
        }
    }
}

# 生成对比报告
def generate_comparison_report():
    report = []
    report.append("# MCP 工具字段完整对比报告\n")
    report.append(f"**生成时间:** 2026-03-05\n")
    report.append(f"**工具总数:** {len(go_tools_def)}\n\n")
    report.append("---\n\n")

    for tool_name, tool_def in go_tools_def.items():
        report.append(f"## {tool_name}\n\n")

        props = tool_def["properties"]
        if not props:
            report.append("**无参数**\n\n")
            continue

        report.append("| 字段名 | 类型 | 必需 | 约束 |\n")
        report.append("|--------|------|------|------|\n")

        for prop_name, prop_def in props.items():
            type_str = prop_def["type"]
            required = "✅" if prop_def.get("required", False) else "❌"

            constraints = []
            if prop_def.get("enum"):
                constraints.append("enum")
            if "min" in prop_def:
                constraints.append(f"min:{prop_def['min']}")
            if "max" in prop_def:
                constraints.append(f"max:{prop_def['max']}")

            constraint_str = ", ".join(constraints) if constraints else "-"

            report.append(f"| `{prop_name}` | {type_str} | {required} | {constraint_str} |\n")

        report.append("\n")

    return "".join(report)

if __name__ == "__main__":
    report = generate_comparison_report()
    with open("/Users/arthur/GolandProjects/chrome-native-host/tool_fields_report.md", "w") as f:
        f.write(report)
    print("对比报告已生成: tool_fields_report.md")
