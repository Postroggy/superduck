import { test, expect } from "../fixtures/extension";
import { seedStorage, getDefaultProviderConfig } from "../fixtures/storage";
import { openSidepanel } from "../helpers/sidepanel";

/**
 * Regression for: "SidepanelApp rendered 100/200 times" infinite render.
 *
 * Root cause was an inline `['groupId', 'url', 'status']` array passed to
 * `useTabEvent`. The internal `useEffect` lists `properties` as a
 * dependency, so a new array reference on every render re-ran
 * subscribe/unsubscribe, the unsubscribe's callback then re-fired
 * `refreshSecondaryState` / `refreshBlockedState`, which called
 * `setState` via `useActiveTabId`, forming a render loop.
 *
 * Fix: hoist the array to a module-level constant so the reference is
 * stable. See: fix(sidepanel): hoist useTabEvent's properties array to
 * module scope (commit e2b52de).
 *
 * The sidepanel logs a `[PERF] SidepanelApp rendered N times` warning
 * every 100 renders, so 1+ such warnings = regression.
 */
test.describe("Regressions for fix(sidepanel) hoist useTabEvent properties", () => {
  test("Sidepanel does not enter infinite render loop on open + tab switch", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    // 1) open a real tab so the sidepanel has an active tab to bind to
    const targetPage = await context.newPage();
    await targetPage.goto("https://example.com");
    await targetPage.bringToFront();

    // 2) open sidepanel — subscribe to its console BEFORE the React tree
    //    has a chance to render, so we don't miss the first [PERF] burst.
    const sidepanel = await openSidepanel(context, extensionId);

    const perfWarnings: string[] = [];
    sidepanel.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[PERF] SidepanelApp rendered")) {
        perfWarnings.push(text);
      }
    });

    // 3) Let the initial render settle, then exercise the code paths that
    //    used to trigger the loop:
    //      - useActiveTabId's mount-time setState from chrome.tabs.query
    //      - useTabEvent's subscribe/unsubscribe on every render
    //    We simulate the latter by switching the active tab a few times,
    //    which causes useActiveTabId to fire onActivated → setState.
    await sidepanel.waitForLoadState("domcontentloaded");
    await sidepanel.waitForSelector("#root");

    const otherPage = await context.newPage();
    await otherPage.goto("https://example.org");
    await otherPage.bringToFront();
    await sidepanel.bringToFront();
    await targetPage.bringToFront();
    await sidepanel.bringToFront();

    // Give the render loop plenty of time to explode if it's going to.
    await sidepanel.waitForTimeout(3000);

    expect(
      perfWarnings,
      `Infinite render regression: saw [PERF] warnings: ${perfWarnings.join("\n")}`
    ).toHaveLength(0);

    await sidepanel.close();
    await otherPage.close();
    await targetPage.close();
  });
});
