#!/usr/bin/env node
// Test-performance reporter for chrome-crx.
//
// Parses a Vitest JUnit XML report (default: test-results.junit.xml) and
// prints:
//   - Total test count and total wall-clock time per suite + grand total.
//   - All tests slower than SLOW_TEST_MS (default 300ms; matches the
//     `slowTestThreshold` configured in vitest.config.ts).
//   - The Top 10 slowest tests overall.
//
// CI consumes this to chart suite duration over time and to flag perf
// regressions early instead of burying them in averages. The same JUnit XML
// is also uploaded as a CI artifact so external tooling (BuildPulse,
// Datadog CI Visibility, GitHub test-reporter, etc.) can ingest it.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SLOW_TEST_MS = Number.parseInt(process.env.SLOW_TEST_MS ?? '300', 10);
const TOP_N = Number.parseInt(process.env.TOP_N ?? '10', 10);

const inputPath = resolve(process.argv[2] ?? 'test-results.junit.xml');

if (!existsSync(inputPath)) {
  console.error(`test-perf-report: ${inputPath} not found.`);
  console.error('Run `bun run test:perf` first to generate it.');
  process.exit(1);
}

const xml = readFileSync(inputPath, 'utf8');

/**
 * Minimal JUnit parser tuned for Vitest output. We avoid pulling in an XML
 * dependency just for this reporter; the format is stable and well-formed.
 */
function parseJUnit(source) {
  const suiteRegex =
    /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g;
  // Match attribute list up to either /> (self-closing) or > (opens body).
  // We can't use [^/>]* because attribute values commonly contain "/".
  const caseRegex =
    /<testcase\b((?:[^>"]|"[^"]*")*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  const attrRegex = /(\w[\w-]*)="([^"]*)"/g;

  const parseAttrs = (raw) => {
    const out = {};
    for (const m of raw.matchAll(attrRegex)) out[m[1]] = m[2];
    return out;
  };

  const suites = [];
  for (const suiteMatch of source.matchAll(suiteRegex)) {
    const attrs = parseAttrs(suiteMatch[1]);
    const tests = [];
    for (const caseMatch of suiteMatch[2].matchAll(caseRegex)) {
      const ca = parseAttrs(caseMatch[1]);
      const body = caseMatch[3] ?? '';
      tests.push({
        name: ca.name ?? '<unknown>',
        classname: ca.classname ?? attrs.name ?? '<unknown>',
        timeSec: Number.parseFloat(ca.time ?? '0'),
        skipped: /<skipped\b/.test(body),
        failed: /<failure\b|<error\b/.test(body)
      });
    }
    suites.push({
      name: attrs.name ?? '<unknown>',
      timeSec: Number.parseFloat(attrs.time ?? '0'),
      tests: Number.parseInt(attrs.tests ?? '0', 10),
      failures: Number.parseInt(attrs.failures ?? '0', 10),
      errors: Number.parseInt(attrs.errors ?? '0', 10),
      cases: tests
    });
  }
  return suites;
}

const suites = parseJUnit(xml);
const allCases = suites.flatMap((s) => s.cases);
const totalTests = allCases.length;
const totalTimeMs = suites.reduce((acc, s) => acc + s.timeSec * 1000, 0);

const fmtMs = (ms) => `${ms.toFixed(0)}ms`;
const fmtSec = (ms) => `${(ms / 1000).toFixed(3)}s`;

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const fmtName = (c) => `${decodeXml(c.classname)} > ${decodeXml(c.name)}`;

console.log('Test performance report');
console.log('=======================');
console.log(`Suites:     ${suites.length}`);
console.log(`Tests:      ${totalTests}`);
console.log(`Total time: ${fmtSec(totalTimeMs)}`);
console.log('');

console.log('Per-suite duration:');
const sortedSuites = [...suites].sort((a, b) => b.timeSec - a.timeSec);
for (const s of sortedSuites) {
  console.log(
    `  ${fmtMs(s.timeSec * 1000).padStart(8)}  ${s.name}  (${s.cases.length} tests${s.failures || s.errors ? `, FAIL ${s.failures + s.errors}` : ''})`
  );
}
console.log('');

const slow = allCases
  .filter((c) => !c.skipped && c.timeSec * 1000 >= SLOW_TEST_MS)
  .sort((a, b) => b.timeSec - a.timeSec);

console.log(`Slow tests (>= ${SLOW_TEST_MS}ms):`);
if (slow.length === 0) {
  console.log('  (none)');
} else {
  for (const c of slow) {
    console.log(`  ${fmtMs(c.timeSec * 1000).padStart(8)}  ${fmtName(c)}`);
  }
}
console.log('');

const top = [...allCases]
  .filter((c) => !c.skipped)
  .sort((a, b) => b.timeSec - a.timeSec)
  .slice(0, TOP_N);

console.log(`Top ${TOP_N} slowest tests overall:`);
for (const c of top) {
  console.log(`  ${fmtMs(c.timeSec * 1000).padStart(8)}  ${fmtName(c)}`);
}

// Exit non-zero if any test exceeds 5x the slow threshold so CI fails loud
// on egregious regressions. Tweak via FAIL_OVER_MS env var (0 disables).
const failOverMs = Number.parseInt(
  process.env.FAIL_OVER_MS ?? String(SLOW_TEST_MS * 5),
  10
);
if (failOverMs > 0) {
  const offenders = slow.filter((c) => c.timeSec * 1000 >= failOverMs);
  if (offenders.length > 0) {
    console.error('');
    console.error(
      `FAIL: ${offenders.length} test(s) exceeded ${failOverMs}ms (FAIL_OVER_MS).`
    );
    for (const c of offenders) {
      console.error(`  ${fmtMs(c.timeSec * 1000)}  ${fmtName(c)}`);
    }
    process.exit(1);
  }
}
