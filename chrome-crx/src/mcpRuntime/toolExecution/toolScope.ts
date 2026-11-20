// Not every tool needs a page. A CDP target listing, or a command aimed at a
// worker/service-worker targetId, is browser-scoped: there is no tab to resolve.
const BROWSER_SCOPED_ACTIONS: Record<string, ReadonlySet<string>> = {
  superduck_cdp: new Set(['targets'])
};

export function isBrowserScopedToolCall(
  toolName: string,
  action: string | undefined,
  targetId: string | undefined
): boolean {
  if ('string' === typeof targetId && '' !== targetId.trim()) return true;
  const actions = BROWSER_SCOPED_ACTIONS[toolName];
  return undefined !== actions && undefined !== action && actions.has(action);
}
