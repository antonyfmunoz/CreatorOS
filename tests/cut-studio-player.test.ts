import { describe, expect, it } from "vitest";
import { cutCompositionRenditionSize, cutPlayerFrame, cutPlayerGain, cutPlayerRate } from "../shared/cut-studio-player";

describe("composition player transport", () => {
  it("bounds invalid frame inputs and the last frame", () => {
    expect(cutPlayerFrame(NaN, 90)).toBe(0);
    expect(cutPlayerFrame(-5, 90)).toBe(0);
    expect(cutPlayerFrame(200, 90)).toBe(89);
    expect(cutPlayerFrame(20.9, 90)).toBe(20);
  });
  it("keeps speed finite and inside the supported forward playback range", () => {
    for (const rate of [NaN, Infinity, -1, 0]) expect(cutPlayerRate(rate)).toBe(1);
    expect(cutPlayerRate(0.1)).toBe(.25);
    expect(cutPlayerRate(10)).toBe(4);
    expect(cutPlayerRate(1.5)).toBe(1.5);
  });
  it("retains the renderer's gain above unity without exceeding the layer budget", () => {
    expect(cutPlayerGain(2, 1)).toBe(2);
    expect(cutPlayerGain(1.5, .5)).toBe(.75);
    expect(cutPlayerGain(5, 5)).toBe(2);
    expect(cutPlayerGain(-1, .5)).toBe(0);
  });
  it("preserves portrait, square and wide ratios within the output budget", () => {
    expect(cutCompositionRenditionSize(1080, 1920, "720p")).toEqual([720, 1280]);
    expect(cutCompositionRenditionSize(1920, 1080, "720p")).toEqual([1280, 720]);
    expect(cutCompositionRenditionSize(1080, 1080, "1080p")).toEqual([1080, 1080]);
    expect(cutCompositionRenditionSize(7680, 240, "2160p")).toEqual([3840, 120]);
  });
});
