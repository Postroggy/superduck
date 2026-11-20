import { isRecord } from '../../messageTypes';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';

const NAME = 'superduck_cdp';
const DESCRIPTION = [
  'Raw Chrome DevTools Protocol, passed through verbatim — no method whitelist, no rewriting.',
  'Use it for what page tools cannot do: JS breakpoints/stepping/call-frame locals, the CSS cascade with rule origins and overrides, request and response bodies, WebSocket frames, request interception, emulation, and worker targets.',
  'action "send": method + params -> the protocol result verbatim.',
  'action "batch": a CDP script, so a whole sequence costs one call. A step is {"method","params"}, {"waitFor":"Debugger.paused","timeoutMs":N} to block for a NEW event, or {"sleepMs":N}; params can reference earlier steps with ${0.result.requestId} or ${prev...}.',
  'action "events": buffered protocol events since a cursor — CDP cannot hand events back synchronously, hence the per-tab ring buffer.',
  'action "status": the tab session mirror (enabled domains, breakpoints, pause state with frames, counters) instead of re-deriving it from scratch.',
  'action "targets": debuggeable workers/service workers; needs no tabId, and a targetId drives that target directly (commands only, not events/status). Sockets or crypto that page-level JS hooks never see usually live there.',
  'Domains must be enabled first (Debugger.enable, Network.enable, CSS.enable, ...).'
].join(' ');

const MAX_WAIT_MS = 15000;
const DEFAULT_WAIT_MS = 5000;
const DEFAULT_SLEEP_LIMIT_MS = 5000;

const PARAMETERS = {
  tabId: {
    type: 'number',
    description: 'Target tab in this browser session. Required unless targetId is given.'
  },
  targetId: {
    type: 'string',
    description:
      'Debug a worker or service worker instead of a tab (see action "targets"). Worker targets answer commands only.'
  },
  action: {
    type: 'string',
    enum: ['send', 'batch', 'events', 'status', 'targets'],
    description:
      'send (default) = one method, batch = CDP script, events = buffered events, status = session state, targets = list debuggeable targets.'
  },
  method: {
    type: 'string',
    description: 'Any CDP method, e.g. "Network.getResponseBody" or "Debugger.setBreakpointByUrl".'
  },
  params: {
    type: 'object',
    description: 'CDP parameters, passed through untouched. Object or JSON string; omit when none.'
  },
  commands: {
    type: 'array',
    items: { type: 'object' },
    description:
      'action "batch": ordered steps. One step is {method, params}, {waitFor, timeoutMs} or {sleepMs}.'
  },
  continueOnError: {
    type: 'boolean',
    description:
      'action "batch": keep running after a failed step (default false = stop at the first error).'
  },
  pattern: {
    type: 'string',
    description:
      'action "events": case-insensitive substring filter on the method. action "targets": substring filter on type/url.'
  },
  cursor: {
    type: 'number',
    description:
      'action "events": return events with seq > cursor. Pass the previous result\'s cursor.'
  },
  limit: {
    type: 'number',
    description: 'action "events": maximum events to return (default 200).'
  },
  waitMs: {
    type: 'number',
    description: 'action "events": wait up to this long for matching events (max 15000).'
  },
  clear: {
    type: 'boolean',
    description: 'action "events": drop the buffered events after returning them.'
  },
  maxResultChars: {
    type: 'number',
    description:
      'Optional cap on the serialized result (default 0 = return everything). Only set this when a payload is too large for the caller.'
  }
};

interface CdpToolInput {
  tabId?: number;
  targetId?: string;
  action?: string;
  method?: string;
  params?: unknown;
  commands?: unknown[];
  continueOnError?: boolean;
  pattern?: string;
  cursor?: number;
  limit?: number;
  waitMs?: number;
  clear?: boolean;
  maxResultChars?: number;
}

type ScriptEntry = { ok: true; result?: unknown; event?: unknown } | { ok: false; error: string };

interface ScriptStep {
  method?: string;
  params?: unknown;
  waitFor?: string | string[];
  timeoutMs?: number;
  sleepMs?: number;
}

interface SelectedEvent {
  seq: number;
  method: string;
  params: unknown;
  timestamp: number;
}

type Send = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

function isParamsObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

function parseParams(raw: unknown): Record<string, unknown> | undefined {
  if (undefined === raw || null === raw) return undefined;
  if ('string' === typeof raw) {
    if ('' === raw.trim()) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('params must be a JSON object.');
    }
    if (!isParamsObject(parsed)) throw new Error('params must be a JSON object.');
    return parsed;
  }
  if (!isParamsObject(raw)) throw new Error('params must be a JSON object.');
  return raw;
}

function clampMs(value: unknown, fallback: number, max: number): number {
  const ms = 'number' === typeof value && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(0, ms), max);
}

