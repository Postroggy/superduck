import type { BufferedCdpEvent, CdpTabEventBuffer } from './types';

// Per-tab ring buffer for raw chrome.debugger events. Capture is off until a
// caller opts in (the `superduck_cdp` tool turns it on the first time it talks to
// a tab), so ordinary browsing never pays for this bookkeeping.
const MAX_EVENTS_PER_TAB = 2000;
const MAX_BUFFERED_BYTES_PER_TAB = 8 * 1024 * 1024;
const POLL_INTERVAL_MS = 40;
// Chrome emits one of these per body chunk; on a real page they are thousands of
// events per load and would evict the frames/pauses worth reading. The bytes are
// still visible through the assembled network view.
const NOISY_EVENT_METHODS = new Set(['Network.dataReceived']);

export interface DrainCdpEventsOptions {
  cursor?: number;
  pattern?: string;
  limit?: number;
  waitMs?: number;
  clear?: boolean;
}

export interface DrainedCdpEvent {
  seq: number;
  method: string;
  params: unknown;
  timestamp: number;
}

export interface DrainCdpEventsResult {
  cursor: number;
  nextSeq: number;
  dropped: number;
  capturing: boolean;
  events: DrainedCdpEvent[];
}

function initializeEventBuffers(): void {
  if (!globalThis.__cdpEventBuffersByTab) {
    globalThis.__cdpEventBuffersByTab = new Map();
  }
}

initializeEventBuffers();

function getBuffers(): Map<number, CdpTabEventBuffer> {
  return globalThis.__cdpEventBuffersByTab as Map<number, CdpTabEventBuffer>;
}

function estimateBytes(params: unknown): number {
  if (undefined === params) return 0;
  try {
    return JSON.stringify(params)?.length ?? 0;
  } catch {
    return 256;
  }
}

function bufferFor(tabId: number): CdpTabEventBuffer {
  const buffers = getBuffers();
  let buffer = buffers.get(tabId);
  if (!buffer) {
    buffer = { nextSeq: 1, events: [], bytes: 0, capturing: false };
    buffers.set(tabId, buffer);
  }
  return buffer;
}

export function enableCdpEventCapture(tabId: number): void {
  bufferFor(tabId).capturing = true;
}

export function isCdpEventCaptureEnabled(tabId: number): boolean {
  return getBuffers().get(tabId)?.capturing === true;
}

export function recordCdpEvent(tabId: number, method: string, params: unknown): void {
  const buffer = getBuffers().get(tabId);
  if (!buffer?.capturing || NOISY_EVENT_METHODS.has(method)) return;

  const event: BufferedCdpEvent = {
    seq: buffer.nextSeq,
    method,
    params,
    timestamp: Date.now(),
    bytes: estimateBytes(params)
  };
  buffer.nextSeq += 1;
  buffer.events.push(event);
  buffer.bytes += event.bytes;

  while (buffer.events.length > MAX_EVENTS_PER_TAB || buffer.bytes > MAX_BUFFERED_BYTES_PER_TAB) {
    const dropped = buffer.events.shift();
    if (!dropped) break;
    buffer.bytes -= dropped.bytes;
  }
}

export function clearCdpEvents(tabId: number): void {
  const buffer = getBuffers().get(tabId);
  if (!buffer) return;
  buffer.events = [];
  buffer.bytes = 0;
}

// Drop the whole buffer: called when the tab closes, and when the debugger
// detaches so a stale session cannot keep feeding events into the next one.
export function resetCdpEventBuffer(tabId: number): void {
  getBuffers().delete(tabId);
}

// Cursor to start a "new events only" read from: the seq of the newest event
// that already exists, so a waitFor inside a script does not replay history.
export function currentCdpEventCursor(tabId: number): number {
  const buffer = getBuffers().get(tabId);
  return buffer ? buffer.nextSeq - 1 : 0;
}

export function cdpEventBufferStats(tabId: number): {
  capturing: boolean;
  buffered: number;
  nextSeq: number;
} {
  const buffer = getBuffers().get(tabId);
  if (!buffer) return { capturing: false, buffered: 0, nextSeq: 1 };
  return { capturing: buffer.capturing, buffered: buffer.events.length, nextSeq: buffer.nextSeq };
}

function matchesPattern(method: string, pattern: string | undefined): boolean {
  if (!pattern) return true;
  return method.toLowerCase().includes(pattern.toLowerCase());
}

function collect(
  buffer: CdpTabEventBuffer,
  cursor: number,
  pattern: string | undefined,
  limit: number
): DrainedCdpEvent[] {
  const events: DrainedCdpEvent[] = [];
  for (const event of buffer.events) {
    if (event.seq <= cursor || !matchesPattern(event.method, pattern)) continue;
    events.push({
      seq: event.seq,
      method: event.method,
      params: event.params,
      timestamp: event.timestamp
    });
    if (events.length >= limit) break;
  }
  return events;
}

export async function drainCdpEvents(
  tabId: number,
  options: DrainCdpEventsOptions = {}
): Promise<DrainCdpEventsResult> {
  const cursor = options.cursor ?? 0;
  const pattern = options.pattern?.trim() || undefined;
  const limit = Math.max(1, options.limit ?? 200);
  const waitMs = Math.max(0, options.waitMs ?? 0);
  const buffer = bufferFor(tabId);
  const deadline = Date.now() + waitMs;

  let events = collect(buffer, cursor, pattern, limit);
  while (0 === events.length && Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())))
    );
    events = collect(buffer, cursor, pattern, limit);
  }

  const firstBufferedSeq = buffer.events[0]?.seq;
  const dropped =
    undefined === firstBufferedSeq ? 0 : Math.max(0, firstBufferedSeq - 1 - Math.max(cursor, 0));
  const lastDelivered = events.length > 0 ? events[events.length - 1].seq : cursor;

  if (options.clear) clearCdpEvents(tabId);

  return {
    cursor: lastDelivered,
    nextSeq: buffer.nextSeq,
    dropped,
    capturing: buffer.capturing,
    events
  };
}
