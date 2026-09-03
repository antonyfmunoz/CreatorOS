import { describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { createCutNativeBrowserSession } from "../server/cut-native-browser-session";
import { cutPreparationProgress } from "../server/cut-preparation-progress";

describe("per-job native renderer session", () => {
  it("starts lazily, shares only its own browser and closes it once", async () => {
    const close = vi.fn(async () => undefined);
    const browser = { close } as unknown as Browser;
    const launch = vi.fn(async () => browser);
    const session = createCutNativeBrowserSession(launch);
    expect(launch).not.toHaveBeenCalled();
    expect(await Promise.all([session.browser(), session.browser()])).toEqual([browser, browser]);
    expect(launch).toHaveBeenCalledTimes(1);
    await Promise.all([session.close(), session.close()]);
    expect(close).toHaveBeenCalledTimes(1);
    await expect(session.browser()).rejects.toThrow(/closed/);
  });
  it("closes a pending launch and never returns a browser after shutdown", async () => {
    let resolve!: (browser: Browser) => void;
    const close = vi.fn(async () => undefined);
    const session = createCutNativeBrowserSession(() => new Promise((done) => { resolve = done; }));
    const pending = expect(session.browser()).rejects.toThrow(/closed/);
    const closing = session.close();
    resolve({ close } as unknown as Browser);
    await Promise.all([pending, closing]);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("does not start an unused or failed session during cleanup", async () => {
    const launch = vi.fn(async () => { throw new Error("launch failed"); });
    const unused = createCutNativeBrowserSession(launch);
    await unused.close(); expect(launch).not.toHaveBeenCalled();
    const failed = createCutNativeBrowserSession(launch);
    await expect(failed.browser()).rejects.toThrow("launch failed");
    await expect(failed.close()).resolves.toBeUndefined();
    expect(launch).toHaveBeenCalledTimes(1);
  });
  it("reports bounded numeric preparation, never artifact completion or private names", () => {
    expect(cutPreparationProgress(0, 2)).toEqual({ progress: .1, detail: "Preparing graphics · layer 1/2 · 0%" });
    expect(cutPreparationProgress(1, 2, 1).progress).toBeCloseTo(.3);
    for (const args of [[0, 0, 0], [2, 2, 0], [-1, 2, 0], [0, 501, 0], [0, 1, NaN], [0, 1, 2]]) expect(() => cutPreparationProgress(...args as [number, number, number])).toThrow();
  });
  it("does not hide a failed shutdown or permit reuse after cleanup failed", async () => {
    const failure = new Error("owned renderer could not be reaped");
    const close = vi.fn(async () => { throw failure; });
    const session = createCutNativeBrowserSession(async () => ({ close }) as unknown as Browser);
    await session.browser();
    await expect(session.close()).rejects.toBe(failure);
    await expect(session.close()).rejects.toBe(failure);
    await expect(session.browser()).rejects.toThrow(/closed/);
    expect(close).toHaveBeenCalledOnce();
  });
});
