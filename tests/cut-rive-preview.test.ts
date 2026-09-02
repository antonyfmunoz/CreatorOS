import { describe, expect, it, vi } from "vitest";
import { createCutRivePreviewController } from "../client/src/lib/cut-rive-preview";

function fixture() {
  const callbacks = new Map<number, () => void>();
  const deferred: Array<() => void> = [];
  let sequence = 0;
  let seconds = 0;
  const instance = {
    animationNames: ["Main"], play: vi.fn(), pause: vi.fn(),
    resizeDrawingSurfaceToCanvas: vi.fn(), scrub: vi.fn(), drawFrame: vi.fn(),
  };
  const loaded = vi.fn();
  const failed = vi.fn();
  const controller = createCutRivePreviewController({
    instance: () => instance, seconds: () => seconds, loaded, failed,
    defer: (callback) => deferred.push(callback),
    schedule: (callback) => { callbacks.set(++sequence, callback); return sequence; },
    cancel: (id) => { callbacks.delete(id); },
  });
  const tick = () => {
    const current = [...callbacks.values()]; callbacks.clear();
    for (const callback of current) callback();
  };
  return { controller, instance, loaded, failed, callbacks, tick,
    flush: () => { for (const callback of deferred.splice(0)) callback(); },
    seekTo: (value: number) => { seconds = value; controller.seek(); },
  };
}

describe("private Rive preview lifecycle", () => {
  it("waits for runtime initialization and paints the latest sought frame before readiness", () => {
    const f = fixture();
    f.controller.load(); f.seekTo(1.25);
    expect(f.instance.play).not.toHaveBeenCalled();
    expect(f.instance.scrub).not.toHaveBeenCalled();
    f.flush();
    expect(f.instance.play).toHaveBeenCalledWith("Main");
    f.seekTo(2.5); f.tick();
    expect(f.instance.pause).toHaveBeenCalledWith("Main");
    expect(f.instance.scrub).toHaveBeenLastCalledWith("Main", 2.5);
    expect(f.loaded).not.toHaveBeenCalled();
    f.seekTo(3); f.tick();
    expect(f.instance.scrub).toHaveBeenLastCalledWith("Main", 3);
    expect(f.loaded).toHaveBeenCalledOnce();
    expect(f.failed).not.toHaveBeenCalled();
  });

  it.each(["play", "resizeDrawingSurfaceToCanvas", "pause", "scrub", "drawFrame"] as const)("surfaces %s errors without leaving false readiness or uncaught frame errors", (method) => {
    const f = fixture();
    f.instance[method].mockImplementation(() => { throw new Error("decoder failure"); });
    f.controller.load(); f.flush(); f.tick(); f.tick();
    expect(f.failed).toHaveBeenCalledOnce();
    expect(f.loaded).not.toHaveBeenCalled();
    expect(f.callbacks.size).toBe(0);
  });

  it.each(["before-load", "before-first-frame", "before-ready"])("cancels obsolete callbacks %s without touching a replaced instance", (phase) => {
    const f = fixture();
    f.controller.load();
    if (phase !== "before-load") f.flush();
    if (phase === "before-ready") f.tick();
    f.controller.dispose();
    const draws = f.instance.drawFrame.mock.calls.length;
    f.flush(); f.tick(); f.tick(); f.seekTo(4); f.controller.fail();
    expect(f.instance.drawFrame).toHaveBeenCalledTimes(draws);
    expect(f.loaded).not.toHaveBeenCalled();
    expect(f.failed).not.toHaveBeenCalled();
    expect(f.callbacks.size).toBe(0);
  });

  it("shows decode failure only once and cancels any pending paint", () => {
    const f = fixture();
    f.controller.load(); f.flush(); f.controller.fail(); f.controller.fail(); f.tick();
    expect(f.failed).toHaveBeenCalledOnce();
    expect(f.instance.drawFrame).not.toHaveBeenCalled();
    expect(f.loaded).not.toHaveBeenCalled();
  });
});
