import { describe, expect, it } from "vitest";
import { cutGraphicSchema } from "../shared/cut-studio";
import { compileCompositionToEdl } from "../shared/cut-studio-production";
import { cutGraphicPivotOffset, planCutGraphicRaster, planCutGraphicRasters } from "../server/cut-graphic-geometry";
import { captureCutRenderTimeline, resolveCutRenderTimeline } from "../server/cut-render-snapshot";

const graphic = () => cutGraphicSchema.parse({ id: "shape", kind: "shape", text: "", timelineStart: 0, duration: 1, width: .25, height: .25 });
describe("bounded authored graphic geometry", () => {
  it("preserves unclamped positions, size and authored pivots in native compilation", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const edl = compileCompositionToEdl({ version: 1, name: "Off-frame", width: 480, height: 270, fps: 30, durationInFrames: 30, layers: [
      { id: "video", name: "Video", kind: "video", assetId: id, from: 0, durationInFrames: 30 },
      { id: "shape", name: "Shape", kind: "shape", from: 0, durationInFrames: 30, x: -.25, y: .9, width: 1.25, height: .4, anchorX: 0, anchorY: 1 },
    ] }, { version: 3, clips: [] });
    expect(edl.graphics?.[0]).toMatchObject({ x: -.25, y: .9, width: 1.25, height: .4, anchorX: 0, anchorY: 1 });
    expect(() => cutGraphicSchema.parse(edl.graphics?.[0])).not.toThrow();
  });
  it("keeps legacy snapshot hashes free of newly default-injected pivots", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const project = { id, sourceAssetId: id, revision: 1, name: "Old geometry", duration: 1, transcript: null, edl: { version: 3 as const, clips: [{ start: 0, end: 1 }], graphics: [graphic()] } };
    const snapshot = captureCutRenderTimeline(project);
    expect(Object.hasOwn(snapshot.edl.graphics![0], "anchorX")).toBe(false);
    expect(resolveCutRenderTimeline(project, JSON.parse(JSON.stringify(snapshot))).edl.graphics?.[0].anchorX).toBeUndefined();
  });
  it("maps centered and corner pivots to the rotated raster without shifting the authored origin", () => {
    expect(cutGraphicPivotOffset(120, 60, 120, 60, 1, 0, 0, 0)).toEqual({ x: 0, y: 0 });
    const topLeft = cutGraphicPivotOffset(120, 60, 136, 136, 1, 90, 0, 0);
    expect(topLeft.x).toBeCloseTo(-98); expect(topLeft.y).toBeCloseTo(-8);
    expect(cutGraphicPivotOffset(120, 60, 240, 120, 2, 0, 1, 0)).toEqual({ x: -120, y: 0 });
    expect(cutGraphicPivotOffset(120, 60, 136, 136, 1, 90)).toEqual({ x: -8, y: -38 });
  });
  it("bounds surfaces and aggregate allocations before graphics are rasterized", () => {
    const normal = planCutGraphicRaster(graphic(), 1280, 720);
    expect(normal).toMatchObject({ width: 320, height: 180, canvasWidth: 320, canvasHeight: 180, has3d: false });
    expect(() => planCutGraphicRaster({ ...graphic(), width: 8, height: 8 }, 3840, 2160)).toThrow(/size budget/);
    expect(() => planCutGraphicRasters(Array.from({ length: 50 }, () => ({ ...graphic(), width: 1, height: 1 })), 1920, 1080)).toThrow(/Combined graphics/);
    expect(() => planCutGraphicRaster({ ...graphic(), rotationX: 1, motionKeyframes: [{ scale: .01, rotation: 0, rotationX: 1, rotationY: 0 }] }, 1920, 1080)).toThrow(/size budget/);
  });
  it("rejects unimplemented non-centered 3D pivots before raster work", () => {
    expect(() => planCutGraphicRaster({ ...graphic(), anchorX: 0, rotationX: 30 }, 1280, 720)).toThrow(/3D pivot support is not implemented/);
    expect(() => planCutGraphicRaster({ ...graphic(), anchorX: 0, rotation: 30 }, 1280, 720)).not.toThrow();
  });
});
