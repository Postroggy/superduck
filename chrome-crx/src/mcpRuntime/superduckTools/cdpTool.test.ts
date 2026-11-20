import { afterEach, expect, it, vi } from 'vitest';
import { superduckCdpTool as tool } from './cdpTool';
import type { ToolContext } from '../pageToolsSupport/types';

const {
  sendCommand,
  drainCdpEvents,
  enableCdpEventCapture,
  currentCdpEventCursor,
  cdpEventBufferStats,
  buildCdpSessionReport,
  isDebuggerAttached,
  isNetworkTrackingEnabled,
  getNetworkRequests,
  listCdpTargets,
  sendCdpTargetCommand,
  getAttachedCdpTargets
} = vi.hoisted(() => ({
  sendCommand: vi.fn(),
  drainCdpEvents: vi.fn(),
  enableCdpEventCapture: vi.fn(),
  currentCdpEventCursor: vi.fn(),
  cdpEventBufferStats: vi.fn(),
  buildCdpSessionReport: vi.fn(),
  isDebuggerAttached: vi.fn(),
  isNetworkTrackingEnabled: vi.fn(),
  getNetworkRequests: vi.fn(),
  listCdpTargets: vi.fn(),
  sendCdpTargetCommand: vi.fn(),
  getAttachedCdpTargets: vi.fn()
}));

vi.mock('../cdp', () => ({
  cdpDebugger: {
    sendCommand,
    isDebuggerAttached,
    isNetworkTrackingEnabled,
    getNetworkRequests
  },
  drainCdpEvents,
  enableCdpEventCapture,
  currentCdpEventCursor,
  cdpEventBufferStats,
  buildCdpSessionReport,
  listCdpTargets,
  sendCdpTargetCommand,
  getAttachedCdpTargets
}));

