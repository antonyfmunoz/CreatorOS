import { describe, expect, it } from "vitest";
import { cutGraphicPreviewAt } from "../shared/cut-graphic-preview";
import type { CutGraphic } from "../shared/cut-studio";

const graphic: CutGraphic = {
  id: "lower", kind: "lower_third", text: "CreativeOS", timelineStart: 2, duration: 4,
  x: .1, y: .75, width: .4, height: .15, fontSize: 48, fontFamily: "CreativesOS Sans", textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: .72,
  fillColor: null, strokeWidth: 2, primitive: null, secondaryColor: "#0b5f99", edgeColor: "#ffffff", wireframe: false, depth: 1, borderRadius: 0,
  rotation: 0, rotationX: 0, rotationY: 0, perspective: 0, blur: 0, brightness: 1, saturation: 1, revealKind: null, revealDirection: null, revealProgress: 1, revealMaskAssetId: null, effects: [],
};

describe("native-clock graphic preview", () => {
  it("does not show a graphic outside its half-open timeline span", () => {
    expect(cutGraphicPreviewAt(graphic, 1.999).active).toBe(false);
    expect(cutGraphicPreviewAt(graphic, 2).active).toBe(true);
    expect(cutGraphicPreviewAt(graphic, 6).active).toBe(false);
  });
  it("uses linear legacy keyframes matching the native filter compiler", () => {
    const state = cutGraphicPreviewAt({ ...graphic, motionKeyframes: [{ at: 2, x: .5, y: .5, scale: 2, rotation: 30, rotationX: 4, rotationY: 8, perspective: 400, blur: 4, brightness: 1.5, saturation: 1.2, revealKind: null, revealDirection: null, revealProgress: .4, opacity: .2 }] }, 3, 30);
    expect(state.x).toBeCloseTo(.3); expect(state.scale).toBeCloseTo(1.5); expect(state.rotation).toBeCloseTo(15); expect(state.opacity).toBeCloseTo(.6);
    expect(state.rotationX).toBeCloseTo(2); expect(state.perspective).toBeCloseTo(200); expect(state.revealProgress).toBeCloseTo(.7);
  });
  it("uses bounded composition curves over legacy values at output-frame precision", () => {
    const state = cutGraphicPreviewAt({ ...graphic, compositionCurves: { version: 1, fps: 24, durationInFrames: 96, curves: [{ property: "opacity", base: 1, keyframes: [{ frame: 48, value: .2, easing: "linear" }] }], transitions: [] }, motionKeyframes: [{ at: 2, x: .1, y: .75, scale: 1, rotation: 0, rotationX: 0, rotationY: 0, perspective: 0, blur: 0, brightness: 1, saturation: 1, revealKind: null, revealDirection: null, revealProgress: 1, opacity: .9 }] }, 3, 24);
    // Native expressions hold the first declared curve value before its first
    // keyframe; the schema base is used only when the curve has no keyframes.
    expect(state.localFrame).toBe(24); expect(state.opacity).toBeCloseTo(.2); expect(state.x).toBeCloseTo(.1);
  });
  it("clamps opacity while preserving renderer-valid visual controls", () => {
    const state = cutGraphicPreviewAt({ ...graphic, motionKeyframes: [{ at: 1, x: .1, y: .75, scale: 1, rotation: 0, rotationX: 0, rotationY: 0, perspective: 0, blur: 20, brightness: 3, saturation: 2, revealKind: null, revealDirection: null, revealProgress: 0, opacity: 1 }] }, 2.5);
    expect(state.opacity).toBe(1); expect(state.blur).toBe(10); expect(state.brightness).toBe(2); expect(state.saturation).toBe(1.5); expect(state.revealProgress).toBe(.5);
  });
});
