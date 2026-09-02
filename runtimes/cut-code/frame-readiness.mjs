// Browser-local coordination, not a security boundary. The independent host
// deadline, process isolation and byte/resource limits always remain in force.
export function createFrameReadiness({ now = () => performance.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const pending = new Map();
  const released = new WeakSet();
  let failure = null;
  let revision = 0;
  function assertHealthy() {
    if (failure) throw failure;
    if ([...pending.values()].some((deadline) => now() >= deadline)) {
      failure = new Error('Composition frame preparation timed out.');
      pending.clear();
      throw failure;
    }
  }
  return {
    hold({ timeoutMs = 10_000 } = {}) {
      assertHealthy();
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('Frame preparation timeout must be 1..30000 ms.');
      if (pending.size >= 64) throw new Error('Too many pending frame preparations.');
      const handle = Object.freeze({});
      pending.set(handle, now() + timeoutMs);
      revision++;
      return handle;
    },
    release(handle) {
      assertHealthy();
      if (released.has(handle)) return;
      if (!pending.delete(handle)) throw new Error('Unknown frame preparation handle.');
      released.add(handle);
      revision++;
    },
    fail() {
      // Never transport authored error strings or source data into host logs.
      failure ??= new Error('Composition preparation was cancelled.');
      pending.clear();
      revision++;
    },
    async wait(flush = () => {}) {
      for (;;) {
        assertHealthy();
        flush();
        assertHealthy();
        if (!pending.size) return revision;
        await sleep(10);
      }
    },
  };
}

export const frameReadiness = createFrameReadiness();
