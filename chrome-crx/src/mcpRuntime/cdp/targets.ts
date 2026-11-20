import type { CdpTargetSummary } from './types';

// chrome.debugger can attach to more than a tab: workers and service workers
// have their own targetId. Some apps open their sockets or do their crypto in
// those contexts, so exposing them is what makes the debugger surface complete.

function toSummary(target: chrome.debugger.TargetInfo): CdpTargetSummary {
  return {
    targetId: target.id,
    type: target.type,
    title: target.title || undefined,
    url: target.url || undefined,
    attached: target.attached === true
  };
}

export async function listCdpTargets(): Promise<CdpTargetSummary[]> {
  const targets = await chrome.debugger.getTargets();
  return targets.map(toSummary);
}

function initializeAttachedTargets(): void {
  if (!globalThis.__cdpAttachedTargets) {
    globalThis.__cdpAttachedTargets = new Set<string>();
  }
}

initializeAttachedTargets();

function attachedTargets(): Set<string> {
  return globalThis.__cdpAttachedTargets as Set<string>;
}

export function getAttachedCdpTargets(): string[] {
  return [...attachedTargets()];
}

export async function attachCdpTarget(targetId: string): Promise<void> {
  if (attachedTargets().has(targetId)) return;
  await chrome.debugger.attach({ targetId }, '1.3');
  attachedTargets().add(targetId);
}

export async function detachCdpTarget(targetId: string): Promise<void> {
  if (!attachedTargets().has(targetId)) return;
  try {
    await chrome.debugger.detach({ targetId });
  } finally {
    attachedTargets().delete(targetId);
  }
}

export function noteCdpTargetDetached(targetId: string): void {
  attachedTargets().delete(targetId);
}

function sendCommandOnce(
  targetId: string,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ targetId }, method, params, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
  });
}

export async function sendCdpTargetCommand(
  targetId: string,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  await attachCdpTarget(targetId);
  try {
    return await sendCommandOnce(targetId, method, params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A worker can be recycled between calls; re-attach once before giving up.
    if (!message.toLowerCase().includes('not attached')) throw error;
    attachedTargets().delete(targetId);
    await attachCdpTarget(targetId);
    return sendCommandOnce(targetId, method, params);
  }
}