function parseScript(raw: unknown): ScriptStep[] {
  if (!Array.isArray(raw) || 0 === raw.length)
    throw new Error('action "batch" needs a non-empty commands array.');
  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`commands[${index}] must be an object.`);
    if ('waitFor' in entry) {
      const waitFor = entry.waitFor;
      if ('string' === typeof waitFor)
        return { waitFor, timeoutMs: entry.timeoutMs as number | undefined };
      if (Array.isArray(waitFor) && waitFor.every((item) => 'string' === typeof item))
        return { waitFor: waitFor as string[], timeoutMs: entry.timeoutMs as number | undefined };
      throw new Error(`commands[${index}].waitFor must be a method string or a list of them.`);
    }
    if ('sleepMs' in entry) return { sleepMs: clampMs(entry.sleepMs, 0, DEFAULT_SLEEP_LIMIT_MS) };
    const method = 'string' === typeof entry.method ? entry.method.trim() : '';
    if (!method) throw new Error(`commands[${index}] needs a CDP method.`);
    return { method, params: entry.params };
  });
}

const REFERENCE_PATTERN = /\$\{([A-Za-z0-9_]+)((?:\.[A-Za-z0-9_-]+)*)\}/g;

// `${0.result.requestId}` / `${prev.result.body}` resolve against earlier steps,
// so a script can chain requestId -> getResponseBody without another round trip.
function resolveReferences(value: unknown, results: ScriptEntry[]): unknown {
  if ('string' === typeof value) {
    return value.replace(REFERENCE_PATTERN, (literal, key: string, path: string) => {
      const index = 'prev' === key ? results.length - 1 : Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= results.length) return literal;
      let current: unknown = results[index];
      for (const part of path.split('.').filter(Boolean)) {
        if (null === current || 'object' !== typeof current) return literal;
        current = (current as Record<string, unknown>)[part];
      }
      if (undefined === current) return literal;
      return 'string' === typeof current ? current : JSON.stringify(current);
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolveReferences(item, results));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveReferences(item, results)])
    );
  }
  return value;
}

async function waitForEvent(
  tabId: number,
  cursorRef: { seq: number },
  patterns: string[],
  timeoutMs: number
): Promise<SelectedEvent | undefined> {
  const { drainCdpEvents } = await import('../cdp');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const pattern of patterns) {
      const drained = await drainCdpEvents(tabId, {
        cursor: cursorRef.seq,
        pattern,
        limit: 1,
        waitMs: Math.max(0, deadline - Date.now())
      });
      if (drained.events.length > 0) {
        cursorRef.seq = drained.events[0].seq;
        return drained.events[0];
      }
    }
    if (Date.now() >= deadline) return undefined;
  }
}

