import { beforeEach, describe, expect, it, vi } from 'vitest';

const chromeMock = vi.hoisted(() => ({
  tabs: {
    get: vi.fn(async () => ({ id: 11, windowId: 7 }))
  },
  windows: {
    get: vi.fn(),
    update: vi.fn(async () => ({}))
  }
}));

vi.stubGlobal('chrome', chromeMock);

const { resizeWindowTool } = await import('./resizeWindowTool');

function context() {
  return {
    tabId: 11,
    resolveTabId: async (tabId: number) => tabId
  } as never;
}

describe('resize_window', () => {
  beforeEach(() => {
    chromeMock.windows.get.mockReset();
    chromeMock.windows.update.mockClear();
  });

  it('restores a maximized window before applying the size', async () => {
    chromeMock.windows.get.mockResolvedValue({ id: 7, state: 'maximized' });

    await resizeWindowTool.execute({ tabId: 11, width: 800, height: 600 }, context());

    expect(chromeMock.windows.update).toHaveBeenCalledWith(7, {
      width: 800,
      height: 600,
      state: 'normal'
    });
  });

  it('leaves a normal window state untouched', async () => {
    chromeMock.windows.get.mockResolvedValue({ id: 7, state: 'normal' });

    await resizeWindowTool.execute({ tabId: 11, width: 800, height: 600 }, context());

    expect(chromeMock.windows.update).toHaveBeenCalledWith(7, { width: 800, height: 600 });
  });
});
