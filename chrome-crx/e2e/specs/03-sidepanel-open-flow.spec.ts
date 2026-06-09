import { test, expect } from "../fixtures/extension";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { seedStorage, getDefaultProviderConfig } from "../fixtures/storage";
import { openSidepanel } from "../helpers/sidepanel";

/**
 * Regression for: "chrome.sidePanel.open() may only be called in response
 * to a user gesture" (Ctrl+E in Edge).
 *
 * Root cause: `await chrome.sidePanel.open({...})` in openSidePanel
 * (src/background/sidePanel.ts) broke the user gesture chain on the
 * `chrome.commands.onCommand` path. Chrome 127+ rejects open() when the
 * call is not in the synchronous chain of the gesture.
 *
 * Fix: make open() fire-and-forget — do NOT await, but still await the
 * downstream tabGroupManager calls (which don't need a gesture).
 * See: fix(crx): make sidePanel.open() fire-and-forget to preserve user
 * gesture (commit 3efa0c8).
 *
 * Notes on what's automatable in Playwright:
 *
 *   Triggering `chrome.commands.onCommand` from Playwright is brittle —
 *   `page.keyboard.press("Control+E")` is a page-level keyboard event
 *   and isn't reliably delivered to Chrome's commands system. So we
 *   don't try to fire Ctrl+E itself; instead we verify the fix's two
 *   observable properties:
 *
 *     (a) sidePanel.open() is fire-and-forget: the open() call is NOT
 *         preceded by any `await` that would break the user gesture
 *         chain. We assert this by reading the compiled bundle and
 *         confirming the open() call is never preceded by `await`.
 *         This is a static guard, but it directly prevents the bug
 *         from being re-introduced.
 *
 *     (b) the open() path still completes end-to-end: sidepanel
 *         loads and PANEL_READY → tabGroupManager.createGroup runs
 *         to completion (i.e., the active tab is in a SuperDuck
 *         group). This proves the fire-and-forget change didn't
 *         break the happy path.
 *
 *   The Ctrl+E-specific user-gesture scenario must be verified by
 *   manual smoke in Edge. See PR description for the test recipe.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findServiceWorkerBundle(): string {
  // The bundle is hashed; the loader imports it by a relative path that
  // ends in `service-worker-loader.js-<hash>.js`.
  const assetsDir = path.resolve(__dirname, "../../dist/assets");
  const entries = fs.readdirSync(assetsDir);
  const match = entries.find(
    (name) => /^service-worker-loader\.js-[A-Za-z0-9_-]+\.js$/.test(name)
  );
  if (!match) {
    throw new Error(
      `Could not find service-worker bundle in ${assetsDir}. ` +
        `Did you run "bun run build"?`
    );
  }
  return path.join(assetsDir, match);
}

test.describe("Regressions for fix(crx) make sidePanel.open() fire-and-forget", () => {
  test("chrome.sidePanel.open() is never awaited in the dist bundle", () => {
    const bundle = findServiceWorkerBundle();
    const src = fs.readFileSync(bundle, "utf8");

    // The bug was `await chrome.sidePanel.open(`. We forbid that exact
    // pattern. `chrome.sidePanel.open({...}).catch(...)` (no await) is
    // the fire-and-forget shape the fix mandates.
    const awaitingOpen =
      /await\s*chrome\.sidePanel\.open\s*\(|\bawait\s*\(\s*chrome\.sidePanel\.open/;
    expect(
      awaitingOpen.test(src),
      "Regression: chrome.sidePanel.open() is awaited in the dist bundle. " +
        "Awaiting breaks the user-gesture chain and re-introduces the " +
        "'may only be called in response to a user gesture' bug on " +
        "the Ctrl+E / chrome.commands.onCommand path."
    ).toBe(false);
  });

  test("openSidePanel end-to-end still works: sidepanel loads and PANEL_READY creates a group", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    // 1) Open a real tab so the sidepanel has an active tab to bind to.
    const targetPage = await context.newPage();
    await targetPage.goto("https://example.com");
    await targetPage.bringToFront();

    // 2) Open the sidepanel via the helper (this is the same code path
    //    both the toolbar icon click and Ctrl+E eventually reach, minus
    //    the user-gesture chain that we cover in the static guard above).
    const sidepanel = await openSidepanel(context, extensionId);
    await expect(sidepanel.locator("#root")).toBeVisible();

    // 3) Wait for PANEL_READY → tabGroupManager.createGroup to commit
    //    storage. After it returns, the active tab is tracked under
    //    `tabGroups` with itself as the main tab.
    await expect
      .poll(
        async () => {
          return serviceWorker.evaluate(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stored = await (globalThis as any).chrome.storage.local.get(
              "tabGroups"
            );
            return stored.tabGroups ?? null;
          });
        },
        { timeout: 5000, intervals: [200, 500, 1000] }
      )
      .not.toBeNull();

    const tabGroups = await serviceWorker.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stored = await (globalThis as any).chrome.storage.local.get("tabGroups");
      return stored.tabGroups ?? null;
    });

    expect(tabGroups, "tabGroups storage should be populated after openSidePanel").toBeTruthy();
    const keys = Object.keys(tabGroups);
    expect(keys.length, "at least one SuperDuck group should be tracked").toBeGreaterThan(0);

    await sidepanel.close();
    await targetPage.close();
  });
});
