import type {
  CdpBreakpointRecord,
  CdpPausedFrame,
  CdpPausedState,
  CdpSessionReport,
  CdpTabSessionState
} from './types';

// Chrome owns the protocol session; this module only mirrors the few facts the
// extension needs between calls: which domains are on, where breakpoints live,
// and whether the renderer is currently paused. Everything here is derived from
// commands and events we already see, so drift degrades a report — it never
// changes what gets sent to Chrome.

const MAX_TRACKED_BREAKPOINTS = 200;
const MAX_REPORTED_FRAMES = 10;

interface PausedParams {
  reason?: string;
  hitBreakpoints?: string[];
  callFrames?: Array<{
    callFrameId?: string;
    functionName?: string;
    url?: string;
    location?: { lineNumber?: number; columnNumber?: number };
  }>;
}

interface BreakpointParams {
  url?: string;
  urlRegex?: string;
  lineNumber?: number;
  columnNumber?: number;
  location?: { scriptId?: string; lineNumber?: number; columnNumber?: number };
}

interface BreakpointResult {
  breakpointId?: string;
  locations?: Array<{
    scriptId?: string;
    lineNumber?: number;
    columnNumber?: number;
  }>;
}

function initializeCdpSessions(): void {
  if (!globalThis.__cdpSessionStateByTab) {
    globalThis.__cdpSessionStateByTab = new Map();
  }
}

initializeCdpSessions();

function getSessions(): Map<number, CdpTabSessionState> {
  return globalThis.__cdpSessionStateByTab as Map<number, CdpTabSessionState>;
}

function sessionFor(tabId: number): CdpTabSessionState {
  const sessions = getSessions();
  let session = sessions.get(tabId);
  if (!session) {
    session = { enabledDomains: new Set(), breakpoints: new Map() };
    sessions.set(tabId, session);
  }
  return session;
}

export function getCdpSessionState(tabId: number): CdpTabSessionState | undefined {
  return getSessions().get(tabId);
}

export function resetCdpSessionState(tabId: number): void {
  getSessions().delete(tabId);
}

export function isTabPaused(tabId: number): boolean {
  return undefined !== getSessions().get(tabId)?.paused;
}

export function describeTabPause(tabId: number): string | undefined {
  const paused = getSessions().get(tabId)?.paused;
  if (!paused) return undefined;
  const frame = paused.frames[0];
  const where = frame
    ? `${frame.url ?? '<anonymous>'}:${(frame.lineNumber ?? 0) + 1}`
    : 'an unknown script';
  const fn = frame?.functionName ? ` in ${frame.functionName}` : '';
  return `tab ${tabId} is paused at ${where}${fn} (${paused.reason ?? 'other'})`;
}

function domainOf(method: string): { domain: string; command: string } | undefined {
  const dot = method.indexOf('.');
  if (dot <= 0) return undefined;
  return { domain: method.slice(0, dot), command: method.slice(dot + 1) };
}

export function noteCdpCommandSent(
  tabId: number,
  method: string,
  params?: Record<string, unknown>
): void {
  const session = sessionFor(tabId);
  session.lastCommand = method;
  session.lastCommandAt = Date.now();
  session.lastError = undefined;

  const parts = domainOf(method);
  if (!parts) return;
  if ('enable' === parts.command) session.enabledDomains.add(parts.domain);
  if ('disable' === parts.command) session.enabledDomains.delete(parts.domain);
  if ('Debugger.removeBreakpoint' === method && 'string' === typeof params?.breakpointId) {
    session.breakpoints.delete(params.breakpointId);
  }
}

export function noteCdpCommandResult(
  tabId: number,
  method: string,
  params: Record<string, unknown> | undefined,
  result: unknown
): void {
  if ('Debugger.setBreakpointByUrl' !== method && 'Debugger.setBreakpoint' !== method) return;
  const session = sessionFor(tabId);
  const breakpoint = result as BreakpointResult | undefined;
  const id = breakpoint?.breakpointId;
  if (!id) return;

  const input = (params ?? {}) as BreakpointParams;
  const location = input.location;
  const resolved = breakpoint?.locations?.[0];
  const record: CdpBreakpointRecord = {
    id,
    url: input.url,
    urlRegex: input.urlRegex,
    lineNumber: location?.lineNumber ?? input.lineNumber ?? resolved?.lineNumber,
    columnNumber: location?.columnNumber ?? input.columnNumber ?? resolved?.columnNumber,
    scriptId: location?.scriptId ?? resolved?.scriptId,
    createdAt: Date.now()
  };
  session.breakpoints.set(id, record);

  while (session.breakpoints.size > MAX_TRACKED_BREAKPOINTS) {
    const oldest = session.breakpoints.keys().next();
    if (oldest.done) break;
    session.breakpoints.delete(oldest.value);
  }
}

export function noteCdpCommandFailure(tabId: number, method: string, error: unknown): void {
  const session = sessionFor(tabId);
  session.lastCommand = method;
  session.lastCommandAt = Date.now();
  session.lastError = error instanceof Error ? error.message : String(error);
}

function toFrames(callFrames: PausedParams['callFrames']): CdpPausedFrame[] {
  return (callFrames ?? []).slice(0, MAX_REPORTED_FRAMES).map((frame) => ({
    functionName: frame.functionName || undefined,
    url: frame.url,
    lineNumber: frame.location?.lineNumber,
    columnNumber: frame.location?.columnNumber,
    callFrameId: frame.callFrameId
  }));
}

export function noteCdpEvent(tabId: number, method: string, params: unknown): void {
  if ('Debugger.paused' === method) {
    const paused = params as PausedParams;
    const state: CdpPausedState = {
      reason: paused?.reason,
      since: Date.now(),
      hitBreakpoints: paused?.hitBreakpoints,
      frames: toFrames(paused?.callFrames)
    };
    sessionFor(tabId).paused = state;
    return;
  }
  if ('Debugger.resumed' === method) {
    const session = getSessions().get(tabId);
    if (session) session.paused = undefined;
    return;
  }
  if ('Debugger.breakpointResolved' === method) {
    const resolved = params as {
      breakpointId?: string;
      location?: { scriptId?: string; lineNumber?: number; columnNumber?: number };
    };
    const session = getSessions().get(tabId);
    const record = resolved?.breakpointId
      ? session?.breakpoints.get(resolved.breakpointId)
      : undefined;
    if (!record) return;
    record.scriptId = resolved?.location?.scriptId ?? record.scriptId;
    record.lineNumber = resolved?.location?.lineNumber ?? record.lineNumber;
    record.columnNumber = resolved?.location?.columnNumber ?? record.columnNumber;
  }
}

export function buildCdpSessionReport(
  tabId: number,
  extras: {
    attached: boolean;
    events: { capturing: boolean; buffered: number; nextSeq: number };
    network: { tracking: boolean; requests: number };
  }
): CdpSessionReport {
  const session = getSessions().get(tabId);
  const paused = session?.paused;
  return {
    attached: extras.attached,
    enabledDomains: session ? [...session.enabledDomains].sort() : [],
    ...(paused && {
      paused: {
        reason: paused.reason,
        sinceMs: Date.now() - paused.since,
        hitBreakpoints: paused.hitBreakpoints,
        topFrame: paused.frames[0],
        frameCount: paused.frames.length,
        frames: paused.frames
      }
    }),
    breakpoints: session ? [...session.breakpoints.values()] : [],
    lastCommand: session?.lastCommand,
    lastCommandAgeMs: session?.lastCommandAt ? Date.now() - session.lastCommandAt : undefined,
    lastError: session?.lastError,
    events: extras.events,
    network: extras.network
  };
}
