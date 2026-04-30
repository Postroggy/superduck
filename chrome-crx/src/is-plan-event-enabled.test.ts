import { describe, it, expect } from 'vitest';
import { isPlanEventEnabled } from './is-plan-event-enabled';

describe('isPlanEventEnabled', () => {
  it('returns override.enabled when it is an explicit boolean (true)', () => {
    expect(isPlanEventEnabled({ __default: { enabled: false } }, { enabled: true })).toBe(true);
  });

  it('returns override.enabled when it is an explicit boolean (false)', () => {
    expect(isPlanEventEnabled({ __default: { enabled: true } }, { enabled: false })).toBe(false);
  });

  it('falls back to default.enabled when override is undefined', () => {
    expect(isPlanEventEnabled({ __default: { enabled: false } }, undefined)).toBe(false);
    expect(isPlanEventEnabled({ __default: { enabled: true } }, undefined)).toBe(true);
  });

  it('falls back to default.enabled when override.enabled is not a boolean', () => {
    expect(isPlanEventEnabled({ __default: { enabled: false } }, {} as { enabled?: boolean })).toBe(
      false
    );
  });

  it('defaults to true when no flag information is provided', () => {
    expect(isPlanEventEnabled(undefined, undefined)).toBe(true);
    expect(isPlanEventEnabled({}, undefined)).toBe(true);
    expect(isPlanEventEnabled({ __default: {} }, undefined)).toBe(true);
  });
});