function serialize(payload: unknown, maxResultChars: number): string {
  let text: string;
  try {
    text = JSON.stringify(payload) ?? 'null';
  } catch (error) {
    throw new Error(
      `CDP result is not JSON-serializable: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  if (maxResultChars > 0 && text.length > maxResultChars) {
    return JSON.stringify({
      truncated: true,
      originalChars: text.length,
      bodyPrefix: text.slice(0, maxResultChars)
    });
  }
  return text;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const superduckCdpTool: ToolDefinition<CdpToolInput> = {
  name: NAME,
  description: DESCRIPTION,
  tabAccess: 'write',
  parameters: PARAMETERS,
  execute: async (input, context): Promise<ToolResult> => {
    const action = input?.action ?? ('commands' in (input ?? {}) ? 'batch' : 'send');
    if (!['send', 'batch', 'events', 'status', 'targets'].includes(action))
      return { error: `Unsupported CDP action: ${action}` };

    const maxResultChars =
      'number' === typeof input.maxResultChars && Number.isFinite(input.maxResultChars)
        ? Math.max(0, input.maxResultChars)
        : 0;
    const cdp = await import('../cdp');
    const { cdpDebugger, drainCdpEvents, enableCdpEventCapture } = cdp;

    if ('targets' === action) {
      try {
        const pattern = input.pattern?.trim().toLowerCase();
        const targets = (await cdp.listCdpTargets()).filter(
          (target) =>
            !pattern || `${target.type} ${target.url ?? ''}`.toLowerCase().includes(pattern)
        );
        return { output: serialize(targets, maxResultChars) };
      } catch (error) {
        return { error: `Could not list CDP targets: ${errorMessage(error)}` };
      }
    }

    // Worker/service-worker targets answer commands only: events, status and the
    // assembled network view are bound to a tab's debugger session.
    const targetId = 'string' === typeof input.targetId ? input.targetId.trim() : '';
    if (targetId && 'events' === action)
      return { error: '"events" needs a tab target; worker targets answer commands only.' };
    if (targetId && 'status' === action)
      return { error: '"status" needs a tab target; worker targets answer commands only.' };

    let tabId: number | undefined;
    if (!targetId) {
      const requestedTabId = input?.tabId;
      if (
        'number' !== typeof requestedTabId ||
        !Number.isSafeInteger(requestedTabId) ||
        requestedTabId <= 0
      )
        return { error: 'A tab ID is required (or pass targetId for a worker/service-worker).' };

      let url: string | undefined;
      try {
        tabId = await context.resolveTabId(requestedTabId);
        url = (await chrome.tabs.get(tabId)).url;
      } catch (error) {
        return { error: `Could not resolve the target tab: ${errorMessage(error)}` };
      }

      if (url) {
        const permission = await context.permissionManager.checkPermission(url, context.toolUseId);
        if (!permission.allowed) {
          if (!permission.needsPrompt) return { error: 'Permission denied for this tab.' };
          const { PermissionTools } = await import('../domainPermissions');
          return {
            type: 'permission_required',
            tool: PermissionTools.READ_PAGE_CONTENT,
            url,
            toolUseId: context.toolUseId
          };
        }
      }
    }

    const send: Send = targetId
      ? (method, params) => cdp.sendCdpTargetCommand(targetId, method, params)
      : (method, params) => cdpDebugger.sendCommand(tabId as number, method, params);

    try {
      if ('status' === action) {
        if (undefined === tabId) return { error: '"status" needs a tab target.' };
        const report = cdp.buildCdpSessionReport(tabId, {
          attached: await cdpDebugger.isDebuggerAttached(tabId),
          events: cdp.cdpEventBufferStats(tabId),
          network: {
            tracking: cdpDebugger.isNetworkTrackingEnabled(tabId),
            requests: cdpDebugger.getNetworkRequests(tabId).length
          }
        });
        report.attachedTargets = cdp.getAttachedCdpTargets();
        return { output: serialize(report, maxResultChars) };
      }

      if ('events' === action) {
        if (undefined === tabId) return { error: '"events" needs a tab target.' };
        enableCdpEventCapture(tabId);
        const drained = await drainCdpEvents(tabId, {
          cursor: Number.isSafeInteger(input.cursor) ? input.cursor : 0,
          pattern: input.pattern,
          limit: input.limit,
          waitMs: clampMs(input.waitMs, 0, MAX_WAIT_MS),
          clear: input.clear === true
        });
        return {
          output: serialize(
            {
              cursor: drained.cursor,
              events: drained.events,
              ...(drained.dropped > 0 && { dropped: drained.dropped })
            },
            maxResultChars
          )
        };
      }

      // From the first command on, keep a bounded raw event feed so a later
      // "events" read or a waitFor step can see pauses, WebSocket frames, etc.
      if (undefined !== tabId) enableCdpEventCapture(tabId);

      if ('batch' === action) {
        const steps = parseScript(input.commands);
        const cursorRef = { seq: undefined !== tabId ? cdp.currentCdpEventCursor(tabId) : 0 };
        const results: ScriptEntry[] = [];
        const stopOnError = input.continueOnError !== true;

        for (const step of steps) {
          if (undefined !== step.sleepMs) {
            await new Promise((resolve) => setTimeout(resolve, step.sleepMs));
            results.push({ ok: true, result: { sleptMs: step.sleepMs } });
            continue;
          }

          if (undefined !== step.waitFor) {
            if (undefined === tabId) {
              results.push({ ok: false, error: '"waitFor" needs a tab target.' });
              if (stopOnError) break;
              continue;
            }
            const patterns = Array.isArray(step.waitFor) ? step.waitFor : [step.waitFor];
            const event = await waitForEvent(
              tabId,
              cursorRef,
              patterns,
              clampMs(step.timeoutMs, DEFAULT_WAIT_MS, MAX_WAIT_MS)
            );
            if (event) {
              results.push({ ok: true, event });
            } else {
              results.push({ ok: false, error: `timed out waiting for ${patterns.join(' | ')}` });
              if (stopOnError) break;
            }
            continue;
          }

          try {
            const params = resolveReferences(parseParams(step.params), results) as
              | Record<string, unknown>
              | undefined;
            const result = await send(step.method ?? '', params);
            results.push({ ok: true, result: result ?? null });
          } catch (error) {
            results.push({ ok: false, error: errorMessage(error) });
            if (stopOnError) break;
          }
        }
        return { output: serialize(results, maxResultChars) };
      }

      const method = 'string' === typeof input.method ? input.method.trim() : '';
      if (!method) return { error: 'Provide a CDP method such as "Runtime.evaluate".' };
      const result = await send(method, parseParams(input.params));
      return { output: serialize(result ?? null, maxResultChars) };
    } catch (error) {
      return { error: `CDP ${action} failed: ${errorMessage(error)}` };
    }
  },
  toProviderSchema: () => ({
    name: NAME,
    description: DESCRIPTION,
    input_schema: {
      type: 'object',
      properties: PARAMETERS,
      required: []
    }
  })
};
