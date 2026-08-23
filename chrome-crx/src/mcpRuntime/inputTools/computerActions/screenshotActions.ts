import { cdpDebugger, generateUniqueId } from '../../cdp';
import type { CdpRuntimeEvaluateResult } from '../../cdp';
import type { ToolResult } from '../../pageTools';
import type { ComputerToolParams, ClickOptions } from '../types';

export async function executeScreenshot(
  tabId: number,
  options?: ClickOptions
): Promise<ToolResult> {
  try {
    const screenshotResult = await cdpDebugger.screenshot(tabId, undefined, options);
    const screenshotId = generateUniqueId();
    console.info(`[Computer Tool] Generated screenshot ID: ${screenshotId}`);
    console.info(
      `[Computer Tool] Screenshot dimensions: ${screenshotResult.width}x${screenshotResult.height}`
    );
    return {
      output: `Successfully captured screenshot (${screenshotResult.width}x${screenshotResult.height}, ${screenshotResult.format}) - ID: ${screenshotId}`,
      base64Image: screenshotResult.base64,
      imageFormat: screenshotResult.format,
      imageId: screenshotId
    };
  } catch (error) {
    return {
      error: `Error capturing screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export async function executeWait(params: ComputerToolParams): Promise<ToolResult> {
  if (!params.duration || params.duration <= 0)
    throw new Error('Duration parameter is required and must be positive');
  if (params.duration > 30) throw new Error('Duration cannot exceed 30 seconds');
  const ms = Math.round(1000 * params.duration);
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
  return { output: `Waited for ${params.duration} second${params.duration === 1 ? '' : 's'}` };
}

export interface WaitForSelectorParams {
  selector?: string;
  /** Timeout in seconds. Default 10, max 60. */
  timeout?: number;
  /** Wait until the selector is ABSENT instead of present. */
  absent?: boolean;
}

const MAX_WAIT_FOR_SELECTOR_SECONDS = 60;

// Polls the page for a selector via CDP Runtime.evaluate. Simple polling keeps
// the implementation self-contained (no content-script round trip) and is
// accurate enough for the agentic wait-for-element use case; a MutationObserver
// variant would add latency at the edges for little gain.
export async function executeWaitForSelector(
  tabId: number,
  params: WaitForSelectorParams
): Promise<ToolResult> {
  const selector = params.selector;
  if (!selector) throw new Error('selector parameter is required for wait_for_selector');
  let timeoutSec = params.timeout ?? 10;
  if (timeoutSec <= 0) timeoutSec = 10;
  if (timeoutSec > MAX_WAIT_FOR_SELECTOR_SECONDS)
    throw new Error(
      `wait_for_selector timeout cannot exceed ${MAX_WAIT_FOR_SELECTOR_SECONDS} seconds`
    );
  const absent = params.absent === true;

  const deadline = Date.now() + Math.round(1000 * timeoutSec);
  const expression = `
    (() => {
      try {
        return !!document.querySelector(${JSON.stringify(selector)});
      } catch (e) {
        return { __invalidSelector: String(e && e.message ? e.message : e) };
      }
    })()
  `;

  while (Date.now() < deadline) {
    const evalResult = await cdpDebugger.sendCommand<CdpRuntimeEvaluateResult>(
      tabId,
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true
      }
    );
    const value = evalResult?.result?.value;
    if (value && typeof value === 'object' && '__invalidSelector' in value) {
      const err = (value as { __invalidSelector: string }).__invalidSelector;
      throw new Error(`wait_for_selector: invalid selector ${JSON.stringify(selector)}: ${err}`);
    }
    const present = value === true;
    if (absent ? !present : present) {
      return {
        output: absent
          ? `Selector "${selector}" is now absent (waited ${timeoutSec}s max)`
          : `Selector "${selector}" found (waited ${timeoutSec}s max)`
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    error: `wait_for_selector: ${absent ? 'still present' : 'not found'} after ${timeoutSec}s — selector "${selector}"`
  };
}
