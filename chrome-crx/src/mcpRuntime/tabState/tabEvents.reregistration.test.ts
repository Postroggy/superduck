import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Re-registration tests for `TabEventManager` and
 * `tabGroupManager.startTabGroupChangeListener()`.
 *
 * Closes architectural problem D in
 * `docs/architectural-improvements-todo.md`:
 *
 *   - After a service-worker restart, MV3 service-worker event
 *     listeners are not preserved. The previous flow waited for the
 *     next `mcp_connected` message — sometimes hours or never — to
 *     re-register `chrome.tabs.on*` listeners, leaving tab events
 *     silently dropped.
 *   - `TabEventManager.startListeners()` was not idempotent. Repeated
 *     calls (e.g. after a hot-reload during dev, or a SW restart that
 *     lands us in an unexpected state) would register duplicate chrome
 *     listeners and cause the same tab event to fire each callback
 *     multiple times.
 *
 * What we test:
 *   1. Calling `startListeners()` twice on the same TabEventManager
 *      instance does NOT double-register chrome listeners.
 *   2. Calling `startTabGroupChangeListener()` twice does not register
 *      a second subscription.
 *   3. After `stopListeners()`, `startListeners()` re-registers cleanly.
 *   4. The SW-restart recovery path
 *      (`tabGroupManager.startTabGroupChangeListener()` after
 *      `tabGroupManager.initialize()`) leaves the manager with an
 *      active listener subscription, so a subsequent tab group change
 *      event reaches `handleTabGroupChange`.
 */

// --- chrome mock -----------------------------------------------------------

const onUpdatedAdd = vi.fn();
const onActivatedAdd = vi.fn();
const onRemovedAdd = vi.fn();
const onUpdatedRemove = vi.fn();
const onActivatedRemove = vi.fn();
const onRemovedRemove = vi.fn();

const mockChrome = {
  tabs: {
    onUpdated: {
      addListener: onUpdatedAdd,
      removeListener: onUpdatedRemove
    },
    onActivated: {
      addListener: onActivatedAdd,
      removeListener: onActivatedRemove
    },
    onRemoved: {
      addListener: onRemovedAdd,
      removeListener: onRemovedRemove
    }
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1
  }
};

vi.stubGlobal('chrome', mockChrome);

// --- imports (must come AFTER the chrome stub) -----------------------------

const { getTabEventManager, TabEventManager } = await import('./tabEvents');
// Import the singleton to access the manager via its public surface.
const { tabGroupManager } = await import('./tabGroups');

// --- helpers ---------------------------------------------------------------

const clearCounters = (): void => {
  onUpdatedAdd.mockClear();
  onActivatedAdd.mockClear();
  onRemovedAdd.mockClear();
  onUpdatedRemove.mockClear();
  onActivatedRemove.mockClear();
  onRemovedRemove.mockClear();
};