function setup(options: { allowed?: boolean; needsPrompt?: boolean } = {}) {
  const get = vi.fn().mockResolvedValue({ url: 'https://example.test/app' });
  vi.stubGlobal('chrome', { tabs: { get } });
  const context = {
    resolveTabId: vi.fn().mockResolvedValue(41),
    permissionManager: {
      checkPermission: vi
        .fn()
        .mockResolvedValue({ allowed: options.allowed ?? true, needsPrompt: options.needsPrompt })
    },
    toolUseId: 'tool-use-1'
  } as unknown as ToolContext;
  return { context, get };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('forwards one command with object or JSON-string params', async () => {
  const { context } = setup();
  sendCommand.mockResolvedValue({ result: { type: 'number', value: 2 } });

  const out = await tool.execute(
    { tabId: 41, method: 'Runtime.evaluate', params: '{"expression":"1+1"}' },
    context
  );
  expect(sendCommand).toHaveBeenCalledWith(41, 'Runtime.evaluate', { expression: '1+1' });
  // The result is the protocol payload verbatim — no SuperDuck envelope.
  expect(JSON.parse(out.output!)).toEqual({ result: { type: 'number', value: 2 } });

  sendCommand.mockResolvedValue(undefined);
  await tool.execute({ tabId: 41, method: 'Page.enable' }, context);
  expect(sendCommand).toHaveBeenLastCalledWith(41, 'Page.enable', undefined);
});

it('enables event capture before the first command so pauses are not lost', async () => {
  const { context } = setup();
  sendCommand.mockResolvedValue({});
  await tool.execute({ tabId: 41, method: 'Debugger.enable' }, context);
  expect(enableCdpEventCapture).toHaveBeenCalledWith(41);
});

it('returns buffered events with the requested filter and caps the wait', async () => {
  const { context } = setup();
  drainCdpEvents.mockResolvedValue({
    cursor: 3,
    nextSeq: 4,
    dropped: 0,
    capturing: true,
    events: [{ seq: 3, method: 'Debugger.paused', params: { callFrames: [] }, timestamp: 1 }]
  });

  const out = await tool.execute(
    { tabId: 41, action: 'events', pattern: 'Debugger.', waitMs: 999999, clear: true },
    context
  );
  expect(drainCdpEvents).toHaveBeenCalledWith(41, {
    cursor: 0,
    pattern: 'Debugger.',
    limit: undefined,
    waitMs: 15000,
    clear: true
  });
  expect(JSON.parse(out.output!).events).toHaveLength(1);
});

it('runs batch commands in order and stops at the first failure', async () => {
  const { context } = setup();
  sendCommand.mockImplementation(async (_tabId: number, method: string) => {
    if ('B.bad' === method) throw new Error('boom');
    return { ok: method };
  });

  const stopped = await tool.execute(
    {
      tabId: 41,
      action: 'batch',
      commands: [{ method: 'A.a' }, { method: 'B.bad' }, { method: 'C.c' }]
    },
    context
  );
  const results = JSON.parse(stopped.output!);
  expect(results).toHaveLength(2);
  expect(results[1]).toEqual({ ok: false, error: 'boom' });

  const continued = await tool.execute(
    {
      tabId: 41,
      action: 'batch',
      commands: [{ method: 'B.bad' }, { method: 'C.c' }],
      continueOnError: true
    },
    context
  );
  expect(JSON.parse(continued.output!)).toHaveLength(2);
});

it('passes unknown methods straight through and only flags missing ones', async () => {
  const { context } = setup();
  sendCommand.mockRejectedValueOnce(new Error("'Nope.nothing' wasn't found"));
  const out = await tool.execute({ tabId: 41, method: 'Nope.nothing' }, context);
  expect(sendCommand).toHaveBeenCalledWith(41, 'Nope.nothing', undefined);
  expect(out).toHaveProperty('error', expect.stringContaining("wasn't found"));
  expect(await tool.execute({ tabId: 41, method: '   ' }, context)).toHaveProperty('error');
});

it('rejects malformed input and denied tabs without sending', async () => {
  const { context } = setup();
  expect(
    await tool.execute({ tabId: 41, method: 'Runtime.evaluate', params: '[]' }, context)
  ).toHaveProperty('error');
  expect(
    await tool.execute({ tabId: 41, method: 'Runtime.evaluate', action: 'nope' }, context)
  ).toHaveProperty('error');
  expect(await tool.execute({ tabId: 41, action: 'batch', commands: [] }, context)).toHaveProperty(
    'error'
  );
  expect(
    await tool.execute({ tabId: 41, action: 'batch', commands: [{ params: {} }] }, context)
  ).toHaveProperty('error');

  const denied = setup({ allowed: false });
  expect(
    await tool.execute({ tabId: 41, method: 'Runtime.enable' }, denied.context)
  ).toHaveProperty('error', 'Permission denied for this tab.');
  expect(sendCommand).not.toHaveBeenCalled();
});

it('truncates oversized results instead of streaming them whole', async () => {
  const { context } = setup();
  const body = 'x'.repeat(500);
  sendCommand.mockResolvedValue({ body });
  const out = await tool.execute(
    {
      tabId: 41,
      method: 'Network.getResponseBody',
      params: { requestId: 'r1' },
      maxResultChars: 120
    },
    context
  );
  const parsed = JSON.parse(out.output!);
  expect(parsed).toMatchObject({ truncated: true });
  expect(parsed.bodyPrefix.length).toBe(120);
  expect(parsed.originalChars).toBeGreaterThan(500);
});

it('reports the tab session state without sending a command', async () => {
  const { context } = setup();
  isDebuggerAttached.mockResolvedValue(true);
  isNetworkTrackingEnabled.mockReturnValue(true);
  getNetworkRequests.mockReturnValue([{}, {}]);
  cdpEventBufferStats.mockReturnValue({ capturing: true, buffered: 3, nextSeq: 4 });
  buildCdpSessionReport.mockReturnValue({
    attached: true,
    enabledDomains: ['Network'],
    breakpoints: [],
    events: { capturing: true, buffered: 3, nextSeq: 4 },
    network: { tracking: true, requests: 2 }
  });

  const out = await tool.execute({ tabId: 41, action: 'status' }, context);
  expect(sendCommand).not.toHaveBeenCalled();
  expect(buildCdpSessionReport).toHaveBeenCalledWith(41, {
    attached: true,
    events: { capturing: true, buffered: 3, nextSeq: 4 },
    network: { tracking: true, requests: 2 }
  });
  expect(JSON.parse(out.output!)).toMatchObject({ attached: true, enabledDomains: ['Network'] });
});

it('chains earlier script results and waits for an event in one call', async () => {
  const { context } = setup();
  currentCdpEventCursor.mockReturnValue(7);
  sendCommand.mockImplementation(async (_tabId: number, method: string) => {
    if ('Network.enable' === method) return { requestId: 'r1' };
    if ('Network.getResponseBody' === method) return { body: 'ok' };
    return {};
  });
  drainCdpEvents
    .mockResolvedValueOnce({ cursor: 7, nextSeq: 8, dropped: 0, capturing: true, events: [] })
    .mockResolvedValueOnce({
      cursor: 8,
      nextSeq: 9,
      dropped: 0,
      capturing: true,
      events: [
        {
          seq: 8,
          method: 'Debugger.paused',
          params: { callFrames: [{ callFrameId: 'f0' }] },
          timestamp: 1
        }
      ]
    });

  const out = await tool.execute(
    {
      tabId: 41,
      action: 'batch',
      commands: [
        { method: 'Network.enable' },
        { method: 'Network.getResponseBody', params: { requestId: '${0.result.requestId}' } },
        { waitFor: 'Debugger.paused', timeoutMs: 5000 },
        { method: 'Debugger.resume' }
      ]
    },
    context
  );

  const results = JSON.parse(out.output!);
  expect(sendCommand).toHaveBeenCalledWith(41, 'Network.getResponseBody', { requestId: 'r1' });
  expect(results[1]).toEqual({ ok: true, result: { body: 'ok' } });
  expect(results[2]).toMatchObject({ ok: true, event: { seq: 8, method: 'Debugger.paused' } });
  expect(results[3]).toEqual({ ok: true, result: {} });
  expect(drainCdpEvents).toHaveBeenCalledWith(
    41,
    expect.objectContaining({ cursor: 7, pattern: 'Debugger.paused' })
  );
});

it('reports a wait timeout and stops the script instead of hanging', async () => {
  const { context } = setup();
  currentCdpEventCursor.mockReturnValue(0);
  drainCdpEvents.mockResolvedValue({
    cursor: 0,
    nextSeq: 1,
    dropped: 0,
    capturing: true,
    events: []
  });

  const out = await tool.execute(
    {
      tabId: 41,
      action: 'batch',
      commands: [{ waitFor: 'Debugger.paused', timeoutMs: 0 }, { method: 'Debugger.resume' }]
    },
    context
  );
  expect(JSON.parse(out.output!)).toEqual([
    { ok: false, error: 'timed out waiting for Debugger.paused' }
  ]);
  expect(sendCommand).not.toHaveBeenCalled();
});

it('lists debuggeable targets so workers can be driven without a tab', async () => {
  const { context } = setup();
  listCdpTargets.mockResolvedValue([
    { targetId: 'tab-1', type: 'page', url: 'https://muse.ai/', attached: false },
    { targetId: 'sw-1', type: 'service_worker', url: 'https://muse.ai/sw.js', attached: false }
  ]);

  const out = await tool.execute({ action: 'targets', pattern: 'service' }, context);

  expect(JSON.parse(out.output!)).toEqual([
    { targetId: 'sw-1', type: 'service_worker', url: 'https://muse.ai/sw.js', attached: false }
  ]);
});

it('routes a targetId command to the worker instead of the tab', async () => {
  const { context } = setup();
  sendCdpTargetCommand.mockResolvedValue({ result: { type: 'string', value: 'plain' } });

  const out = await tool.execute(
    {
      action: 'send',
      targetId: 'sw-1',
      method: 'Runtime.evaluate',
      params: { expression: 'self.__hook' }
    },
    context
  );

  expect(sendCdpTargetCommand).toHaveBeenCalledWith('sw-1', 'Runtime.evaluate', {
    expression: 'self.__hook'
  });
  expect(sendCommand).not.toHaveBeenCalled();
  expect(JSON.parse(out.output!)).toEqual({ result: { type: 'string', value: 'plain' } });
});
