import { describe, expect, it } from "vitest";
import { cutClipVolumeAt, cutClipVolumePoints, cutTrackEffectiveGain } from "../shared/cut-studio";

describe("shared native preview and export gain curves", () => {
  it("applies clip gain, track gain and muted buses without changing the curve", () => {
    const clip = { start: 0, end: 4, volume: .5 };
    expect(cutClipVolumeAt(clip, 1, .25)).toBe(.125);
    expect(cutClipVolumeAt(clip, 1, 0)).toBe(0);
    const tracks = [{ track: "v1", gain: .5, bus: "voice", muted: false, hidden: false, solo: false, locked: false }];
    const buses = [{ id: "voice", name: "Voice", gain: .5, muted: true }];
    expect(cutTrackEffectiveGain("v1", tracks, buses)).toBe(0);
  });
  it("preserves linear and eased endpoints, initial override and final hold", () => {
    const clip = { start: 0, end: 4, volume: .25, volumeKeyframes: [{ at: 0, volume: 1 }, { at: 2, volume: 0, easing: "ease_in_out" as const }, { at: 4, volume: 1 }] };
    expect(cutClipVolumePoints(clip)).toHaveLength(3);
    expect(cutClipVolumeAt(clip, 0)).toBe(1);
    expect(cutClipVolumeAt(clip, .5)).toBeCloseTo(.84375);
    expect(cutClipVolumeAt(clip, 1)).toBe(.5);
    expect(cutClipVolumeAt(clip, 2)).toBe(0);
    expect(cutClipVolumeAt(clip, 3)).toBe(.5);
    expect(cutClipVolumeAt(clip, 10)).toBe(1);
    expect(cutClipVolumeAt(clip, NaN)).toBe(1);
  });
});
