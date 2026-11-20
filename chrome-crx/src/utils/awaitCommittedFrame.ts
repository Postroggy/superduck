export const FRAME_WAIT_TIMEOUT_MS = 400;

export async function awaitCommittedFrame(
  tabId: number,
  timeoutMs = FRAME_WAIT_TIMEOUT_MS
): Promise<void> {
  const painted = chrome.scripting
    .executeScript({
      target: { tabId },
      func: () =>
        new Promise<void>((resolve) => {
          if (document.visibilityState !== 'visible') {
            resolve();
            return;
          }
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    })
    .then(() => undefined)
    .catch(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([painted, timeout]);
}
