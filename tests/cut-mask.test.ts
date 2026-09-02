import { describe, expect, it } from "vitest";
import { cutLayerMaskAsset, cutMaskAlpha } from "../shared/cut-mask";
import { compileCompositionToEdl } from "../shared/cut-studio-production";

describe("private mask semantics", () => {
  it("multiplies source transparency instead of discarding it", () => {
    expect(Array.from(cutMaskAlpha(Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 128, 255, 255, 255, 0])))).toEqual([0, 255, 128, 0]);
    expect(Array.from(cutMaskAlpha(Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])))).toEqual([54, 182, 18]);
    expect(() => cutMaskAlpha(Uint8Array.from([1, 2, 3]))).toThrow(/four-channel/);
  });
  it("keeps one transition mask throughout the graphic and ignores disabled effects", () => {
    expect(cutLayerMaskAsset({ kind: "shape", effects: [], enter: { kind: "custom_mask", maskAssetId: "mask" } })).toBe("mask");
    expect(cutLayerMaskAsset({ kind: "shape", effects: [{ kind: "mask", enabled: false, parameters: { maskAssetId: "ignored" } }], exit: { kind: "custom_mask", maskAssetId: "mask" } })).toBe("mask");
    expect(cutLayerMaskAsset({ kind: "shape", effects: [{ kind: "mask", parameters: { maskAssetId: "mask" } }], enter: { kind: "custom_mask", maskAssetId: "mask" } })).toBe("mask");
  });
  it("does not silently choose between incompatible effect and transition masks", () => {
    expect(() => cutLayerMaskAsset({ kind: "shape", effects: [{ kind: "mask", parameters: { maskAssetId: "first" } }], enter: { kind: "custom_mask", maskAssetId: "second" } })).toThrow(/one private mask/);
  });
  it("fails unsupported native masks before compiling an executable edit", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    for (const kind of ["video", "audio", "lottie", "rive", "data"]) {
      expect(() => compileCompositionToEdl({ version: 1, name: "Unsupported mask", width: 480, height: 270, fps: 30, durationInFrames: 30, layers: [{ id: "media", name: "Media", kind, assetId: id, from: 0, durationInFrames: 30, effects: [{ id: "mask", kind: "mask", parameters: { maskAssetId: id } }] }] }, { version: 3, clips: [] })).toThrow(/not supported yet/);
    }
  });
});
