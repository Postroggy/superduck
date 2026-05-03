#!/usr/bin/env bash
# Post-create setup for the SuperDuck dev container.
# Installs Bun (project package manager) and project dependencies.
set -euo pipefail

# Bun 通过 npm registry 安装并锁定版本，避免 `curl | bash` 的供应链攻击面；
# npm 自带 tarball 完整性校验，升级时显式调整下方版本号即可。
BUN_VERSION="1.1.42"

echo "==> Installing Bun ${BUN_VERSION} via npm"
if ! command -v bun >/dev/null 2>&1 || [[ "$(bun --version 2>/dev/null)" != "${BUN_VERSION}" ]]; then
  npm install -g "bun@${BUN_VERSION}"
fi

# 仅在存在 lockfile 时启用 --frozen-lockfile，否则直接 install，
# 避免每次创建容器都先稳定失败再回退。
bun_install() {
  if [[ -f bun.lockb || -f bun.lock ]]; then
    bun install --frozen-lockfile
  else
    bun install
  fi
}

echo "==> Installing root workspace dependencies (husky, lint-staged)"
bun_install

echo "==> Installing chrome-crx dependencies"
( cd chrome-crx && bun_install )

echo "==> Pre-fetching Go modules for chrome-native-host"
if command -v go >/dev/null 2>&1; then
  (cd chrome-native-host && go mod download) || true
fi

echo "==> Dev container ready. Try: cd chrome-crx && bun run build"
