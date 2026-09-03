/** Limit private downloads/probes per native job, without reducing source count. */
const MAX_ACTIVE_PREPARATIONS = 2;

export async function prepareCutInputs<T, U>(
  items: readonly T[],
  prepare: (item: T, index: number) => Promise<U>,
  signal?: AbortSignal,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let next = 0;
  let failed = false;
  let firstFailure: unknown;
  const fail = (error: unknown) => {
    if (!failed) { failed = true; firstFailure = error; }
  };
  const abort = () => fail(new Error("Native input preparation cancelled or lease lost"));
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const consume = async () => {
      while (!failed && next < items.length) {
        // Claim synchronously before awaiting: each source is prepared once.
        const index = next++;
        try { results[index] = await prepare(items[index], index); }
        catch (error) { fail(error); }
      }
    };
    // Consumers catch the original error and stop admitting new work. Waiting
    // for every active consumer prevents the caller's finally cleanup racing
    // with downloads/probes that were already writing into its private folder.
    await Promise.all(Array.from({ length: Math.min(MAX_ACTIVE_PREPARATIONS, items.length) }, consume));
    if (failed) throw firstFailure;
    return results;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
