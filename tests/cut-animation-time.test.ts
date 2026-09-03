import { describe, expect, it } from "vitest";
import { cutLottieFrameAtTime } from "../shared/cut-animation-time";
import { compileCompositionToEdl } from "../shared/cut-studio-production";
import { cutGraphicSchema, type CutEdl } from "../shared/cut-studio";
import { validateCutStudioLottie } from "../shared/cut-studio-lottie";

describe("animation source time", () => {
  it("converts seconds using the asset frame rate, not the delivery rate", () => {
    const timing = { frameRate: 60, inPoint: 20, outPoint: 140 };
    expect(cutLottieFrameAtTime(5 / 30, timing)).toBe(10);
    expect(cutLottieFrameAtTime(5 / 60, timing)).toBe(5);
    expect(cutLottieFrameAtTime(.5, { ...timing, frameRate: 29.97 })).toBeCloseTo(14.985, 10);
  });
  it("leaves in-point application to the player and repeats complete source spans", () => {
    const timing = { frameRate: 30, inPoint: 40, outPoint: 100 };
    expect(cutLottieFrameAtTime(0, timing)).toBe(0);
    expect(cutLottieFrameAtTime(2, timing)).toBe(0);
    expect(cutLottieFrameAtTime(2.5, timing)).toBe(15);
    expect(cutLottieFrameAtTime(.5, { ...timing, inPoint: -20, outPoint: 40 })).toBe(15);
  });
  it("rejects invalid timing and files with no playable frame", () => {
    const timing = { frameRate: 30, inPoint: 0, outPoint: 60 };
    for (const seconds of [-1, Infinity, NaN, Number.MAX_SAFE_INTEGER]) expect(() => cutLottieFrameAtTime(seconds, timing)).toThrow();
    for (const patch of [{ frameRate: 0 }, { frameRate: NaN }, { outPoint: 0 }, { outPoint: .5 }, { inPoint: Infinity }]) expect(() => cutLottieFrameAtTime(0, { ...timing, ...patch })).toThrow();
    expect(() => validateCutStudioLottie({ v: "5.13.0", fr: 30, ip: 0, op: .5, w: 100, h: 100, layers: [] })).toThrow(/playable frame/);
  });
  it("carries Lottie and Rive source offsets through composition compilation", () => {
    const assetId = "00000000-0000-4000-8000-000000000001";
    const manifest = { version: 1, name: "Source timing", width: 1280, height: 720, fps: 24, durationInFrames: 24, layers: [
      { id: "source", name: "Source", kind: "video", assetId, from: 0, durationInFrames: 24 },
      ...["lottie", "rive"].map(kind => ({ id: kind, name: kind, kind, assetId, from: 0, durationInFrames: 24, sourceStartFrame: 30 })),
    ] };
    const base = { version: 1, clips: [{ id: "source", start: 0, end: 1 }] } as CutEdl;
    const compiled = compileCompositionToEdl(manifest, base);
    expect(compiled.graphics?.map(graphic => graphic.animationSourceStartSeconds)).toEqual([1.25, 1.25]);
    for (const graphic of compiled.graphics!) expect(cutGraphicSchema.parse(graphic).animationSourceStartSeconds).toBe(1.25);
    const zero = compileCompositionToEdl({ ...manifest, layers: manifest.layers.map(layer => ({ ...layer, sourceStartFrame: 0 })) }, base);
    for (const graphic of zero.graphics!) expect(cutGraphicSchema.parse(graphic)).not.toHaveProperty("animationSourceStartSeconds");
    expect(base).not.toHaveProperty("graphics");
  });
});
