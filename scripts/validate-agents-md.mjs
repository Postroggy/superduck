#!/usr/bin/env node
// Validate AGENTS.md stays consistent with the codebase.
//
// Checks performed:
//   1. Every relative markdown link `[label](path)` resolves to an existing
//      file or directory in the repository.
//   2. Every `bun run <script>` referenced inside a fenced ```bash block exists
//      in chrome-crx/package.json's "scripts" section.
//   3. Every `make <target>` referenced inside a fenced ```bash block exists
//      as a target in chrome-native-host/Makefile (declared via .PHONY or as
//      `target:` recipe). Bare `make` (no target) is treated as the default
//      `all` target.
//
// Exits non-zero on the first batch of failures so CI surfaces the breakage.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const AGENTS_PATH = join(REPO_ROOT, 'AGENTS.md');
const PKG_JSON_PATH = join(REPO_ROOT, 'chrome-crx', 'package.json');
const MAKEFILE_PATH = join(REPO_ROOT, 'chrome-native-host', 'Makefile');

const errors = [];

function fail(msg) {
  errors.push(msg);
}

function loadText(p) {
  return readFileSync(p, 'utf8');
}

const agents = loadText(AGENTS_PATH);

// --- 1. Validate relative markdown links ----------------------------------
// Match [text](target) but skip explicit URLs (http/https/mailto/#anchors).
const linkRe = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
for (const m of agents.matchAll(linkRe)) {
  const target = m[2];
  if (
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('#')
  ) {
    continue;
  }
  // Strip in-page anchors like path/file.md#section
  const cleanTarget = target.split('#')[0];
  if (!cleanTarget) continue;
  // 仅接受相对路径，且解析后必须落在 REPO_ROOT 内：
  // 防止 `[x](/etc/passwd)` 或 `[x](../outside)` 误判通过。
  if (isAbsolute(cleanTarget)) {
    fail(
      `absolute link target not allowed in AGENTS.md: [${m[1]}](${target})`,
    );
    continue;
  }
  const abs = resolve(REPO_ROOT, cleanTarget);
  const rel = relative(REPO_ROOT, abs);
  if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep)[0] === '..') {
    fail(
      `link target escapes repository root in AGENTS.md: [${m[1]}](${target})`,
    );
    continue;
  }
  if (!existsSync(abs)) {
    fail(`broken link in AGENTS.md: [${m[1]}](${target}) -> ${abs}`);
    continue;
  }
  // Ensure it is a file or directory (anything that fs can stat is fine).
  try {
    statSync(abs);
  } catch (e) {
    fail(`unreadable link target in AGENTS.md: ${target} (${e.message})`);
  }
}

// --- 2. Extract fenced bash blocks ----------------------------------------
const fenceRe = /```bash\n([\s\S]*?)```/g;
const bashBlocks = [];
for (const m of agents.matchAll(fenceRe)) {
  bashBlocks.push(m[1]);
}

// --- 3. Validate `bun run <script>` ---------------------------------------
const pkg = JSON.parse(loadText(PKG_JSON_PATH));
const scripts = new Set(Object.keys(pkg.scripts ?? {}));

const bunRunRe = /\bbun run ([A-Za-z0-9:_-]+)/g;
const seenBunScripts = new Set();
for (const block of bashBlocks) {
  for (const m of block.matchAll(bunRunRe)) {
    const script = m[1];
    seenBunScripts.add(script);
    if (!scripts.has(script)) {
      fail(
        `AGENTS.md references \`bun run ${script}\` but no such script in chrome-crx/package.json`,
      );
    }
  }
}

// --- 4. Validate `make <target>` ------------------------------------------
const makefile = loadText(MAKEFILE_PATH);
// Targets declared via .PHONY: a b c (one or more lines) and any line of the
// form "target:" or "target: deps" at column 0. We deliberately ignore
// pattern rules like "%.o:".
const makeTargets = new Set(['all']);
for (const m of makefile.matchAll(/^\.PHONY:\s*(.+)$/gm)) {
  for (const t of m[1].split(/\s+/).filter(Boolean)) makeTargets.add(t);
}
for (const m of makefile.matchAll(/^([A-Za-z0-9_.-]+)\s*:(?!=)/gm)) {
  makeTargets.add(m[1]);
}

const makeCmdRe = /(^|\s)make(?:\s+([A-Za-z0-9_:.-]+))?/g;
const seenMakeTargets = new Set();
for (const block of bashBlocks) {
  // Only consider lines that actually start a `make ...` invocation (avoid
  // matching things like "make sure" inside prose - bash blocks rarely have
  // prose but be defensive).
  for (const rawLine of block.split('\n')) {
    // Strip trailing shell comment so `make foo  # explanation` works.
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!/^make(\s|$)/.test(line)) continue;
    const parts = line.split(/\s+/);
    const target = parts[1];
    if (!target || target.startsWith('-')) {
      // bare `make` -> default target `all`
      seenMakeTargets.add('all');
      continue;
    }
    // Strip variable assignments like FOO=bar
    if (target.includes('=')) continue;
    seenMakeTargets.add(target);
    if (!makeTargets.has(target)) {
      fail(
        `AGENTS.md references \`make ${target}\` but no such target in chrome-native-host/Makefile`,
      );
    }
  }
}

// --- 5. Summary ------------------------------------------------------------
const summary = [
  `Validated AGENTS.md against repo state:`,
  `  bun scripts referenced: ${[...seenBunScripts].sort().join(', ') || '(none)'}`,
  `  make targets referenced: ${[...seenMakeTargets].sort().join(', ') || '(none)'}`,
  `  bash blocks scanned: ${bashBlocks.length}`,
];

if (errors.length > 0) {
  console.error('AGENTS.md validation FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('');
  console.error(summary.join('\n'));
  process.exit(1);
}

console.log('AGENTS.md validation OK');
console.log(summary.join('\n'));
