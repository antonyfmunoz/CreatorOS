import { describe, expect, it, vi } from "vitest";
import { prepareCutInputs } from "../server/cut-input-preparation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("native private-input preparation", () => {
  it("bounds concurrency, prepares each input once and preserves its original position", async () => {
    const pending = Array.from({ length: 5 }, () => deferred<string>());
    const started: number[] = [];
    let active = 0, peak = 0;
    const result = prepareCutInputs([0, 1, 2, 3, 4], async (item, index) => {
      expect(item).toBe(index);
      started.push(index); active++; peak = Math.max(peak, active);
      try { return await pending[index].promise; } finally { active--; }
    });
    expect(started).toEqual([0, 1]);
    pending[1].resolve("one");
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    pending[2].resolve("two");
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));
    pending[0].resolve("zero");
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4]));
    pending[4].resolve("four"); pending[3].resolve("three");
    expect(await result).toEqual(["zero", "one", "two", "three", "four"]);
    expect(peak).toBe(2); expect(active).toBe(0);
  });

  it("stops admitting after failure and drains active writes before the caller cleans up", async () => {
    const pending = [deferred<string>(), deferred<string>()];
    const failure = new Error("synthetic private source failure");
    const events: string[] = [];
    const prepare = vi.fn(async (_item: number, index: number) => {
      try { return await pending[index].promise; } finally { events.push(`finished-${index}`); }
    });
    const result = prepareCutInputs([0, 1, 2, 3], prepare);
    // Attach a rejection handler before releasing either pending operation.
    const observed = result.then(() => { throw new Error("Expected failure"); }, error => { events.push("caller-cleanup"); return error; });
    pending[0].reject(failure);
    await vi.waitFor(() => expect(events).toEqual(["finished-0"]));
    expect(prepare).toHaveBeenCalledTimes(2);
    pending[1].reject(new Error("later failure"));
    expect(await observed).toBe(failure);
    expect(events).toEqual(["finished-0", "finished-1", "caller-cleanup"]);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("does not prepare anything after a pre-existing cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    const prepare = vi.fn(async () => "unused");
    await expect(prepareCutInputs([1, 2], prepare, controller.signal)).rejects.toThrow(/cancelled/);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("drains active work on cancellation, does not admit later sources and removes its listener", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = [deferred<string>(), deferred<string>()];
    const prepare = vi.fn((_item: number, index: number) => pending[index].promise);
    let settled = false;
    const observed = prepareCutInputs([0, 1, 2], prepare, controller.signal).catch(error => { settled = true; return error; });
    controller.abort();
    pending[0].resolve("zero");
    await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false); expect(prepare).toHaveBeenCalledTimes(2);
    pending[1].resolve("one");
    expect(await observed).toBeInstanceOf(Error);
    expect(settled).toBe(true); expect(prepare).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("handles an empty list, a synchronous throw and an undefined rejection", async () => {
    const unused = vi.fn(async () => "unused");
    expect(await prepareCutInputs([], unused)).toEqual([]);
    expect(unused).not.toHaveBeenCalled();
    const failure = new Error("sync");
    const prepare = vi.fn((): Promise<string> => { throw failure; });
    await expect(prepareCutInputs([0, 1, 2], prepare)).rejects.toBe(failure);
    expect(prepare).toHaveBeenCalledTimes(1);
    const rejected = prepareCutInputs([0], async () => { throw undefined; });
    await expect(rejected).rejects.toBeUndefined();
  });
});
