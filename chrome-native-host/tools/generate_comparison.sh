#!/bin/bash

# 提取 Go 工具定义的字段
echo "# MCP 工具字段对比分析" > tool_fields_comparison.md
echo "" >> tool_fields_comparison.md
echo "生成时间: $(date)" >> tool_fields_comparison.md
echo "" >> tool_fields_comparison.md

# 工具列表
tools=(
  "javascript_tool"
  "navigate"
  "computer"
  "find"
  "form_input"
  "get_page_text"
  "read_page"
  "resize_window"
  "turn_answer_start"
  "update_plan"
  "upload_image"
  "read_console_messages"
  "read_network_requests"
  "gif_creator"
  "tabs_context_mcp"
  "tabs_create_mcp"
  "shortcuts_list"
  "shortcuts_execute"
)

echo "## 工具列表" >> tool_fields_comparison.md
echo "" >> tool_fields_comparison.md
for tool in "${tools[@]}"; do
  echo "- $tool" >> tool_fields_comparison.md
done

echo "" >> tool_fields_comparison.md
echo "---" >> tool_fields_comparison.md
echo "" >> tool_fields_comparison.md

echo "对比脚本已生成"