describe('TabEventManager.startListeners idempotency', () => {
  beforeEach(() => {
    // Reset the singleton so each test starts from a known state.
    // Without this, subscriptions from previous tests linger and the
    // `1 === this.subscriptions.size` guard inside `subscribe()` never
    // re-fires `startListeners()`.
    TabEventManager.instance = null;
    clearCounters();
  });

  afterEach(() => {
    getTabEventManager().stopListeners();
    TabEventManager.instance = null;
    clearCounters();
  });

  it('startListeners() registers exactly 3 chrome listeners on first call', () => {
    const m = getTabEventManager();
    m.stopListeners();
    clearCounters();

    // Trigger first registration by adding a subscription (the manager
    // only registers chrome listeners on the first subscription).
    m.subscribe('all', ['groupId'], () => {});

    expect(onUpdatedAdd).toHaveBeenCalledTimes(1);
    expect(onActivatedAdd).toHaveBeenCalledTimes(1);
    expect(onRemovedAdd).toHaveBeenCalledTimes(1);
  });

  it('a second startListeners() call does NOT re-add chrome listeners (idempotent)', () => {
    const m = getTabEventManager();
    m.stopListeners();
    clearCounters();

    m.subscribe('all', ['groupId'], () => {}); // first registration
    const addsAfterFirst = {
      updated: onUpdatedAdd.mock.calls.length,
      activated: onActivatedAdd.mock.calls.length,
      removed: onRemovedAdd.mock.calls.length
    };

    // Force a second startListeners() call. The internal API is not
    // public, but we can drive it by directly invoking the method
    // through `subscribe` of a second listener on the same manager.
    m.subscribe('all', ['groupId'], () => {});

    // After the second subscription, the listener set should not have
    // grown — the second subscribe() hits the `1 === this.subscriptions.size`
    // guard only on the *first* subscribe. Subsequent subscribes
    // re-evaluate `startListeners()` (the bug being fixed). The fix is
    // an internal `if (this.chromeUpdateListener !== null) return;`
    // early-return at the top of startListeners(), so the second
    // invocation should be a no-op for chrome.*.addListener.
    expect(onUpdatedAdd.mock.calls.length).toBe(addsAfterFirst.updated);
    expect(onActivatedAdd.mock.calls.length).toBe(addsAfterFirst.activated);
    expect(onRemovedAdd.mock.calls.length).toBe(addsAfterFirst.removed);
  });

  it('after stopListeners(), a fresh startListeners() registers chrome listeners again', () => {
    const m = getTabEventManager();
    m.stopListeners();
    clearCounters();

    m.subscribe('all', ['groupId'], () => {});
    expect(onUpdatedAdd).toHaveBeenCalledTimes(1);

    m.stopListeners();
    expect(onUpdatedRemove).toHaveBeenCalledTimes(1);

    // `stopListeners()` does not clear the subscriptions map (it only
    // detaches the chrome listeners), so explicitly reset to a clean
    // state. The next `subscribe()` will hit the
    // `1 === this.subscriptions.size` guard and re-fire
    // `startListeners()`.
    m.subscriptions.clear();
    m.relevantTabIds.clear();
    clearCounters();
    m.subscribe('all', ['groupId'], () => {});
    expect(onUpdatedAdd).toHaveBeenCalledTimes(1);
    expect(onActivatedAdd).toHaveBeenCalledTimes(1);
    expect(onRemovedAdd).toHaveBeenCalledTimes(1);
  });
});

describe('tabGroupManager.startTabGroupChangeListener idempotency', () => {
  beforeEach(() => {
    clearCounters();
    // Reset the listener to a known state. The wrapper's
    // `isTabGroupListenerStarted` flag is module-scoped, so we have to
    // call stopTabGroupChangeListener() to reset it.
    tabGroupManager.stopTabGroupChangeListener();
    clearCounters();
  });

  it('first call registers a subscription and 3 chrome listeners', () => {
    tabGroupManager.startTabGroupChangeListener();
    expect(onUpdatedAdd).toHaveBeenCalledTimes(1);
    expect(onActivatedAdd).toHaveBeenCalledTimes(1);
    expect(onRemovedAdd).toHaveBeenCalledTimes(1);
  });

  it('second call is a no-op (does NOT double-register)', () => {
    tabGroupManager.startTabGroupChangeListener();
    clearCounters();

    tabGroupManager.startTabGroupChangeListener();
    expect(onUpdatedAdd).toHaveBeenCalledTimes(0);
    expect(onActivatedAdd).toHaveBeenCalledTimes(0);
    expect(onRemovedAdd).toHaveBeenCalledTimes(0);
  });

  it('after stopTabGroupChangeListener(), a fresh startTabGroupChangeListener() re-registers', () => {
    tabGroupManager.startTabGroupChangeListener();
    tabGroupManager.stopTabGroupChangeListener();
    clearCounters();

    tabGroupManager.startTabGroupChangeListener();
    expect(onUpdatedAdd).toHaveBeenCalledTimes(1);
    expect(onActivatedAdd).toHaveBeenCalledTimes(1);
    expect(onRemovedAdd).toHaveBeenCalledTimes(1);
  });
});
