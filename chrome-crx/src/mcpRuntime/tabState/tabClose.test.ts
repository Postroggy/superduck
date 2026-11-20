import { beforeEach, describe, expect, it, vi } from 'vitest';

const chromeMock = vi.hoisted(() => ({
  tabs: {
    remove: vi.fn(async () => {}),
    get: vi.fn(),
    onRemoved: { addListener: vi.fn() },
    onReplaced: { addListener: vi.fn() }
  },
  tabGroups: { TAB_GROUP_ID_NONE: -1, get: vi.fn(async (id: number) => ({ id })) },
  storage: {
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({}))
    },
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({}))
    }
  }
}));

vi.stubGlobal('chrome', chromeMock);

const leases = vi.hoisted(() => ({ collectSessionLeases: vi.fn() }));

vi.mock('./sessionLeaseContext', () => ({
  collectSessionLeases: leases.collectSessionLeases
}));

const { closeSessionTabs } = await import('./tabClose');

function lease(tabId: number) {
  return {
    tabId,
    sessionId: 'session-a',
    groupId: 7,
    isActiveHandoff: false,
    disposition: 'active' as const,
    createdAt: 0
  };
}

describe('closeSessionTabs', () => {
  beforeEach(() => {
    chromeMock.tabs.remove.mockClear();
    leases.collectSessionLeases.mockReset();
  });

  it('closes only tabs leased to the session and reports the rest', async () => {
    leases.collectSessionLeases.mockResolvedValue([lease(12), lease(34)]);

    const result = await closeSessionTabs('session-a', [12, 99, 12]);

    expect(result).toEqual({ closedTabIds: [12], skippedTabIds: [99] });
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith([12]);
  });

  it('throws when no requested tab belongs to the session', async () => {
    leases.collectSessionLeases.mockResolvedValue([lease(12)]);

    await expect(closeSessionTabs('session-a', [99])).rejects.toThrow(/none of these tabs/);
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
  });

  it('throws when no tab ids are given', async () => {
    await expect(closeSessionTabs('session-a', [])).rejects.toThrow(/no tab IDs/);
    expect(leases.collectSessionLeases).not.toHaveBeenCalled();
  });
});
