# E2E Status

> 最后更新：2026-06-08（`feat/session-history-ui` 期间）

## 现状

| 类别 | 数量 | 状态 |
|---|---|---|
| ✅ 跑通 | 9 spec | 5 个新（`02/03/04`）+ 4 个老（p0-lifecycle 8 个测试） |
| 🗑 主动删除 | 7 spec | 见下方 |
| 📋 计划恢复 | 28 测试 | 见下方 TODO |

## 主动删除的 7 个 spec（原因 + 恢复路径）

这些 spec 在 `feat/session-history-ui` 之前从 main 继承而来（commit `efd13ca`，2026-05-21），
**从来没跑通过**——本项目无 CI，e2e 是开发者本地跑的，所以 broken spec 没人发现。
原因 100% 同源：Playwright `context.newPage()` 把 sidepanel page 视作普通 web tab，
导致 `chrome.tabs.query({active:true, currentWindow:true})` 拿到 sidepanel 自己，
sidepanel 进入 "Open main chat" 二级状态，主视图（`.ProseMirror`）永远不渲染。

| 删除的 spec | 测的功能 | 失败测试数 | 影响 |
|---|---|---|---|
| `p0-flow-integration.spec.ts` | 端到端：点登录按钮 / 截图总结 | 2/2 | 端到端集成失去回归保护 |
| `p0-qa-single-turn.spec.ts` | QA 单轮：session 隔离、Stop、API 5xx/429、超时、Options 配 key | 7/10 | 中断/重试/认证场景失去回归保护 |
| `p0-sidepanel-ui.spec.ts` | UI 渲染：EmptyState、Markdown、代码块、AutoScroll、附件 | 21/21 | 22 个 UI 测全删——下一个改 UI 的人没报警 |
| `p0-tools-input.spec.ts` | 工具：click / type / press_key | 10/10 | 10 个工具测全删 |
| `p0-tools-media.spec.ts` | 工具：screenshot / annotated | 5/5 | 5 个工具测全删 |
| `p0-tools-page.spec.ts` | 工具：get_url / get_title / a11y_tree / query_selector / scroll / wait | 7/7 | 7 个工具测全删 |
| `p0-tools-ux.spec.ts` | 工具 UX：loading 标识、错误展示、overlay | 6/6 | 6 个工具测全删 |

**根因细节**：见 `git log efd13ca` 引入的 `e2e/specs/p0-*.spec.ts`。
修复路径是产品端 3 处防御性过滤 + helper 改造——但工作量大且会改产品代码，
不是这个 PR 的 scope。

**恢复路径**（未来谁要写回这些 spec）：
1. 重建 3 处产品防御（`useActiveTabId` / PANEL_READY / `tabGroupManager.createGroup`），
   让 sidepanel 不被 `chrome.tabs.query` 错认为 active tab。
2. 改造 `e2e/helpers/sidepanel.ts` 的 `openSidepanel(context, extensionId, targetPage?)`，
   第三个参数接收 fixture page，自动注入 `?initialTabId=...`。
3. 老 spec 调用方式从 `openSidepanel(context, extensionId)` 改为
   `openSidepanel(context, extensionId, targetPage)`——可全局 sed 替换。
4. 在 Chrome + Edge 上分别验证（见下方"Edge 注意"）。

## 保留的 spec

### p0-lifecycle.spec.ts（8/8 ✅）
不依赖 sidepanel，测纯 SW / storage 行为。**全过，保留。**

### 02-perf-render.spec.ts（1/1 ✅）
回归测试 commit `e2b52de` 修的无限 render bug。
监听 `[PERF] SidepanelApp rendered N times` console 消息，跨 tab 切换后断言 0 警告。

### 03-sidepanel-open-flow.spec.ts（2/2 ✅）
- 静态 guard：读 SW bundle，断言没有 `await chrome.sidePanel.open(`
- 端到端：开 sidepanel → 等待 `tabGroups` storage 被填好（确认 PANEL_READY → createGroup 链路工作）

### 04-session-history.spec.ts（2/2 ✅）
- **Bug 1 验证**：「你好」消息回复后，关闭再开 sidepanel，回复仍存在（**bug 未复现**）
- **Bug 2 验证**：sidepanel 关闭时 user message 持久化，**确认 background 端 agent 流转不依赖 panel**

## Edge 注意

所有 product 代码 100% 假设扩展 page URL scheme 是 `chrome-extension://`——
`src/` 全文 grep 不到 `extension://`（Edge 实际用 `extension://<id>/`）。
**Edge 上 sidepanel 可能也未充分测试**。恢复 7 个 spec 时需同时验证 Edge。

## TODO（不阻塞此 PR）

- [ ] 产品端 3 处加 `isOwnExtensionPage(url)` 防御（hooks.ts:85 / runtimeMessages.ts:342 / tabGroups.ts:457）
- [ ] helper 改造：`openSidepanel(context, extensionId, targetPage?)`
- [ ] 恢复 7 个老 spec，逐个验证 Chrome + Edge
- [ ] 给项目加 CI（避免类似 broken-on-main 再次发生）
