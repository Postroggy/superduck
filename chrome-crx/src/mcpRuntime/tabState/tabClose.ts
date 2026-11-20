import { DEFAULT_BROWSER_SESSION_ID, resolveBrowserSessionScope } from '../sessionScope';
import { collectSessionLeases } from './sessionLeaseContext';

export interface CloseSessionTabsResult {
  closedTabIds: number[];
  skippedTabIds: number[];
}

export async function closeSessionTabs(
  sessionId: string | undefined,
  tabIds: number[]
): Promise<CloseSessionTabsResult> {
  const requested = [...new Set(tabIds)];
  if (requested.length === 0) throw new Error('no tab IDs given');

  const scope = resolveBrowserSessionScope({ sessionId }) ?? {
    sessionId: DEFAULT_BROWSER_SESSION_ID
  };
  const leases = await collectSessionLeases(scope.sessionId);
  const owned = new Set(leases.map((lease) => lease.tabId));

  const closedTabIds = requested.filter((tabId) => owned.has(tabId));
  const skippedTabIds = requested.filter((tabId) => !owned.has(tabId));
  if (closedTabIds.length === 0) {
    throw new Error(
      `none of these tabs belong to session ${scope.sessionId}: ${skippedTabIds.join(', ')}`
    );
  }
  if (typeof chrome.tabs.remove !== 'function') {
    throw new Error('chrome.tabs.remove is unavailable');
  }

  await chrome.tabs.remove(closedTabIds);
  return { closedTabIds, skippedTabIds };
}
