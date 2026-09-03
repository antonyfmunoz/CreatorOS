import { afterEach, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { CUT_NATIVE_BROWSER_CLOSE_GRACE_MS, closeCutNativeBrowser, createCutBrowserShutdown, cutNativeBrowserEnvironment, launchOwnedCutNativeBrowser } from "../server/cut-native-browser-owner";

const runtime = vi.hoisted(() => ({ launchServer: vi.fn(), connect: vi.fn() }));
vi.mock("playwright-core", () => ({ chromium: runtime }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe("owned native browser cleanup", () => {
  it("closes a healthy owner once and cancels the fallback timer", async () => {
    vi.useFakeTimers();
    const owner = { close: vi.fn(async () => undefined), kill: vi.fn(async () => undefined) };
    const close = createCutBrowserShutdown(owner);
    await Promise.all([close(), close()]);
    await vi.advanceTimersByTimeAsync(CUT_NATIVE_BROWSER_CLOSE_GRACE_MS * 2);
    expect(owner.close).toHaveBeenCalledOnce(); expect(owner.kill).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("kills only its owned browser after grace and waits for actual reaping", async () => {
    vi.useFakeTimers(); let reap!: () => void; let finishGracefully!: () => void;
    const owner = { close: vi.fn(() => new Promise<void>((resolve) => { finishGracefully = resolve; })), kill: vi.fn(() => new Promise<void>((resolve) => { reap = resolve; })) };
    const unrelated = { close: vi.fn(), kill: vi.fn() };
    const close = createCutBrowserShutdown(owner); let done = false;
    const closing = close().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(CUT_NATIVE_BROWSER_CLOSE_GRACE_MS - 1); expect(owner.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(owner.kill).toHaveBeenCalledOnce(); expect(done).toBe(false);
    expect(unrelated.kill).not.toHaveBeenCalled(); expect(unrelated.close).not.toHaveBeenCalled();
    reap(); finishGracefully(); await closing; await close();
    expect(done).toBe(true); expect(owner.kill).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("forces cleanup on graceful rejection and surfaces a failed kill", async () => {
    const failure = new Error("cannot reap owned browser");
    const owner = { close: vi.fn(async () => { throw new Error("close failed"); }), kill: vi.fn(async () => { throw failure; }) };
    const close = createCutBrowserShutdown(owner);
    await expect(close()).rejects.toBe(failure); await expect(close()).rejects.toBe(failure);
    expect(owner.close).toHaveBeenCalledOnce(); expect(owner.kill).toHaveBeenCalledOnce();
  });
  it("handles a late graceful rejection after forced cleanup", async () => {
    vi.useFakeTimers(); let fail!: (error: Error) => void;
    const owner = { close: vi.fn(() => new Promise<void>((_resolve, reject) => { fail = reject; })), kill: vi.fn(async () => undefined) };
    const closing = createCutBrowserShutdown(owner)();
    await vi.advanceTimersByTimeAsync(CUT_NATIVE_BROWSER_CLOSE_GRACE_MS); await closing;
    fail(new Error("late transport close")); await Promise.resolve(); expect(vi.getTimerCount()).toBe(0);
  });
  it("never inherits provider credentials or runtime injection options", () => {
    expect(cutNativeBrowserEnvironment({ PATH: "/usr/bin", TEMP: "/tmp", SystemRoot: "C:\\Windows", CLERK_SECRET_KEY: "secret", STRIPE_SECRET_KEY: "secret", DATABASE_URL: "secret", GOOGLE_APPLICATION_CREDENTIALS: "/private", NODE_OPTIONS: "--require malicious", LD_PRELOAD: "/private", CUT_ANIMATION_CHROMIUM_PATH: "/configured" })).toEqual({ PATH: "/usr/bin", SystemRoot: "C:\\Windows", TEMP: "/tmp" });
  });
  it("binds an unguessable local endpoint and closes through the process owner", async () => {
    const browser = { close: vi.fn() } as unknown as Browser;
    const owner = { wsEndpoint: () => "ws://127.0.0.1:43123/private", close: vi.fn(async () => undefined), kill: vi.fn(async () => undefined) };
    runtime.launchServer.mockResolvedValue(owner); runtime.connect.mockResolvedValue(browser);
    const first = await launchOwnedCutNativeBrowser({ executablePath: "/chromium", host: "0.0.0.0", port: 9000, wsPath: "public", env: { STRIPE_SECRET_KEY: "secret" } });
    await closeCutNativeBrowser(first); await closeCutNativeBrowser(first);
    const settings = runtime.launchServer.mock.calls[0][0];
    expect(settings).toMatchObject({ executablePath: "/chromium", host: "127.0.0.1", port: 0 });
    expect(settings.wsPath).toMatch(/^[a-f0-9]{64}$/); expect(settings.env).not.toHaveProperty("STRIPE_SECRET_KEY");
    expect(runtime.connect).toHaveBeenCalledWith(owner.wsEndpoint(), { timeout: 10_000 });
    expect(owner.close).toHaveBeenCalledOnce(); expect(browser.close).not.toHaveBeenCalled();
    await launchOwnedCutNativeBrowser({ executablePath: "/chromium" });
    expect(runtime.launchServer.mock.calls[1][0].wsPath).not.toBe(settings.wsPath);
  });
  it("reaps a launched owner if the private connection fails", async () => {
    const failure = new Error("connect failed ws://127.0.0.1:43123/private-control-token");
    const owner = { wsEndpoint: () => "ws://127.0.0.1:43123/private", close: vi.fn(async () => undefined), kill: vi.fn(async () => undefined) };
    runtime.launchServer.mockResolvedValue(owner); runtime.connect.mockRejectedValue(failure);
    await expect(launchOwnedCutNativeBrowser({ executablePath: "/chromium" })).rejects.toThrow("Native renderer control connection failed");
    expect(owner.close).toHaveBeenCalledOnce();
  });
});
