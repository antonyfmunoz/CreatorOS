import type { BrowserContext } from "playwright-core";

export const CUT_NATIVE_CONTEXT_CLOSE_GRACE_MS = 5_000;

/** A stuck layer must not prevent its job owner from reaping the browser. */
export async function closeCutNativeContext(
  context: Pick<BrowserContext, "close"> | undefined,
  closeOwner: () => Promise<void>,
) {
  if (!context) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Handle rejection even if timeout wins; the eventual transport response is
  // not permission to reuse a browser whose context cleanup already failed.
  const graceful = Promise.resolve().then(() => context.close()).then(() => true, () => false);
  try {
    const completed = await Promise.race([
      graceful,
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), CUT_NATIVE_CONTEXT_CLOSE_GRACE_MS); }),
    ]);
    if (completed) return;
    await closeOwner();
    throw new Error("Native renderer context cleanup failed");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
