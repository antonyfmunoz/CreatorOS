import { describe, expect, it } from "vitest";
import { cutRenderDurationArgs, cutRasterInputArgs } from "../server/cut-render-duration";

describe("CutStudio FFmpeg duration boundary", () => {
  it("adds an explicit millisecond-precise output boundary", () => {
    expect(cutRenderDurationArgs(3)).toEqual(["-t", "3.000"]);
    expect(cutRenderDurationArgs(3.14159)).toEqual(["-t", "3.142"]);
  });

  it("keeps a positive lower bound and rejects invalid timelines", () => {
    expect(cutRenderDurationArgs(0.0004)).toEqual(["-t", "0.001"]);
    expect(() => cutRenderDurationArgs(0)).toThrow(/finite positive timeline duration/i);
    expect(() => cutRenderDurationArgs(Number.NaN)).toThrow(/finite positive timeline duration/i);
  });

  it("bounds looped raster inputs before the input file without losing a fractional final frame", () => {
    expect(cutRasterInputArgs({ path: "private image.png", animated: false }, 24, 2)).toEqual(["-loop", "1", "-framerate", "24", "-t", "2.000000000", "-i", "private image.png"]);
    expect(cutRasterInputArgs({ path: "frame-%06d.png", animated: true }, 30, .101)).toEqual(["-framerate", "30", "-t", "0.133333333", "-i", "frame-%06d.png"]);
    expect(() => cutRasterInputArgs({ path: "x.png", animated: false }, 0, 1)).toThrow(/timing/);
    expect(() => cutRasterInputArgs({ path: "x.png", animated: false }, 30, Infinity)).toThrow(/timing/);
  });
});
