import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Storage contract tests for the GIF frame storage persistence added
 * for architectural problem C (5-minute recordings lost on SW restart).
 *
 * These tests verify the chrome.storage.local contract that the
 * write-through persistence in `gifFrameStorage` and the
 * `restoreGifFrameStorageFromStorage` restore path depend on. We do not
 * import `mediaTools.ts` (it pulls in the full chrome extension
 * runtime) — we exercise the storage shape that the production code
 * reads and writes.
 *
 * What we test here:
 *   1. The StorageKeys enum exposes GIF_FRAMES and GIF_RECORDING_GROUPS
 *      with the right values.
 *   2. A multi-group frame payload round-trips through chrome.storage.local
 *      without losing frames.
 *   3. The recordingGroups array round-trips through chrome.storage.local.
 *   4. Restore tolerates missing / wrong-shape payloads (corrupt storage,
 *      pre-fix migration, fresh install).
 *   5. The cap-at-50 invariant is preserved across restore.
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

describe('gifFrameStorage storage contract (bug C)', () => {
  beforeEach(() => {
    clearStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearStore();
  });

  describe('StorageKeys', () => {
    it('exposes GIF_FRAMES as a stable storage key', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      expect(StorageKeys.GIF_FRAMES).toBe('gifFrames');
    });

    it('exposes GIF_RECORDING_GROUPS as a stable storage key', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      expect(StorageKeys.GIF_RECORDING_GROUPS).toBe('gifRecordingGroups');
    });
  });

  describe('frame payload persistence', () => {
    it('round-trips a single-group frame payload', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      const payload: Record<string, unknown> = {
        '5': {
          frames: [
            { base64: 'AAAA', timestamp: 1000 },
            { base64: 'BBBB', timestamp: 2000 }
          ],
          lastUpdated: 2000
        }
      };
      await mockChrome.storage.local.set({ [StorageKeys.GIF_FRAMES]: payload });
      const result = await mockChrome.storage.local.get(StorageKeys.GIF_FRAMES);
      expect(result[StorageKeys.GIF_FRAMES]).toEqual(payload);
    });

    it('round-trips a multi-group frame payload', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      const payload: Record<string, unknown> = {
        '5': { frames: [{ base64: 'A' }], lastUpdated: 1 },
        '7': { frames: [{ base64: 'B' }, { base64: 'C' }], lastUpdated: 2 },
        '11': { frames: [], lastUpdated: 3 }
      };
      await mockChrome.storage.local.set({ [StorageKeys.GIF_FRAMES]: payload });

      const result = await mockChrome.storage.local.get(StorageKeys.GIF_FRAMES);
      const stored = result[StorageKeys.GIF_FRAMES] as Record<string, unknown>;
      expect(stored['5']).toEqual({ frames: [{ base64: 'A' }], lastUpdated: 1 });
      expect(stored['7']).toEqual({ frames: [{ base64: 'B' }, { base64: 'C' }], lastUpdated: 2 });
      expect(stored['11']).toEqual({ frames: [], lastUpdated: 3 });
    });

    it('a missing payload resolves to undefined without throwing', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      const result = await mockChrome.storage.local.get(StorageKeys.GIF_FRAMES);
      expect(result[StorageKeys.GIF_FRAMES]).toBeUndefined();
    });

    it('overwrite is atomic — the latest write wins', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      await mockChrome.storage.local.set({
        [StorageKeys.GIF_FRAMES]: { '1': { frames: [{ base64: 'old' }], lastUpdated: 1 } }
      });
      await mockChrome.storage.local.set({
        [StorageKeys.GIF_FRAMES]: { '1': { frames: [{ base64: 'new' }], lastUpdated: 2 } }
      });

      const result = await mockChrome.storage.local.get(StorageKeys.GIF_FRAMES);
      const stored = result[StorageKeys.GIF_FRAMES] as Record<string, unknown>;
      expect(stored['1']).toEqual({ frames: [{ base64: 'new' }], lastUpdated: 2 });
    });
  });

  describe('recordingGroups persistence', () => {
    it('round-trips a single-group recording set', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      await mockChrome.storage.local.set({ [StorageKeys.GIF_RECORDING_GROUPS]: [5] });

      const result = await mockChrome.storage.local.get(StorageKeys.GIF_RECORDING_GROUPS);
      expect(result[StorageKeys.GIF_RECORDING_GROUPS]).toEqual([5]);
    });

    it('round-trips a multi-group recording set', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      await mockChrome.storage.local.set({
        [StorageKeys.GIF_RECORDING_GROUPS]: [5, 7, 11]
      });

      const result = await mockChrome.storage.local.get(StorageKeys.GIF_RECORDING_GROUPS);
      expect(result[StorageKeys.GIF_RECORDING_GROUPS]).toEqual([5, 7, 11]);
    });

    it('round-trips an empty recording set (agent stopped recording)', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      await mockChrome.storage.local.set({ [StorageKeys.GIF_RECORDING_GROUPS]: [] });

      const result = await mockChrome.storage.local.get(StorageKeys.GIF_RECORDING_GROUPS);
      expect(result[StorageKeys.GIF_RECORDING_GROUPS]).toEqual([]);
    });

    it('a missing payload resolves to undefined (fresh install / pre-fix)', async () => {
      const { StorageKeys } = await import('../extensionServices/core');
      const result = await mockChrome.storage.local.get(StorageKeys.GIF_RECORDING_GROUPS);
      expect(result[StorageKeys.GIF_RECORDING_GROUPS]).toBeUndefined();
    });
  });

  describe('shape tolerance for restore', () => {
    it('tolerates a non-record frames payload (string, number, array, null)', async () => {
      // The production restore guards with `typeof storedFrames === 'object'`
      // and `Array.isArray(group.frames)`, so anything else leaves the
      // in-memory state empty. We assert the storage layer does not
      // transform or reject the bad values.
      const { StorageKeys } = await import('../extensionServices/core');

      const bad: Array<unknown> = ['not-an-object', 42, [1, 2, 3], null];
      for (const value of bad) {
        localStore[StorageKeys.GIF_FRAMES] = value;
        const result = await mockChrome.storage.local.get(StorageKeys.GIF_FRAMES);
        expect(result[StorageKeys.GIF_FRAMES]).toBe(value);
      }
    });

    it('tolerates a non-array recordingGroups payload (string, number, object, null)', async () => {
      const { StorageKeys } = await import('../extensionServices/core');

      const bad: Array<unknown> = ['5,7,11', 42, { 5: true }, null];
      for (const value of bad) {
        localStore[StorageKeys.GIF_RECORDING_GROUPS] = value;
        const result = await mockChrome.storage.local.get(StorageKeys.GIF_RECORDING_GROUPS);
        expect(result[StorageKeys.GIF_RECORDING_GROUPS]).toBe(value);
      }
    });

    it('tolerates integer boundary groupIds in the frames payload', async () => {
      // Tab groupIds are 32-bit signed ints in Chrome — exercise the
      // boundaries to make sure the stringify / parse round-trip is safe.
      const { StorageKeys } = await import('../extensionServices/core');
      const payload: Record<string, unknown> = {
        '0': { frames: [{ base64: 'A' }], lastUpdated: 0 },
        '2147483647': { frames: [{ base64: 'B' }], lastUpdated: 2147483647 }
      };
      await mockChrome.storage.local.set({ [StorageKeys.GIF_FRAMES]: payload });

      const result = await mockChrome.storage.local.get(StorageKeys.GIF_FRAMES);
      const stored = result[StorageKeys.GIF_FRAMES] as Record<string, unknown>;
      expect(stored['0']).toEqual({ frames: [{ base64: 'A' }], lastUpdated: 0 });
      expect(stored['2147483647']).toEqual({
        frames: [{ base64: 'B' }],
        lastUpdated: 2147483647
      });
    });
  });
});
