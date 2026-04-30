#!/usr/bin/env bash
# Run eslint --fix on staged TS files inside chrome-crx using bun.
set -e
files=()
for f in "$@"; do
  rel="${f#chrome-crx/}"
  files+=("$rel")
done
cd "$(dirname "$0")/../chrome-crx"
bun run eslint --fix "${files[@]}"
