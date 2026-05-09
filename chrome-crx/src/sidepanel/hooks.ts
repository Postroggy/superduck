import { useRef, useEffect, useCallback } from "react";
import { getTabEventManager } from "../mcpRuntime";

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
  unsubscribe: (subscriptionId) => getTabEventManager().unsubscribe(subscriptionId),
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
  properties: string[] = ["url", "status"],
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
