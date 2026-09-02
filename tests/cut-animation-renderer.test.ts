import { describe, expect, it } from "vitest";
import { cutAnimationFrameCount } from "../server/cut-animation-renderer";

describe("CutStudio isolated animation renderer budget", () => {
  it("derives deterministic frame counts for final rendering", () => {
    expect(cutAnimationFrameCount(2, 30)).toBe(60);
    expect(cutAnimationFrameCount(1 / 24, 24)).toBe(1);
    expect(cutAnimationFrameCount(1.01, 30)).toBe(31);
  });

  it("rejects empty, unbounded, and non-finite renders", () => {
    expect(() => cutAnimationFrameCount(0, 30)).toThrow(/positive/i);
    expect(() => cutAnimationFrameCount(121, 30)).toThrow(/limited/i);
    expect(() => cutAnimationFrameCount(Number.POSITIVE_INFINITY, 30)).toThrow(/positive/i);
    expect(() => cutAnimationFrameCount(-1, -30)).toThrow(/positive/i);
    expect(() => cutAnimationFrameCount(1, 0)).toThrow(/frame rate/i);
    expect(() => cutAnimationFrameCount(1, 61)).toThrow(/frame rate/i);
  });
});
