import { afterEach, expect, it } from 'vitest';
import {
  clearCdpEvents,
  drainCdpEvents,
  enableCdpEventCapture,
  recordCdpEvent,
  resetCdpEventBuffer
} from './eventBuffer';

const TAB = 7;

afterEach(() => {
  resetCdpEventBuffer(TAB);
});

it('ignores events until capture is enabled for the tab', async () => {
  recordCdpEvent(TAB, 'Network.requestWillBeSent', { requestId: 'a' });
  expect((await drainCdpEvents(TAB)).events).toEqual([]);

  enableCdpEventCapture(TAB);
  recordCdpEvent(TAB, 'Network.requestWillBeSent', { requestId: 'a' });
  const drained = await drainCdpEvents(TAB);
  expect(drained.events).toEqual([
    {
      seq: 1,
      method: 'Network.requestWillBeSent',
      params: { requestId: 'a' },
      timestamp: expect.any(Number)
    }
  ]);
  expect(drained).toMatchObject({ cursor: 1, nextSeq: 2, dropped: 0, capturing: true });
});

it('filters by cursor, method pattern and limit', async () => {
  enableCdpEventCapture(TAB);
  recordCdpEvent(TAB, 'Runtime.consoleAPICalled', { n: 1 });
  recordCdpEvent(TAB, 'Debugger.paused', { n: 2 });
  recordCdpEvent(TAB, 'Debugger.resumed', { n: 3 });

  expect((await drainCdpEvents(TAB)).events.map((e) => e.seq)).toEqual([1, 2, 3]);
  expect((await drainCdpEvents(TAB, { cursor: 1 })).events.map((e) => e.seq)).toEqual([2, 3]);
  expect((await drainCdpEvents(TAB, { pattern: 'debugger.' })).events.map((e) => e.method)).toEqual(
    ['Debugger.paused', 'Debugger.resumed']
  );
  expect((await drainCdpEvents(TAB, { limit: 1 })).events.map((e) => e.seq)).toEqual([1]);
  await drainCdpEvents(TAB, { clear: true });
  expect((await drainCdpEvents(TAB)).events).toEqual([]);
});

it('keeps the newest events and reports what overflowed', async () => {
  enableCdpEventCapture(TAB);
  for (let i = 0; i < 2100; i++) recordCdpEvent(TAB, 'Runtime.consoleAPICalled', { i });
  const drained = await drainCdpEvents(TAB, { limit: 3000 });
  expect(drained.events).toHaveLength(2000);
  expect(drained.events[0]).toMatchObject({ seq: 101 });
  expect(drained.dropped).toBe(100);
});

it('drops chunk-level network noise so frames and pauses survive', async () => {
  enableCdpEventCapture(TAB);
  for (let i = 0; i < 500; i++) recordCdpEvent(TAB, 'Network.dataReceived', { dataLength: i });
  recordCdpEvent(TAB, 'Network.webSocketFrameReceived', { response: { payloadData: 'x' } });

  const drained = await drainCdpEvents(TAB);
  expect(drained.events.map((event) => event.method)).toEqual(['Network.webSocketFrameReceived']);
  expect(drained.nextSeq).toBe(2);
});

it('waits for a matching event that arrives inside the wait window', async () => {
  enableCdpEventCapture(TAB);
  const pending = drainCdpEvents(TAB, { pattern: 'Debugger.paused', waitMs: 2000 });
  setTimeout(() => recordCdpEvent(TAB, 'Debugger.paused', { callFrames: [] }), 60);
  const drained = await pending;
  expect(drained.events).toHaveLength(1);
  expect(drained.events[0].method).toBe('Debugger.paused');
});

it('drops the whole buffer when the tab or debugger goes away', async () => {
  enableCdpEventCapture(TAB);
  recordCdpEvent(TAB, 'Debugger.paused', {});
  resetCdpEventBuffer(TAB);
  // A fresh buffer starts uncapturing and at seq 1 again.
  expect((await drainCdpEvents(TAB)).events).toEqual([]);
  enableCdpEventCapture(TAB);
  recordCdpEvent(TAB, 'Debugger.paused', {});
  expect((await drainCdpEvents(TAB)).events[0].seq).toBe(1);
  clearCdpEvents(TAB);
});
