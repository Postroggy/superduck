#!/bin/bash

# MCP Server 测试脚本

set -e

echo "=========================================="
echo "MCP Server 功能测试"
echo "=========================================="
echo ""

# 检查服务器和客户端是否存在
if [ ! -f "./build/chrome-mcp-server" ]; then
    echo "❌ chrome-mcp-server 不存在，请先编译"
    exit 1
fi

if [ ! -f "./build/mcp-client" ]; then
    echo "❌ mcp-client 不存在，请先编译"
    exit 1
fi

# 测试 1: 列出所有工具
echo "测试 1: 列出所有工具"
echo "----------------------------------------"
./build/mcp-client list-tools | head -30
echo ""

# 测试 2: 调用 tabs_context_mcp 工具
echo "测试 2: 获取标签页上下文"
echo "----------------------------------------"
./build/mcp-client call tabs_context_mcp '{}'
echo ""

# 测试 3: 调用 shortcuts_list 工具
echo "测试 3: 列出所有快捷方式"
echo "----------------------------------------"
./build/mcp-client call shortcuts_list '{}'
echo ""

echo "=========================================="
echo "✓ 所有测试完成"
echo "=========================================="
