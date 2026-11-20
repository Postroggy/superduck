import { expect, it } from 'vitest';
import { isBrowserScopedToolCall } from './toolScope';

it('treats a targetId call as browser scoped', () => {
  expect(isBrowserScopedToolCall('superduck_cdp', 'send', 'sw-1')).toBe(true);
  expect(isBrowserScopedToolCall('superduck_cdp', 'batch', '  sw-1  ')).toBe(true);
  expect(isBrowserScopedToolCall('superduck_cdp', 'send', '')).toBe(false);
});

it('treats the target listing as browser scoped', () => {
  expect(isBrowserScopedToolCall('superduck_cdp', 'targets', undefined)).toBe(true);
  expect(isBrowserScopedToolCall('superduck_cdp', 'status', undefined)).toBe(false);
  expect(isBrowserScopedToolCall('superduck_cdp', 'events', undefined)).toBe(false);
});

it('keeps other tools on the tab path', () => {
  expect(isBrowserScopedToolCall('navigate', 'targets', undefined)).toBe(false);
  expect(isBrowserScopedToolCall('network', undefined, undefined)).toBe(false);
});
