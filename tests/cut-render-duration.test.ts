import { describe, expect, it } from "vitest";
import { cutRenderDurationArgs } from "../server/cut-render-duration";

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
});
