import { describe, expect, it, vi } from "vitest";
import { compileCompositionToEdl, cutCompositionManifestSchema, evaluateCompositionFrame } from "../shared/cut-studio-production";

const sourceId = "11111111-1111-4111-8111-111111111111";
const motion = (count: number, easing: "linear" | "step" = "linear") => ({ version: 1, name: "Control points", width: 480, height: 270, fps: 30, durationInFrames: 180, layers: [
  { id: "video", name: "Source", kind: "video", assetId: sourceId, from: 0, durationInFrames: 180 },
  { id: "graphic", name: "Graphic", kind: "shape", from: 0, durationInFrames: 180, x: .1, y: .3, width: .1, height: .2, animations: [{ property: "x", keyframes: Array.from({ length: count }, (_, index) => ({ frame: index * 3, value: index % 2 ? .7 : .1, easing })) }] },
] });

describe("native graphic motion control points", () => {
  it("validates the complete manifest once rather than for every sampled layer point", () => {
    const parse = vi.spyOn(cutCompositionManifestSchema, "parse");
    try {
      compileCompositionToEdl(motion(20, "step"), { version: 3, clips: [] });
      expect(parse).toHaveBeenCalledTimes(1);
    } finally { parse.mockRestore(); }
    expect(() => compileCompositionToEdl({ ...motion(20), fps: 0 }, { version: 3, clips: [] })).toThrow();
  });
  it("never drops authored boundary frames to fit the old twelve-sample limit", () => {
    const manifest = motion(20);
    const keys = compileCompositionToEdl(manifest, { version: 3, clips: [] }).graphics![0].motionKeyframes!;
    for (const key of manifest.layers[1].animations![0].keyframes) {
      expect(keys.find((point) => Math.abs(point.at * manifest.fps - key.frame) < .00001)?.x).toBe(key.value);
    }
    expect(keys.length).toBeLessThanOrEqual(50);
  });
  it("retains the held frame immediately before each step", () => {
    const manifest = motion(20, "step");
    const keys = compileCompositionToEdl(manifest, { version: 3, clips: [] }).graphics![0].motionKeyframes!;
    for (const frame of [2, 3, 29, 30, 56, 57]) {
      const expected = evaluateCompositionFrame(manifest, frame).find((item) => item.id === "graphic")!.x;
      expect(keys.find((point) => Math.abs(point.at * manifest.fps - frame) < .00001)?.x).toBe(expected);
    }
  });
  it("rejects too many essential boundaries instead of silently dropping them", () => {
    expect(() => compileCompositionToEdl(motion(51), { version: 3, clips: [] })).toThrow(/50.*boundary frames/);
  });
});
