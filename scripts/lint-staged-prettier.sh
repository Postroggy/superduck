#!/usr/bin/env bash
# Run prettier --write on staged TS/JS/JSON files inside chrome-crx using the
# chrome-crx workspace's installed prettier (the root has no node_modules of its own).
set -e
files=()
for f in "$@"; do
  rel="${f#chrome-crx/}"
  files+=("$rel")
done
cd "$(dirname "$0")/../chrome-crx"
bun run prettier --write --ignore-unknown "${files[@]}"
