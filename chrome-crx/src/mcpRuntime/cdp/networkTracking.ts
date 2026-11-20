import {
  MAX_REQUESTS_PER_TAB,
  getNetworkRequestsByTab,
  getNetworkTrackingEnabled,
  isDebuggerListenerRegistered
} from './state';
import type {
  NetworkRequest,
  NetworkResponse,
  ResponseBodyResult,
  SendCommand,
  WebSocketFrame
} from './types';

const MAX_WS_FRAMES_PER_REQUEST = 200;
const MAX_WS_FRAME_CHARS = 65536;

export function addNetworkRequest(tabId: number, domain: string, request: NetworkRequest): void {
  let tabData = getNetworkRequestsByTab().get(tabId);

  if (tabData) {
    if (tabData.domain !== domain) {
      tabData.domain = domain;
      tabData.requests = [];
      tabData.requestMap = new Map();
    }
  } else {
    tabData = { domain, requests: [], requestMap: new Map() };
    getNetworkRequestsByTab().set(tabId, tabData);
  }

  tabData.requests.push(request);
  tabData.requestMap.set(request.requestId, request);

  if (tabData.requests.length > MAX_REQUESTS_PER_TAB) {
    const excess = tabData.requests.length - MAX_REQUESTS_PER_TAB;
    const removed = tabData.requests.splice(0, excess);
    for (const req of removed) {
      if (tabData.requestMap.get(req.requestId) === req) tabData.requestMap.delete(req.requestId);
    }
  }
}

function elapsedMs(request: NetworkRequest, timestamp: number): number {
  return Math.max(0, Math.round((timestamp - request.startedAt) * 1_000));
}

function findRequest(tabId: number, requestId: string): NetworkRequest | undefined {
  const tab = getNetworkRequestsByTab().get(tabId);
  if (!tab) return undefined;
  return tab.requestMap.get(requestId) ?? tab.requests.find((req) => req.requestId === requestId);
}

// WebSocket handshakes are not always surfaced by Network.requestWillBeSent in
// a useful form, so Network.webSocketCreated seeds the entry on its own. The
// page domain comes from the caller (eventHandlers already resolves it) so this
// module stays free of the tabState import chain.
export function registerWebSocketRequest(
  tabId: number,
  requestId: string,
  url: string,
  domain: string
): void {
  if (findRequest(tabId, requestId)) return;
  const pageDomain = getNetworkRequestsByTab().get(tabId)?.domain ?? domain;
  addNetworkRequest(tabId, pageDomain, {
    requestId,
    url,
    method: 'WEBSOCKET',
    startedAt: Date.now() / 1000
  });
}

export function appendWebSocketFrame(
  tabId: number,
  requestId: string,
  frame: WebSocketFrame
): void {
  const request = findRequest(tabId, requestId);
  if (!request) return;
  const stored: WebSocketFrame =
    frame.payload.length > MAX_WS_FRAME_CHARS
      ? { ...frame, payload: frame.payload.slice(0, MAX_WS_FRAME_CHARS), truncated: true }
      : frame;
  const frames = request.webSocketFrames ?? [];
  frames.push(stored);
  if (frames.length > MAX_WS_FRAMES_PER_REQUEST)
    frames.splice(0, frames.length - MAX_WS_FRAMES_PER_REQUEST);
  request.webSocketFrames = frames;
  request.webSocketFrameCount = (request.webSocketFrameCount ?? 0) + 1;
}

// Bodies live in Chrome's network cache and are only retrievable while the
// renderer still holds them, so they are read on demand and cached on the
// request record instead of being pulled for every response.
export async function readNetworkBodies(
  tabId: number,
  requestId: string,
  sendCommand: SendCommand
): Promise<NetworkRequest | undefined> {
  const request = findRequest(tabId, requestId);
  if (!request) return undefined;

  if (undefined === request.postData && !request.postDataFetched) {
    request.postDataFetched = true;
    try {
      const postData = (await sendCommand(tabId, 'Network.getRequestPostData', { requestId })) as
        | { postData?: string }
        | undefined;
      if (postData?.postData) request.postData = postData.postData;
    } catch {
      // Requests without a body have no post data; the event field is enough.
    }
  }

  if (undefined !== request.responseBody || request.responseBodyError) return request;
  try {
    const result = (await sendCommand(tabId, 'Network.getResponseBody', { requestId })) as
      | ResponseBodyResult
      | undefined;
    request.responseBody = result?.body ?? '';
    request.responseBodyBase64Encoded = result?.base64Encoded === true;
  } catch (error) {
    request.responseBodyError = error instanceof Error ? error.message : String(error);
  }
  return request;
}

export function recordNetworkResponse(
  tabId: number,
  requestId: string,
  timestamp: number,
  response: NetworkResponse
): void {
  const request = getNetworkRequestsByTab().get(tabId)?.requestMap.get(requestId);
  if (!request) return;
  request.status = response.status;
  request.mimeType = response.mimeType;
  request.protocol = response.protocol;
  request.responseTimeMs = elapsedMs(request, timestamp);
}

export function finishNetworkRequest(
  tabId: number,
  requestId: string,
  timestamp: number,
  result: { transferredBytes?: number; failure?: string } = {}
): void {
  const tab = getNetworkRequestsByTab().get(tabId);
  const request = tab?.requestMap.get(requestId);
  if (!request) return;
  request.durationMs = elapsedMs(request, timestamp);
  request.transferredBytes = result.transferredBytes;
  request.failure = result.failure;
  tab?.requestMap.delete(requestId);
}

export async function enableNetworkTracking(
  tabId: number,
  sendCommand: SendCommand,
  ensureListener: () => void
): Promise<void> {
  if (!isDebuggerListenerRegistered()) {
    ensureListener();
  }
  // Disabling the Network domain makes Chrome drop every cached response body,
  // which would make `Network.getResponseBody` fail for requests captured before
  // the call. So only run the disable/enable cycle when the domain is not
  // already on; a detach clears the flag so a re-attach still re-enables.
  if (getNetworkTrackingEnabled().has(tabId)) return;
  try {
    await sendCommand(tabId, 'Network.disable');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  } catch {
    // ignore: the domain may never have been enabled
  }
  await sendCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
  getNetworkTrackingEnabled().add(tabId);
}

export function getNetworkRequests(tabId: number, urlFilter?: string): NetworkRequest[] {
  const tabData = getNetworkRequestsByTab().get(tabId);
  if (!tabData) return [];

  let requests = tabData.requests;
  if (urlFilter) {
    requests = requests.filter((req) => req.url.includes(urlFilter));
  }
  return requests;
}

export function clearNetworkRequests(tabId: number): void {
  getNetworkRequestsByTab().delete(tabId);
}

export function isNetworkTrackingEnabled(tabId: number): boolean {
  return getNetworkTrackingEnabled().has(tabId);
}
