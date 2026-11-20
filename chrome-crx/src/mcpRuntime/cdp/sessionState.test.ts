import { afterEach, expect, it } from 'vitest';
import {
  buildCdpSessionReport,
  describeTabPause,
  getCdpSessionState,
  isTabPaused,
  noteCdpCommandFailure,
  noteCdpCommandResult,
  noteCdpCommandSent,
  resetCdpSessionState
} from './sessionState';
import { noteCdpEvent } from './sessionState';

const TAB = 77;

const extras = {
  attached: true,
  events: { capturing: true, buffered: 3, nextSeq: 4 },
  network: { tracking: true, requests: 2 }
};

afterEach(() => {
  resetCdpSessionState(TAB);
});

it('mirrors enabled domains and breakpoints from the commands we send', () => {
  noteCdpCommandSent(TAB, 'Network.enable');
  noteCdpCommandSent(TAB, 'Debugger.enable');
  noteCdpCommandSent(TAB, 'Debugger.setBreakpointByUrl', { url: 'app.js', lineNumber: 2 });
  noteCdpCommandResult(
    TAB,
    'Debugger.setBreakpointByUrl',
    { url: 'app.js', lineNumber: 2 },
    {
      breakpointId: 'br:1:2',
      locations: [{ scriptId: '9', lineNumber: 2, columnNumber: 15 }]
    }
  );
  noteCdpCommandSent(TAB, 'Debugger.disable');

  const report = buildCdpSessionReport(TAB, extras);
  expect(report.enabledDomains).toEqual(['Network']);
  expect(report.breakpoints).toEqual([
    {
      id: 'br:1:2',
      url: 'app.js',
      urlRegex: undefined,
      lineNumber: 2,
      columnNumber: 15,
      scriptId: '9',
      createdAt: expect.any(Number)
    }
  ]);
  expect(report.lastCommand).toBe('Debugger.disable');

  noteCdpCommandSent(TAB, 'Debugger.removeBreakpoint', { breakpointId: 'br:1:2' });
  expect(buildCdpSessionReport(TAB, extras).breakpoints).toEqual([]);
});

it('tracks the paused frame so callers can report and guard on it', () => {
  expect(isTabPaused(TAB)).toBe(false);
  noteCdpEvent(TAB, 'Debugger.paused', {
    reason: 'other',
    hitBreakpoints: ['br:1:2'],
    callFrames: [
      {
        callFrameId: 'f0',
        functionName: 'pickUser',
        url: 'http://x/app.js',
        location: { lineNumber: 2, columnNumber: 15 }
      },
      {
        callFrameId: 'f1',
        functionName: '',
        url: 'http://x/app.js',
        location: { lineNumber: 23, columnNumber: 0 }
      }
    ]
  });

  expect(isTabPaused(TAB)).toBe(true);
  expect(describeTabPause(TAB)).toBe('tab 77 is paused at http://x/app.js:3 in pickUser (other)');

  const report = buildCdpSessionReport(TAB, extras);
  expect(report.paused).toMatchObject({
    reason: 'other',
    hitBreakpoints: ['br:1:2'],
    frameCount: 2,
    topFrame: { callFrameId: 'f0', functionName: 'pickUser' }
  });
  expect(report.paused?.sinceMs).toBeGreaterThanOrEqual(0);

  noteCdpEvent(TAB, 'Debugger.resumed', {});
  expect(isTabPaused(TAB)).toBe(false);
  expect(buildCdpSessionReport(TAB, extras).paused).toBeUndefined();
});

it('keeps the last failure and clears it on the next command', () => {
  noteCdpCommandFailure(TAB, 'Network.getResponseBody', new Error('No resource'));
  expect(buildCdpSessionReport(TAB, extras).lastError).toBe('No resource');
  noteCdpCommandSent(TAB, 'Network.enable');
  expect(buildCdpSessionReport(TAB, extras).lastError).toBeUndefined();
});

it('reports an empty session for a tab it has never seen', () => {
  expect(getCdpSessionState(999)).toBeUndefined();
  const report = buildCdpSessionReport(999, {
    attached: false,
    events: { capturing: false, buffered: 0, nextSeq: 1 },
    network: { tracking: false, requests: 0 }
  });
  expect(report).toMatchObject({
    attached: false,
    enabledDomains: [],
    breakpoints: [],
    events: { buffered: 0 },
    network: { requests: 0 }
  });
  expect(report.paused).toBeUndefined();
});
