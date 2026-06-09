import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Storage contract tests for activeToolContexts persistence.
 *
 * These tests verify the chrome.storage.local contract that the
 * persistActiveToolContexts / restoreActiveToolContextsFromStorage pair
 * depends on. The actual integration with the in-memory Map is exercised
 * by the broader manual QA flow because importing `core.ts` pulls in the
 * full chrome extension runtime (cdp, webNavigation, debugger, ...) which
 * is not stub-able in unit tests.
 *
 * What we test here:
 *   1. The StorageKeys enum exposes ACTIVE_TOOL_CONTEXTS with the right value.
 *   2. The serialization shape (Record<tabIdStr, { toolName, requestId, startTime }>)
 *      round-trips through chrome.storage.local.get/set without losing data.
 *   3. restore tolerates a missing/empty/wrong-shape payload.
 */

const localStore: Record<string, unknown> = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[] | null) => {
        if (keys === null) {
          return Promise.resolve({ ...localStore });
        }
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: localStore[keys] });
        }
        const out: Record<string, unknown> = {};
        for (const k of keys) out[k] = localStore[k];
        return Promise.resolve(out);
      }),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(localStore, values);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete localStore[k];
        return Promise.resolve();
      })
    }
  }
};

vi.stubGlobal('chrome', mockChrome);

const clearStore = (): void => {
  for (const k of Object.keys(localStore)) delete localStore[k];
};

describe('activeToolContexts storage contract', () => {
  beforeEach(() => {
    clearStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearStore();
  });

  it('exposes ACTIVE_TOOL_CONTEXTS as a stable storage key', async () => {
    const { StorageKeys } = await import('../extensionServices/core');
    expect(StorageKeys.ACTIVE_TOOL_CONTEXTS).toBe('activeToolContexts');
  });

  it('serializes a single active context as { tabIdStr: { toolName, requestId, startTime } }', async () => {
    const payload: Record<string, unknown> = {
      '42': { toolName: 'click', requestId: 'req-A', startTime: 1700000000000 }
    };
    await mockChrome.storage.local.set({ activeToolContexts: payload });
    expect(localStore['activeToolContexts']).toEqual(payload);
  });

  it('round-trips a multi-tab context record through chrome.storage.local', async () => {
    const payload: Record<string, unknown> = {
      '101': { toolName: 'click', requestId: 'req-A', startTime: 1700000000000 },
      '202': { toolName: 'type', requestId: 'req-B', startTime: 1700000001000 }
    };
    await mockChrome.storage.local.set({ activeToolContexts: payload });

    const { StorageKeys } = await import('../extensionServices/core');
    const result = await mockChrome.storage.local.get(StorageKeys.ACTIVE_TOOL_CONTEXTS);
    expect(result[StorageKeys.ACTIVE_TOOL_CONTEXTS]).toEqual(payload);
  });

  it('removing a tab from the context record updates storage on next set', async () => {
    const initial: Record<string, unknown> = {
      '1': { toolName: 'click', requestId: 'a', startTime: 1 },
      '2': { toolName: 'type', requestId: 'b', startTime: 2 }
    };
    await mockChrome.storage.local.set({ activeToolContexts: initial });

    // Simulate cleaning up tab 1.
    const next = { ...(initial as Record<string, unknown>) };
    delete next['1'];
    await mockChrome.storage.local.set({ activeToolContexts: next });

    const { StorageKeys } = await import('../extensionServices/core');
    const result = await mockChrome.storage.local.get(StorageKeys.ACTIVE_TOOL_CONTEXTS);
    expect(result[StorageKeys.ACTIVE_TOOL_CONTEXTS]).toEqual({
      '2': { toolName: 'type', requestId: 'b', startTime: 2 }
    });
  });

  it('a missing payload resolves to undefined without throwing', async () => {
    const { StorageKeys } = await import('../extensionServices/core');
    const result = await mockChrome.storage.local.get(StorageKeys.ACTIVE_TOOL_CONTEXTS);
    expect(result[StorageKeys.ACTIVE_TOOL_CONTEXTS]).toBeUndefined();
  });

  it('tolerates wrong-shape payload (string, number, array)', async () => {
    const { StorageKeys } = await import('../extensionServices/core');

    localStore[StorageKeys.ACTIVE_TOOL_CONTEXTS] = 'not-an-object';
    const r1 = await mockChrome.storage.local.get(StorageKeys.ACTIVE_TOOL_CONTEXTS);
    expect(typeof r1[StorageKeys.ACTIVE_TOOL_CONTEXTS]).toBe('string');

    localStore[StorageKeys.ACTIVE_TOOL_CONTEXTS] = 42;
    const r2 = await mockChrome.storage.local.get(StorageKeys.ACTIVE_TOOL_CONTEXTS);
    expect(r2[StorageKeys.ACTIVE_TOOL_CONTEXTS]).toBe(42);

    localStore[StorageKeys.ACTIVE_TOOL_CONTEXTS] = [1, 2, 3];
    const r3 = await mockChrome.storage.local.get(StorageKeys.ACTIVE_TOOL_CONTEXTS);
    expect(Array.isArray(r3[StorageKeys.ACTIVE_TOOL_CONTEXTS])).toBe(true);
  });

  it('integer tabId keys round-trip without loss', async () => {
    // TabIds are 32-bit signed ints in chrome.tabs — exercise the boundary.
    const payload: Record<string, unknown> = {
      '0': { toolName: 't0', requestId: 'r0', startTime: 0 },
      '2147483647': { toolName: 'tmax', requestId: 'rmax', startTime: 2147483647 }
    };
    await mockChrome.storage.local.set({ activeToolContexts: payload });

    const { StorageKeys } = await import('../extensionServices/core');
    const result = await mockChrome.storage.local.get(StorageKeys.ACTIVE_TOOL_CONTEXTS);
    const stored = result[StorageKeys.ACTIVE_TOOL_CONTEXTS] as Record<string, unknown>;
    expect(stored['0']).toEqual({ toolName: 't0', requestId: 'r0', startTime: 0 });
    expect(stored['2147483647']).toEqual({
      toolName: 'tmax',
      requestId: 'rmax',
      startTime: 2147483647
    });
  });
});
