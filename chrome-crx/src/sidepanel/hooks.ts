import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { getTabEventManager } from '../mcpRuntime';
import { normalizeApiBaseUrl, parseTabId } from './sidepanelUtils';

type TabChangeInfo = chrome.tabs.OnUpdatedInfo & {
  active?: boolean;
  removed?: boolean;
};
type Tab = chrome.tabs.Tab;

interface TabManager {
  subscribe: (
    tabId: number,
    properties: string[],
    callback: (tabId: number, changeInfo: TabChangeInfo, tab?: Tab) => void
  ) => string;
  unsubscribe: (subscriptionId: string) => void;
}

const tabManager: TabManager = {
  subscribe: (tabId, properties, callback) =>
    getTabEventManager().subscribe(tabId, properties, callback),
  unsubscribe: (subscriptionId) => getTabEventManager().unsubscribe(subscriptionId)
};

/**
 * Subscribe to tab change events for a specific tab.
 */
export function useTabEvent(
  tabId: number | undefined,
  properties: string[],
  callback: (tabId: number, changeInfo: TabChangeInfo, tab?: Tab) => void,
  deps: React.DependencyList = []
) {
  const subscriptionRef = useRef<string | null>(null);
  const stableCallback = useCallback(callback, deps);

  useEffect(() => {
    if (tabId === undefined) return;

    subscriptionRef.current = tabManager.subscribe(tabId, properties, stableCallback);

    return () => {
      if (subscriptionRef.current) {
        tabManager.unsubscribe(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [tabId, properties, stableCallback]);
}

/**
 * Subscribe to URL/status changes for a specific tab and receive updates via callback.
 */
export function useTabUrlChange(
  tabId: number | undefined,
  onUpdate: (tab: Tab) => void,
  properties: string[] = ['url', 'status'],
  deps: React.DependencyList = []
) {
  const stableOnUpdate = useCallback(
    (id: number, _changeInfo: TabChangeInfo, tab?: Tab) => {
      if (id === tabId && tab) onUpdate(tab);
    },
    [tabId, ...deps]
  );

  useTabEvent(tabId, properties, stableOnUpdate, [stableOnUpdate]);
}

/**
 * Dynamically track the currently active tab in the current window.
 * This allows the sidepanel to survive tab switches — the panel stays open
 * (window-bound, not tab-bound) and updates its target tab when the user
 * switches tabs.
 *
 * Falls back to the initialTabId from the URL query string if tabs.onActivated
 * is not available (e.g., in tests).
 */
export function useActiveTabId(initialTabId: number | undefined): number | undefined {
  const [activeTabId, setActiveTabId] = useState<number | undefined>(initialTabId);

  useEffect(() => {
    // On mount, query the currently active tab as a baseline
    void chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id != null) {
        setActiveTabId(tabs[0].id);
      }
    });

    // Listen for tab activation changes to track which tab is active
    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      setActiveTabId(info.tabId);
    };

    chrome.tabs.onActivated.addListener(onActivated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, []);

  return activeTabId;
}

export interface SidepanelQueryState {
  tabId: number | undefined;
  mode: string;
  sessionId: string;
  mcpPermissionOnly: boolean;
  requestId: string;
  skipPermissions: boolean;
  apiUrl: string;
  apiKey: string;
}

export function useQueryState(): SidepanelQueryState {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const apiUrl =
      normalizeApiBaseUrl(params.get('api_url')) || normalizeApiBaseUrl(params.get('apiUrl')) || '';
    const apiKey = (params.get('api_key') || params.get('apiKey') || '').trim();

    return {
      // Support both old "tabId" and new "initialTabId" query params
      tabId: parseTabId(params.get('initialTabId')) ?? parseTabId(params.get('tabId')),
      mode: params.get('mode') || 'sidepanel',
      sessionId: params.get('sessionId') || '',
      mcpPermissionOnly: params.get('mcpPermissionOnly') === 'true',
      requestId: params.get('requestId') || '',
      skipPermissions: params.get('skipPermissions') === 'true',
      apiUrl,
      apiKey
    };
  }, []);
}
