<p align="center">
  <img src="extension_icon.svg" alt="SuperDuck" width="128" height="128" />
</p>

<h1 align="center">🦆 SuperDuck</h1>

<p align="center">
  <strong>AI 浏览器助手 — 任意模型，随处可用</strong>
</p>

<p align="center">
  <a href="README.md">🇺🇸 English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/chrome-%3E%3D116-green" alt="Chrome >= 116" />
  <img src="https://img.shields.io/badge/license-ISC-brightgreen" alt="License ISC" />
</p>

---

**Claude for Chrome** 很优秀，但有地区限制且只能用昂贵的 Claude 模型。SuperDuck 解决了这两个问题：

- 🌍 **无地区限制** — 全球可用
- 🔄 **任意模型** — Claude、DeepSeek、通义千问、Kimi、Gemini，或任何兼容 OpenAI 的 API
- 💰 **灵活成本** — 简单任务用便宜模型，复杂任务用强力模型

## 功能特性

- **🧠 多模型切换** — 将 Opus / Sonnet / Haiku 槽位映射到任意模型
- **🖥️ 浏览器自动化** — 截图、点击、滚动、输入、导航、执行 JavaScript
- **📝 工作流录制** — 录制浏览器操作并支持语音旁白，让 AI 学习重放
- **🔌 MCP 支持** — 内置模型上下文协议运行时，工具可扩展
- **🌐 多语言** — English & 简体中文
- **⌨️ 快捷键** — `Cmd+E` / `Ctrl+E` 切换侧边栏
- **🎨 丰富 UI** — Markdown 代码高亮、LaTeX 数学公式、图片附件、深色/浅色主题

## 模型映射

在设置中配置自定义 API 地址，然后将各槽位映射到你的模型：

| 槽位 | 默认（Claude） | 自定义示例 |
|------|----------------|------------|
| Opus | `claude-opus-4-6` | `deepseek-r1` / `gpt-4o` |
| Sonnet | `claude-sonnet-4-6` | `qwen-max` / `kimi-k2.5` |
| Haiku | `claude-haiku-4-5` | `deepseek-chat` / `gemini-2.5-flash` |

## 安装

1. 下载最新 Release 或[从源码构建](#从源码构建)
2. 访问 `chrome://extensions/` → 开启 **开发者模式**
3. 点击 **加载已解压的扩展程序** → 选择 `dist/` 目录
4. 将 SuperDuck 固定到工具栏 📌

## 从源码构建

```bash
git clone https://github.com/arthur-zhang/superduck-crx.git
cd superduck-crx
bun install
bun run build      # 产物在 dist/
```

开发调试：

```bash
bun run dev         # 监听模式
bun run typecheck   # 类型检查
bun run lint        # 代码检查
```

## 技术栈

React 19 · TypeScript 5 · Vite 7 · Tailwind CSS 4 · Zustand · Framer Motion · Tiptap · @anthropic-ai/sdk · MCP SDK · react-intl

## 参与贡献

欢迎贡献！Fork → 新建分支 → 提交 → 发起 PR。

## 开源协议

[ISC](LICENSE)

---

<p align="center">Made with 🦆 by the SuperDuck community</p>
