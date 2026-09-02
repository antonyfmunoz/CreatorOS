import { describe, expect, it, vi } from "vitest";
import { createCutPreviewReadiness } from "../client/src/lib/cut-preview-readiness";

describe("composition resource readiness", () => {
  it("requires every resource and ignores a disposed resource's late completion", () => {
    const store = createCutPreviewReadiness();
    const old = store.acquire("Old image"); const video = store.acquire("Video");
    expect(store.getSnapshot().pending).toBe(2);
    old.release(); const image = store.acquire("New image"); old.ready();
    video.ready(); expect(store.getSnapshot()).toMatchObject({ ready: false, pending: 1 });
    image.ready(); expect(store.getSnapshot().ready).toBe(true);
    image.release(); video.release();
  });
  it("preserves simultaneous failures until replacement or recovery", () => {
    const store = createCutPreviewReadiness(); const first = store.acquire("Font"); const second = store.acquire("Image");
    first.fail("Font unavailable"); second.fail("Image unavailable");
    expect(store.getSnapshot().errors).toEqual(["Font unavailable", "Image unavailable"]);
    first.ready(); expect(store.getSnapshot().ready).toBe(false);
    second.release(); expect(store.getSnapshot().ready).toBe(true); first.release();
  });
  it("can buffer again after readiness without resetting the timeout on duplicate waiting events", () => {
    vi.useFakeTimers();
    try {
      const store = createCutPreviewReadiness(); const media = store.acquire("Video"); media.ready();
      media.pending(); vi.advanceTimersByTime(20_000); media.pending(); vi.advanceTimersByTime(10_000);
      expect(store.getSnapshot().errors[0]).toContain("Video did not become ready");
      media.ready(); expect(store.getSnapshot().ready).toBe(true); media.release();
    } finally { vi.useRealTimers(); }
  });
  it("cancels watchdogs on disposal and notifies only changed stable snapshots", () => {
    vi.useFakeTimers();
    try {
      const store = createCutPreviewReadiness(); const listener = vi.fn(); const unsubscribe = store.subscribe(listener);
      const lease = store.acquire("Image"); const pending = store.getSnapshot(); lease.pending();
      expect(store.getSnapshot()).toBe(pending); expect(listener).toHaveBeenCalledTimes(1);
      lease.release(); vi.advanceTimersByTime(60_000); expect(store.getSnapshot().ready).toBe(true);
      expect(listener).toHaveBeenCalledTimes(2); unsubscribe(); lease.fail("Late failure");
      expect(listener).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
