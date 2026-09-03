import { afterEach, describe, expect, it, vi } from "vitest";
import { closeCutNativeContext, CUT_NATIVE_CONTEXT_CLOSE_GRACE_MS } from "../server/cut-native-context-cleanup";

afterEach(() => vi.useRealTimers());

describe("native layer context cleanup", () => {
  it("leaves a healthy borrowed job browser usable and clears its timer", async () => {
    vi.useFakeTimers();
    const context = { close: vi.fn(async () => undefined) };
    const closeOwner = vi.fn(async () => undefined);
    await closeCutNativeContext(context, closeOwner);
    expect(context.close).toHaveBeenCalledOnce(); expect(closeOwner).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start cleanup for a layer that never acquired a context", async () => {
    const closeOwner = vi.fn(async () => undefined);
    await closeCutNativeContext(undefined, closeOwner);
    expect(closeOwner).not.toHaveBeenCalled();
  });

  it("reaps only its job owner after a stuck context and waits for reaping", async () => {
    vi.useFakeTimers(); let reap!: () => void; let rejectLate!: (error: Error) => void;
    const context = { close: vi.fn(() => new Promise<void>((_resolve, reject) => { rejectLate = reject; })) };
    const closeOwner = vi.fn(() => new Promise<void>((resolve) => { reap = resolve; }));
    const unrelated = vi.fn(); let settled = false;
    const closing = closeCutNativeContext(context, closeOwner).finally(() => { settled = true; });
    const assertion = expect(closing).rejects.toThrow("Native renderer context cleanup failed");
    await vi.advanceTimersByTimeAsync(CUT_NATIVE_CONTEXT_CLOSE_GRACE_MS - 1);
    expect(closeOwner).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(closeOwner).toHaveBeenCalledOnce(); expect(settled).toBe(false); expect(unrelated).not.toHaveBeenCalled();
    reap(); await assertion;
    rejectLate(new Error("private context details")); await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes its owner on rejected context cleanup without leaking transport details", async () => {
    const closeOwner = vi.fn(async () => undefined);
    await expect(closeCutNativeContext({ close: async () => { throw new Error("ws://private-control"); } }, closeOwner))
      .rejects.toThrow(/^Native renderer context cleanup failed$/);
    expect(closeOwner).toHaveBeenCalledOnce();
  });

  it("never swallows an owner cleanup failure", async () => {
    const failure = new Error("owned renderer not reaped");
    await expect(closeCutNativeContext({ close: async () => { throw new Error("context failed"); } }, async () => { throw failure; }))
      .rejects.toBe(failure);
  });

  it("treats a late successful context close as a failed layer, not reusable output", async () => {
    vi.useFakeTimers(); let finish!: () => void;
    const closeOwner = vi.fn(async () => undefined);
    const assertion = expect(closeCutNativeContext({ close: () => new Promise<void>((resolve) => { finish = resolve; }) }, closeOwner))
      .rejects.toThrow("Native renderer context cleanup failed");
    await vi.advanceTimersByTimeAsync(CUT_NATIVE_CONTEXT_CLOSE_GRACE_MS);
    await assertion; finish(); await Promise.resolve();
    expect(closeOwner).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
