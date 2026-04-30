import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts'
    ],
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      // Only the modules that are exercised by our unit/integration tests are
      // included in the coverage report. UI / Chrome-extension surfaces
      // (service worker, sidepanel React, CDP bridge) are intentionally
      // excluded because they cannot be exercised in a node test runner —
      // adding them would dilute the gate to a meaningless number.
      include: [
        'src/lib/utils.ts',
        'src/is-plan-event-enabled.ts',
        'src/mcp-runtime/shared.ts'
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/vite-env.d.ts'],
      // CI gate: any drop in coverage on the tested modules fails the build.
      // Function coverage is set lower than line/statement coverage because
      // shared.ts intentionally exposes a number of no-op stubs (e.g. the
      // screenRecorder facade) that serve as injection points for the
      // service-worker runtime and have no behavior to assert from node.
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 90,
        functions: 55
      }
    }
  }
});
