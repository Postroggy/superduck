import { afterEach, expect, it, vi } from 'vitest';
import {
  addNetworkRequest,
  appendWebSocketFrame,
  clearNetworkRequests,
  enableNetworkTracking,
  getNetworkRequests,
  readNetworkBodies,
  registerWebSocketRequest
} from './networkTracking';
import { getNetworkTrackingEnabled } from './state';

const TAB = 11;

afterEach(() => {
  clearNetworkRequests(TAB);
  getNetworkTrackingEnabled().delete(TAB);
});

function addRequest(requestId = 'r1', method = 'POST') {
  addNetworkRequest(TAB, 'example.test', {
    requestId,
    url: `https://example.test/${requestId}`,
    method,
    startedAt: 1
  });
}

it('keeps WebSocket frames on the request entry and clips oversized payloads', () => {
  registerWebSocketRequest(TAB, 'ws1', 'wss://example.test/socket', 'example.test');
  appendWebSocketFrame(TAB, 'ws1', {
    direction: 'sent',
    timestamp: 1,
    opcode: 1,
    payload: 'ping'
  });
  appendWebSocketFrame(TAB, 'ws1', {
    direction: 'received',
    timestamp: 2,
    opcode: 1,
    payload: 'x'.repeat(70000)
  });

  const [socket] = getNetworkRequests(TAB);
  expect(socket).toMatchObject({ method: 'WEBSOCKET', webSocketFrameCount: 2 });
  expect(socket.webSocketFrames).toHaveLength(2);
  expect(socket.webSocketFrames?.[0]).toMatchObject({ direction: 'sent', payload: 'ping' });
  expect(socket.webSocketFrames?.[1]).toMatchObject({ truncated: true });
  // A repeat event for the same handshake must not duplicate the entry.
  registerWebSocketRequest(TAB, 'ws1', 'wss://example.test/socket', 'example.test');
  expect(getNetworkRequests(TAB)).toHaveLength(1);
});

it('only cycles the Network domain once so cached response bodies survive reads', async () => {
  const sendCommand = vi.fn(
    async (_tabId: number, _method: string, _params?: Record<string, unknown>) => ({})
  );
  const ensureListener = vi.fn();

  await enableNetworkTracking(TAB, sendCommand, ensureListener);
  expect(sendCommand.mock.calls.map((call) => call[1])).toEqual([
    'Network.disable',
    'Network.enable'
  ]);

  await enableNetworkTracking(TAB, sendCommand, ensureListener);
  expect(sendCommand).toHaveBeenCalledTimes(2);
});

it('reads request and response bodies once and caches them on the request', async () => {
  addRequest();
  const sendCommand = vi.fn(async (_tabId: number, method: string) => {
    if ('Network.getRequestPostData' === method) return { postData: '{"a":1}' };
    if ('Network.getResponseBody' === method) return { body: '{"ok":true}', base64Encoded: false };
    return {};
  });

  const request = await readNetworkBodies(TAB, 'r1', sendCommand);
  expect(request).toMatchObject({ postData: '{"a":1}', responseBody: '{"ok":true}' });

  await readNetworkBodies(TAB, 'r1', sendCommand);
  expect(sendCommand).toHaveBeenCalledTimes(2);
});

it('records body read failures instead of retrying them', async () => {
  addRequest('r2', 'GET');
  const sendCommand = vi.fn(async (_tabId: number, method: string) => {
    if ('Network.getResponseBody' === method) throw new Error('No resource with given identifier');
    throw new Error('No post data');
  });

  await readNetworkBodies(TAB, 'r2', sendCommand);
  const [request] = getNetworkRequests(TAB);
  expect(request.responseBodyError).toBe('No resource with given identifier');
  await readNetworkBodies(TAB, 'r2', sendCommand);
  expect(sendCommand).toHaveBeenCalledTimes(2);
  expect(await readNetworkBodies(TAB, 'missing', sendCommand)).toBeUndefined();
});
