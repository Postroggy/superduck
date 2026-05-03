# Dev Container

This directory provides a reproducible development environment for the SuperDuck monorepo, suitable for both human contributors (VS Code / JetBrains Gateway) and autonomous coding agents (GitHub Codespaces, Factory, etc.).

## What's inside

- **Base image**: `mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm` — Node.js 22 + TypeScript toolchain.
- **Go toolchain**: installed via the official `devcontainers/features/go` feature (matches `chrome-native-host/go.mod`, Go 1.25).
- **Bun**: installed by `post-create.sh` — used as the package manager for both the root workspace and `chrome-crx`.
- **GitHub CLI** and **git** features for PR / repo workflows.
- **VS Code extensions** preconfigured for the project's stack: ESLint, Prettier, TypeScript, Tailwind CSS, Go, Vitest, GitHub Actions.

## Getting started

Open the repository in any dev-container-aware client (VS Code "Reopen in Container", GitHub Codespaces, JetBrains Gateway). The first build runs `post-create.sh`, which:

1. Installs Bun and exports it on `PATH`.
2. Runs `bun install` in the repo root (husky / lint-staged) and in `chrome-crx`.
3. Pre-fetches Go modules for `chrome-native-host`.

After the container is ready:

```bash
cd chrome-crx && bun run build       # build the Chrome extension
cd chrome-crx && bun run test        # run vitest suite
cd chrome-native-host && go test ./... # run native-host Go tests
```

Port `5173` is auto-forwarded for the Vite dev server.
