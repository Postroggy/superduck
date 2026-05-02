#!/usr/bin/env bash
# Post-create setup for the SuperDuck dev container.
# Installs Bun (project package manager) and project dependencies.
set -euo pipefail

echo "==> Installing Bun"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  # Persist Bun on PATH for future shells
  if ! grep -q 'BUN_INSTALL' "$HOME/.bashrc" 2>/dev/null; then
    {
      echo ''
      echo '# Bun'
      echo 'export BUN_INSTALL="$HOME/.bun"'
      echo 'export PATH="$BUN_INSTALL/bin:$PATH"'
    } >> "$HOME/.bashrc"
  fi
fi

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

echo "==> Installing root workspace dependencies (husky, lint-staged)"
bun install --frozen-lockfile || bun install

echo "==> Installing chrome-crx dependencies"
(cd chrome-crx && (bun install --frozen-lockfile || bun install))

echo "==> Pre-fetching Go modules for chrome-native-host"
if command -v go >/dev/null 2>&1; then
  (cd chrome-native-host && go mod download) || true
fi

echo "==> Dev container ready. Try: cd chrome-crx && bun run build"
