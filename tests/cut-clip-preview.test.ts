import { describe, expect, it } from "vitest";
import { cutClipPreviewAt } from "../shared/cut-clip-preview";

describe("native-clock overlay clip preview", () => {
  const clip = { id: "overlay", start: 4, end: 8, speed: 2, assetId: "00000000-0000-4000-8000-000000000001", track: "v2", timelineStart: 3, transform: { x: .1, y: .2, width: .3, height: .4, opacity: .8 } };
  it("maps timeline time into speed-adjusted source time and a half-open span", () => {
    expect(cutClipPreviewAt(clip, 2.999).active).toBe(false);
    expect(cutClipPreviewAt(clip, 3)).toMatchObject({ active: true, sourceTime: 4 });
    expect(cutClipPreviewAt(clip, 4).sourceTime).toBe(6);
    expect(cutClipPreviewAt(clip, 5).active).toBe(false);
  });
  it("uses the renderer's linear and smoothstep motion rules", () => {
    const result = cutClipPreviewAt({ ...clip, motionKeyframes: [{ at: 1, x: .5, y: .4, scale: 2, opacity: .2, easing: "ease_in_out" }] }, 3.5);
    expect(result.x).toBeCloseTo(.3); expect(result.y).toBeCloseTo(.3); expect(result.scale).toBeCloseTo(1.5); expect(result.opacity).toBeCloseTo(.5);
  });
  it("keeps bounded opacity and source time even when inspected outside the clip", () => {
    const result = cutClipPreviewAt({ ...clip, motionKeyframes: [{ at: 1, x: .1, y: .2, scale: 1, opacity: 0, easing: "linear" }] }, 7);
    expect(result.active).toBe(false); expect(result.sourceTime).toBe(12); expect(result.opacity).toBe(0);
  });
});
