import { describe, expect, it } from "vitest";
import { compileCompositionToEdl, evaluateCompositionFrame } from "../shared/cut-studio-production";
import { cutGraphicSchema } from "../shared/cut-studio";
import { cutGraphicCurvesSchema, evaluateCutGraphicCurve } from "../shared/cut-graphic-curves";
import { cutGraphicCurveExpression } from "../server/cut-curve-expression";
import { planCutGraphicRaster } from "../server/cut-graphic-geometry";

const manifest = (easing: string, transition: string = "slide") => ({ version: 1, name: "Owned curves", width: 1920, height: 1080, fps: 30, durationInFrames: 100, layers: [
  { id: "source", name: "Source", kind: "video", assetId: "11111111-1111-4111-8111-111111111111", from: 0, durationInFrames: 100 },
  { id: "graphic", name: "Curves", kind: "shape", from: 10, durationInFrames: 90, x: .1, y: .2, width: .1, height: .1,
    enter: { kind: transition, durationInFrames: 20, easing: "spring", direction: "left" },
    exit: { kind: transition, durationInFrames: 30, easing: "ease_out", direction: "down" },
    animations: [
      ...["x", "y", "opacity"].map((property) => ({ property, keyframes: [{ frame: 3, value: .1, easing }, { frame: 89, value: .8, easing }] })),
      { property: "scale", keyframes: [{ frame: 0, value: .8, easing }, { frame: 50, value: 2, easing }, { frame: 89, value: 1, easing }] },
      { property: "rotation", keyframes: [{ frame: 0, value: -60, easing }, { frame: 89, value: 90, easing }] },
    ] },
] });

describe("native declarative graphic curves", () => {
  it.each(["linear", "ease_in", "ease_out", "ease_in_out", "spring", "step"])("preserves every authored %s frame and composed transitions", (easing) => {
    for (const transition of ["slide", "fade", "zoom"]) {
      const input = manifest(easing, transition);
      const graphic = compileCompositionToEdl(input, { version: 3, clips: [] }).graphics![0];
      const curves = cutGraphicCurvesSchema.parse(graphic.compositionCurves);
      for (let frame = 0; frame < 90; frame++) {
        const expected = evaluateCompositionFrame(input, frame + 10).find((layer) => layer.id === "graphic")!;
        for (const property of ["x", "y", "scale", "rotation", "opacity", "brightness", "saturation"] as const) expect(evaluateCutGraphicCurve(curves, property, frame)).toBeCloseTo(expected[property], 12);
      }
    }
  });

  it("preserves legacy absence and rejects malformed or oversized curve declarations", () => {
    const legacy = cutGraphicSchema.parse({ id: "legacy", text: "Legacy", timelineStart: 0, duration: 1 });
    expect(Object.hasOwn(legacy, "compositionCurves")).toBe(false);
    const curves = compileCompositionToEdl(manifest("spring"), { version: 3, clips: [] }).graphics![0].compositionCurves!;
    expect(() => cutGraphicCurvesSchema.parse({ ...curves, curves: [curves.curves[0], curves.curves[0]] })).toThrow(/unique/);
    expect(() => cutGraphicCurvesSchema.parse({ ...curves, curves: [{ ...curves.curves[0], base: Infinity }] })).toThrow();
    expect(() => cutGraphicCurvesSchema.parse({ ...curves, curves: [{ ...curves.curves[0], keyframes: [{ frame: 90, value: .1, easing: "linear" }] }] })).toThrow(/inside/);
    expect(() => cutGraphicCurvesSchema.parse({ ...curves, curves: [{ ...curves.curves[0], keyframes: [{ frame: 0, value: .1, easing: "movie=network" }] }] })).toThrow();
    expect(() => cutGraphicCurvesSchema.parse({ ...curves, curves: [{ ...curves.curves[0], keyframes: Array.from({ length: 51 }, (_, frame) => ({ frame, value: .1, easing: "linear" })) }] })).toThrow();
  });

  it("keeps static opacity fast, bounds the frame clock, and serializes authored spring curves", () => {
    const graphic = compileCompositionToEdl(manifest("spring"), { version: 3, clips: [] }).graphics![0];
    const curves = graphic.compositionCurves!;
    expect(cutGraphicCurveExpression(curves, "brightness", 1, "t")).toBe("1");
    const expression = cutGraphicCurveExpression(curves, "x", 1, "t")!;
    expect(expression).toContain("floor((t-1+0.000001)*30)");
    expect(expression).toContain("exp(-7*");
    expect(expression).not.toMatch(/https?:|movie=|process|fetch/);
    expect(() => cutGraphicCurveExpression(curves, "x", Infinity, "T")).toThrow(/finite/);
  });

  it("budgets against authored scale extrema rather than only sparse samples", () => {
    const graphic = compileCompositionToEdl(manifest("spring", "zoom"), { version: 3, clips: [] }).graphics![0];
    const plan = planCutGraphicRaster({ ...graphic, motionKeyframes: graphic.motionKeyframes?.map((point) => ({ ...point, scale: 1 })) }, 1920, 1080);
    expect(plan.maximumScale).toBe(2);
  });

  it("does not advertise exact scalar handling for the legacy projected-3D path", () => {
    const input = manifest("spring");
    Object.assign(input.layers[1], { rotationY: 20 });
    const graphic = compileCompositionToEdl(input, { version: 3, clips: [] }).graphics![0];
    expect(graphic.compositionCurves).toBeUndefined();
  });

  it("preserves clipped and overlapping transitions longer than the layer", () => {
    for (const transition of ["slide", "zoom", "fade"]) {
      const input = manifest("spring", transition);
      input.layers[1].enter!.durationInFrames = 120;
      input.layers[1].exit!.durationInFrames = 100;
      const graphic = compileCompositionToEdl(input, { version: 3, clips: [] }).graphics![0];
      for (let frame = 0; frame < 90; frame++) {
        const expected = evaluateCompositionFrame(input, frame + 10).find((layer) => layer.id === "graphic")!;
        for (const property of ["x", "y", "scale", "opacity"] as const) expect(evaluateCutGraphicCurve(graphic.compositionCurves!, property, frame)).toBeCloseTo(expected[property], 12);
      }
    }
  });
});
