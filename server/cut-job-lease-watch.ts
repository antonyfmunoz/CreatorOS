/** Read-only cancellation/reassignment checks, separate from lease extension. */
export function watchCutJobLease(controller: AbortController, ownsLease: () => Promise<boolean>, intervalMs = 2_000) {
  let checking = false;
  let stopped = false;
  const tick = async () => {
    if (checking || stopped) return;
    checking = true;
    try {
      const owns = await ownsLease();
      if (!owns && !stopped) controller.abort();
    } catch {
      // Fail closed: an unverified lease cannot authorize continued compute.
      if (!stopped) controller.abort();
    } finally { checking = false; }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref();
  const stop = () => { stopped = true; clearInterval(timer); controller.signal.removeEventListener("abort", stop); };
  controller.signal.addEventListener("abort", stop, { once: true });
  if (controller.signal.aborted) stop();
  return stop;
}
