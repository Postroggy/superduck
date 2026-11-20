import { expect, it, vi } from 'vitest';
import { registerDebuggerEventHandlers } from './eventHandlers';
import { clearNetworkRequests, getNetworkRequests } from './networkTracking';

vi.mock('../tabState', () => ({}));

it('records redirects and distinguishes HTTP responses from browser failures', () => {
  const tabId = 42;
  const addListener = vi.fn();
  vi.stubGlobal('chrome', { debugger: { onEvent: { addListener } } });
  try {
    registerDebuggerEventHandlers();
    const [handle] = addListener.mock.calls[0] as [
      (source: chrome.debugger.Debuggee, method: string, params: object) => void
    ];
    const fire = (method: string, params: object) => handle({ tabId }, `Network.${method}`, params);
    const origin = 'http://localhost';
    const start = (url: string, timestamp: number, redirectResponse?: object) =>
      fire('requestWillBeSent', {
        requestId: 'req',
        request: { url, method: 'GET', headers: { Authorization: 'test-marker' } },
        documentURL: origin,
        timestamp,
        redirectResponse
      });

    start(`${origin}/redirect`, 1);
    start(`${origin}/final`, 1.1, { status: 302 });
    fire('responseReceived', {
      requestId: 'req',
      timestamp: 1.15,
      response: { status: 200, mimeType: 'application/json', protocol: 'http/1.1' }
    });
    fire('loadingFinished', { requestId: 'req', timestamp: 1.2, encodedDataLength: 500 });
    start(`${origin}/failure`, 2);
    fire('loadingFailed', {
      requestId: 'req',
      timestamp: 2.05,
      errorText: 'net::ERR_CONNECTION_RESET'
    });

    const [redirect, final, failure] = getNetworkRequests(tabId);
    expect(redirect).toMatchObject({ status: 302, durationMs: 100 });
    expect(final).toMatchObject({
      status: 200,
      mimeType: 'application/json',
      protocol: 'http/1.1',
      responseTimeMs: 50,
      durationMs: 100,
      transferredBytes: 500
    });
    expect(failure).toMatchObject({ failure: 'net::ERR_CONNECTION_RESET', durationMs: 50 });
    expect(failure.status).toBeUndefined();
    expect(JSON.stringify([redirect, final, failure])).not.toContain('test-marker');
  } finally {
    clearNetworkRequests(tabId);
    globalThis.__cdpDebuggerEventHandler = undefined;
    vi.unstubAllGlobals();
  }
});

it('captures request bodies and WebSocket frames from protocol events', () => {
  const tabId = 43;
  const addListener = vi.fn();
  vi.stubGlobal('chrome', { debugger: { onEvent: { addListener } } });
  try {
    registerDebuggerEventHandlers();
    const [handle] = addListener.mock.calls[0] as [
      (source: chrome.debugger.Debuggee, method: string, params: object) => void
    ];
    const fire = (method: string, params: object) => handle({ tabId }, method, params);

    fire('Network.requestWillBeSent', {
      requestId: 'r',
      request: { url: 'https://a.test/api', method: 'POST', postData: '{"x":1}' },
      timestamp: 1,
      documentURL: 'https://a.test/'
    });
    fire('Network.webSocketCreated', { requestId: 'ws', url: 'wss://a.test/s' });
    fire('Network.webSocketFrameSent', {
      requestId: 'ws',
      timestamp: 2,
      response: { opcode: 1, payloadData: 'out' }
    });
    fire('Network.webSocketFrameReceived', {
      requestId: 'ws',
      timestamp: 3,
      response: { opcode: 1, payloadData: 'in' }
    });

    const [request, socket] = getNetworkRequests(tabId);
    expect(request.postData).toBe('{"x":1}');
    expect(socket.webSocketFrames?.map((frame) => frame.payload)).toEqual(['out', 'in']);
    expect(socket.webSocketFrameCount).toBe(2);
  } finally {
    clearNetworkRequests(tabId);
    globalThis.__cdpDebuggerEventHandler = undefined;
    vi.unstubAllGlobals();
  }
});
