import { beforeEach, describe, expect, it, vi } from 'vitest';

const chromeMock = vi.hoisted(() => ({
  scripting: { executeScript: vi.fn() }
}));

vi.stubGlobal('chrome', chromeMock);

const { awaitCommittedFrame, FRAME_WAIT_TIMEOUT_MS } = await import('./awaitCommittedFrame');

describe('awaitCommittedFrame', () => {
  beforeEach(() => {
    chromeMock.scripting.executeScript.mockReset();
  });

  it('waits for the injected paint promise', async () => {
    chromeMock.scripting.executeScript.mockResolvedValue([{ result: undefined }]);

    await awaitCommittedFrame(7);

    expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7 } })
    );
  });

  it('keeps going when injection fails', async () => {
    chromeMock.scripting.executeScript.mockRejectedValue(new Error('no tab'));

    await expect(awaitCommittedFrame(7)).resolves.toBeUndefined();
  });

  it('stops waiting at the timeout', async () => {
    chromeMock.scripting.executeScript.mockReturnValue(new Promise(() => {}));

    const started = Date.now();
    await awaitCommittedFrame(7, 30);

    expect(Date.now() - started).toBeLessThan(FRAME_WAIT_TIMEOUT_MS);
  });
});
