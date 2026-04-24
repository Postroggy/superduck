# AGENTS.md

本文件为 AI 编码代理（Claude Code、Codex、Cursor 等）在本仓库工作时的基础指引。

## 仓库概览

SuperDuck 是一个浏览器 AI 助手,由多个子项目组成:

| 目录 | 说明 | 语言/构建 |
|---|---|---|
| `chrome-crx/` | Chrome 扩展(Manifest V3),包含 side panel、content script、service worker、MCP runtime | TypeScript + Vite,使用 **Bun** |
| `chrome-native-host/` | Native messaging host + `superduck` CLI + MCP server | Go + Makefile |
| `coworkd/` | Cowork 守护进程 | Go |
| `desktop/` | 桌面端封装 | - |
| `mac-native-addon/` | macOS 原生 Node addon | Swift / C++ |
| `npm/` | npm 分发包 | - |

主要工作区: `chrome-crx`(扩展功能)与 `chrome-native-host`(CLI / 原生桥)。

## 构建命令

### chrome-crx(Chrome 扩展)

使用 **Bun**,不要用 npm/pnpm/yarn。

```bash
cd chrome-crx
bun install          # 安装依赖
bun run build        # 生产构建 → dist/
bun run dev          # 监听模式
bun run typecheck    # tsc --noEmit
bun run lint         # eslint
bun run format       # prettier
```

构建产物在 `chrome-crx/dist/`,加载扩展时指向该目录。
**修改任何 `chrome-crx/src/**` 下的源码后都要立即 `bun run build` 验证。**

### chrome-native-host(Go)

```bash
cd chrome-native-host
make              # 构建 native-host / mcp-server / superduck 三个二进制到 build/
make superduck    # 只构建 CLI
```

构建完成后,`chrome-native-host/superduck` 通常是指向 `build/superduck` 的软链;如果丢失用 `ln -sf build/superduck superduck` 重建。

## 约定与原则

- **修改即构建**:改完代码立即跑对应的 build,验证通过再回复用户。
- **不做多余的防御**:不加无用的 try/catch、不写冗长注释、不引入向后兼容壳。
- **优先复用已有结构**,而不是新建抽象。
- **中文交流**:用户是中文用户,回复请使用中文。

## 目录入口速查

- 扩展 MCP runtime / CDP 桥: [chrome-crx/src/mcp-runtime/cdp.ts](chrome-crx/src/mcp-runtime/cdp.ts)
- 扩展视觉指示器(含 blocking overlay): [chrome-crx/src/agent-visual-indicator.ts](chrome-crx/src/agent-visual-indicator.ts)
- CLI 入口与 usage 文本: [chrome-native-host/cmd/superduck/main.go](chrome-native-host/cmd/superduck/main.go)
- Tab group 子命令: [chrome-native-host/cmd/superduck/cmd_tabs_mcp.go](chrome-native-host/cmd/superduck/cmd_tabs_mcp.go)
- 端到端测试脚本: [chrome-native-host/testdata/](chrome-native-host/testdata/)

## CLI 使用要点

`superduck` CLI 协议命令:

```bash
./superduck tab_group list --create-if-empty     # 确保 MCP 分组存在
TAB=$(./superduck tab_group new | sed -n 's/.*Tab ID: *\([0-9][0-9]*\).*/\1/p' | head -1)
./superduck --tab $TAB navigate https://example.com
./superduck --tab $TAB screenshot --output /tmp/
```

完整帮助: `./superduck --help`。

## 测试

```bash
cd chrome-native-host
go run ./testdata/server -addr :8765 &    # 本地测试服
./testdata/run_cli_test.sh                 # CLI 冒烟测试
./testdata/visual_test.sh                  # 视觉回归(/tmp/sd_visual/*.png)
```

## PR / 提交

- 提交信息使用 conventional commits(`feat:`/`fix:`/`refactor:` 等)。
- 常用 scope:`cli`、`crx`、`scroll`、`sidepanel` 等。
- 通过 `gh pr create` 开 PR,不要在未经用户确认时直接 merge / force push。
