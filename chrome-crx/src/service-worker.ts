import { setStorageValue, StorageKeys } from "./extensionServices";
import {
  connectBridge,
  initializeExtensionPermissions,
  isAgentActive,
  setOnAgentBecameIdle,
  tabGroupManager,
  trackEvent,
} from "./mcpRuntime";
import { createExtensionUrlHandler } from "./background/extensionUrl";
import { createNativeHostManager } from "./background/nativeHost";
import { registerExternalMessageListener } from "./background/externalMessages";
import { registerRuntimeMessageListener } from "./background/runtimeMessages";
import { createScheduledTaskManager } from "./background/scheduledTasks";
import { createSidePanelController } from "./background/sidePanel";
import { createStaticIndicatorController } from "./background/staticIndicator";
import { createDownloadTracker } from "./background/downloadTracker";
import { initModelMappingListener } from "./utils/modelMapping";

const nativeHostManager = createNativeHostManager();
const sidePanelController = createSidePanelController({
  connectNativeHost: nativeHostManager.connect,
});
const scheduledTaskManager = createScheduledTaskManager();
const extensionUrlHandler = createExtensionUrlHandler({
  connectNativeHost: nativeHostManager.connect,
  disconnectNativeHost: nativeHostManager.disconnect,
});
const staticIndicatorController = createStaticIndicatorController();
const downloadTracker = createDownloadTracker({
  isAgentActive,
  sendNotification: nativeHostManager.sendMcpNotification,
});

void connectBridge();
void nativeHostManager.connect();
initModelMappingListener();

async function handleNotificationClick(notificationId: string) {
  await chrome.notifications.clear(notificationId);

  const parts = notificationId.split("_");
  let tabId: number | null = null;
  if (parts.length >= 2 && parts[1] !== "unknown") {
    tabId = parseInt(parts[1], 10);
  }

  if (tabId && !Number.isNaN(tabId)) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
        return;
      }
    } catch {
      // Tab may no longer exist.
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.windowId) {
    await chrome.windows.update(activeTab.windowId, { focused: true });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.storage.local.remove(["updateAvailable"]);

  try {
    chrome.runtime.setUninstallURL("", () => {
      // ignore chrome.runtime.lastError
    });
  } catch {
    // ignore
  }

  initializeExtensionPermissions();
  await tabGroupManager.initialize();

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void sidePanelController.openOptionsForSetup().catch(() => {});
  }

  void nativeHostManager.connect();
  await scheduledTaskManager.restoreScheduledAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  initializeExtensionPermissions();
  await tabGroupManager.initialize();
  void connectBridge();
  void nativeHostManager.connect();
  await scheduledTaskManager.restoreScheduledAlarms();
});

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.permissions?.includes("nativeMessaging")) {
    void nativeHostManager.connect();
  }
});

chrome.permissions.onRemoved.addListener((permissions) => {
  if (permissions.permissions?.includes("nativeMessaging")) {
    void nativeHostManager.disconnect();
  }
});

chrome.action.onClicked.addListener((tab) => {
  void sidePanelController.handleActionClick(tab);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void handleNotificationClick(notificationId);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-side-panel") return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
      void sidePanelController.handleActionClick(tab);
    }
  });
});

let pendingUpdateVersion: string | null = null;

function tryApplyUpdate() {
  if (!pendingUpdateVersion) return;
  if (isAgentActive()) return;
  chrome.runtime.reload();
}

setOnAgentBecameIdle(() => tryApplyUpdate());

chrome.runtime.onUpdateAvailable.addListener((details) => {
  pendingUpdateVersion = details.version;
  void setStorageValue(StorageKeys.UPDATE_AVAILABLE, true);
  void trackEvent("superduck.extension.update_available", {
    current_version: chrome.runtime.getManifest().version,
    new_version: details.version,
  });
  tryApplyUpdate();
});

registerRuntimeMessageListener({
  openSidePanel: sidePanelController.openSidePanel,
  openSidePanelRequest: sidePanelController.openSidePanelRequest,
  openOptionsWithTask: sidePanelController.openOptionsWithTask,
  getNativeHostStatus: nativeHostManager.getStatus,
  sendMcpNotification: nativeHostManager.sendMcpNotification,
  executeScheduledTask: scheduledTaskManager.executeScheduledTask,
  handleStaticIndicatorHeartbeat: staticIndicatorController.handleHeartbeat,
  handleDismissStaticIndicator: staticIndicatorController.dismissForSenderGroup,
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void tabGroupManager.handleTabClosed(tabId);
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    void extensionUrlHandler.handleExtensionUrl(details.url, details.tabId);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "native-host-heartbeat") {
    void nativeHostManager.handleHeartbeatAlarm();
    return;
  }
  void scheduledTaskManager.handleAlarm(alarm);
});

registerExternalMessageListener({
  connectNativeHost: nativeHostManager.connect,
});

chrome.downloads.onCreated.addListener((item) => {
  downloadTracker.handleDownloadCreated(item);
});

chrome.downloads.onChanged.addListener((delta) => {
  downloadTracker.handleDownloadChanged(delta);
});
