import { afterEach, expect, it, vi } from "vitest";
import { watchCutJobLease } from "../server/cut-job-lease-watch";

afterEach(() => vi.useRealTimers());

it("aborts remote cancellation, lost ownership and unverified database checks", async () => {
  vi.useFakeTimers();
  for (const check of [async () => false, async () => { throw new Error('database unavailable'); }]) {
    const controller = new AbortController(); const stop = watchCutJobLease(controller, check);
    await vi.advanceTimersByTimeAsync(2_000); expect(controller.signal.aborted).toBe(true);
    stop();
  }
});

it("never overlaps reads and discards an in-flight result after job disposal", async () => {
  vi.useFakeTimers();
  let resolve!: (owns: boolean) => void;
  const check = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
  const controller = new AbortController(); const stop = watchCutJobLease(controller, check);
  await vi.advanceTimersByTimeAsync(8_000); expect(check).toHaveBeenCalledTimes(1);
  stop(); resolve(false); await vi.advanceTimersByTimeAsync(4_000);
  expect(controller.signal.aborted).toBe(false); expect(check).toHaveBeenCalledTimes(1);
});

it("keeps an owned lease active and stops polling after local cancellation", async () => {
  vi.useFakeTimers();
  const check = vi.fn(async () => true);
  const controller = new AbortController(); const stop = watchCutJobLease(controller, check);
  await vi.advanceTimersByTimeAsync(4_000); expect(check).toHaveBeenCalledTimes(2);
  expect(controller.signal.aborted).toBe(false);
  controller.abort(); await vi.advanceTimersByTimeAsync(4_000); expect(check).toHaveBeenCalledTimes(2); stop();
});
