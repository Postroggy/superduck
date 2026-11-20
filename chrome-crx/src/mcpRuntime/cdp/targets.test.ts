import { afterEach, expect, it, vi } from 'vitest';
import {
  attachCdpTarget,
  detachCdpTarget,
  getAttachedCdpTargets,
  listCdpTargets,
  noteCdpTargetDetached,
  sendCdpTargetCommand
} from './targets';

const { getTargets, attach, detach, sendCommand } = vi.hoisted(() => ({
  getTargets: vi.fn(),
  attach: vi.fn(),
  detach: vi.fn(),
  sendCommand: vi.fn()
}));

const TARGET = 'sw-1';

function stubChrome(lastError?: string) {
  vi.stubGlobal('chrome', {
    debugger: { getTargets, attach, detach, sendCommand },
    runtime: { lastError: lastError ? { message: lastError } : undefined }
  });
}

afterEach(() => {
  for (const id of getAttachedCdpTargets()) noteCdpTargetDetached(id);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('lists every debuggeable target with its type and attachment state', async () => {
  stubChrome();
  getTargets.mockResolvedValue([
    { id: 'tab-1', type: 'page', title: 'Muse', url: 'https://muse.ai/', attached: false },
    { id: 'sw-1', type: 'service_worker', title: '', url: 'https://muse.ai/sw.js', attached: true }
  ]);

  expect(await listCdpTargets()).toEqual([
    { targetId: 'tab-1', type: 'page', title: 'Muse', url: 'https://muse.ai/', attached: false },
    {
      targetId: 'sw-1',
      type: 'service_worker',
      title: undefined,
      url: 'https://muse.ai/sw.js',
      attached: true
    }
  ]);
});

it('attaches once per target and keeps the attached set', async () => {
  stubChrome();
  attach.mockResolvedValue(undefined);

  await attachCdpTarget(TARGET);
  await attachCdpTarget(TARGET);
  expect(attach).toHaveBeenCalledTimes(1);
  expect(attach).toHaveBeenCalledWith({ targetId: TARGET }, '1.3');
  expect(getAttachedCdpTargets()).toEqual([TARGET]);

  detach.mockResolvedValue(undefined);
  await detachCdpTarget(TARGET);
  expect(detach).toHaveBeenCalledWith({ targetId: TARGET });
  expect(getAttachedCdpTargets()).toEqual([]);
});

it('sends commands to the target and re-attaches once when the worker was recycled', async () => {
  stubChrome();
  attach.mockResolvedValue(undefined);

  const responses: Array<{ error?: string; result?: unknown }> = [
    { error: 'Debugger is not attached to the target' },
    { result: { ok: true } }
  ];
  sendCommand.mockImplementation((_debuggee, _method, _params, callback: (r: unknown) => void) => {
    const next = responses.shift() ?? { result: {} };
    vi.stubGlobal('chrome', {
      debugger: { getTargets, attach, detach, sendCommand },
      runtime: { lastError: next.error ? { message: next.error } : undefined }
    });
    callback(next.result);
  });

  await expect(sendCdpTargetCommand(TARGET, 'Runtime.enable')).resolves.toEqual({ ok: true });
  expect(attach).toHaveBeenCalledTimes(2);
  expect(sendCommand).toHaveBeenCalledTimes(2);
});
