import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendCommandMock = vi.hoisted(() => vi.fn());

vi.mock('../../cdp', () => ({
  cdpDebugger: {
    sendCommand: sendCommandMock,
    generateUniqueId: () => 'test-id'
  }
}));

vi.stubGlobal('chrome', {
  tabs: {
    onRemoved: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() }
  },
  webNavigation: {
    onCommitted: { addListener: vi.fn() },
    onHistoryStateUpdated: { addListener: vi.fn() }
  },
  tabGroups: { TAB_GROUP_ID_NONE: -1 },
  debugger: { sendCommand: vi.fn() }
});

// Fake timers let the 250ms poll loop run instantly in tests.
beforeEach(() => {
  vi.useFakeTimers();
  sendCommandMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

import { executeWaitForSelector } from './screenshotActions';

async function runWithTimers(promise: Promise<unknown>): Promise<unknown> {
  // Advance fake timers in a loop so the async poll loop makes progress.
  const resultPromise = promise.then((r) => r);
  // Let the first await land, then keep advancing 250ms ticks.
  for (let i = 0; i < 500; i++) {
    const winner = await Promise.race([resultPromise.then(() => 'done'), Promise.resolve('tick')]);
    if (winner === 'done') break;
    await vi.advanceTimersByTimeAsync(250);
  }
  vi.useRealTimers();
  return resultPromise;
}

describe('executeWaitForSelector', () => {
  it('returns found once the selector matches', async () => {
    sendCommandMock
      .mockResolvedValueOnce({ result: { value: false } })
      .mockResolvedValueOnce({ result: { value: true } });

    const result = (await runWithTimers(
      executeWaitForSelector(42, { selector: '.loaded', timeout: 10 })
    )) as { output: string };

    expect(result.output).toContain('found');
    expect(sendCommandMock).toHaveBeenCalledWith(
      42,
      'Runtime.evaluate',
      expect.objectContaining({ returnByValue: true })
    );
  });

  it('times out with an error when the selector never appears', async () => {
    sendCommandMock.mockResolvedValue({ result: { value: false } });

    const result = (await runWithTimers(
      executeWaitForSelector(42, { selector: '.ghost', timeout: 2 })
    )) as { error: string };

    expect(result.error).toContain('not found after 2s');
  });

  it('reports invalid selectors immediately instead of timing out', async () => {
    sendCommandMock.mockResolvedValue({
      result: { value: { __invalidSelector: 'is not a valid selector' } }
    });

    await expect(
      runWithTimers(executeWaitForSelector(42, { selector: ':::bad', timeout: 10 }))
    ).rejects.toThrow(/invalid selector/);
  });

  it('absent mode waits until the selector disappears', async () => {
    sendCommandMock
      .mockResolvedValueOnce({ result: { value: true } })
      .mockResolvedValueOnce({ result: { value: true } })
      .mockResolvedValueOnce({ result: { value: false } });

    const result = (await runWithTimers(
      executeWaitForSelector(42, { selector: '.spinner', absent: true, timeout: 10 })
    )) as { output: string };

    expect(result.output).toContain('now absent');
  });

  it('rejects timeouts above 60 seconds', async () => {
    await expect(executeWaitForSelector(42, { selector: '.x', timeout: 61 })).rejects.toThrow(
      /cannot exceed 60 seconds/
    );
  });

  it('requires a selector parameter', async () => {
    await expect(executeWaitForSelector(42, {})).rejects.toThrow(/selector parameter is required/);
  });
});
