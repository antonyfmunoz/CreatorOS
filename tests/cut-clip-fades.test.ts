import { describe, expect, it } from "vitest";
import { cutClipFades } from "../shared/cut-clip-fades";
import { cutPrimaryPreviewAt } from "../shared/cut-primary-preview";
import type { CutEdl } from "../shared/cut-studio";

describe("shared native and primary-preview fades", () => {
  it("preserves the existing native first, middle, last and single-clip edges", () => {
    const clip = { transition: "fade_black" as const };
    expect(cutClipFades(clip, 1, 0, 3)).toEqual({ fadeIn: 0, fadeOut: .35 });
    expect(cutClipFades(clip, 1, 1, 3)).toEqual({ fadeIn: .35, fadeOut: .35 });
    expect(cutClipFades(clip, 1, 2, 3)).toEqual({ fadeIn: .35, fadeOut: 0 });
    expect(cutClipFades(clip, 1, 0, 1)).toEqual({ fadeIn: 0, fadeOut: 0 });
  });
  it("caps short and explicit fades at half of edited duration", () => {
    expect(cutClipFades({ transition: "fade_black" }, .2, 1, 3)).toEqual({ fadeIn: .1, fadeOut: .1 });
    expect(cutClipFades({ transition: "fade_black", fadeIn: .8, fadeOut: .05 }, 1, 1, 3)).toEqual({ fadeIn: .5, fadeOut: .35 });
    expect(cutClipFades({ transition: "cut", fadeIn: .8, fadeOut: .05 }, 1, 1, 3)).toEqual({ fadeIn: .5, fadeOut: .05 });
  });
  it("applies transition fades to preview pixels and source gain on the edited clock", () => {
    const edl: CutEdl = { version: 3, clips: [
      { id: "first", start: 0, end: 2, speed: 2, transition: "fade_black", timelineStart: 0 },
      { id: "second", start: 2, end: 3, transition: "fade_black", timelineStart: 1 },
    ] };
    expect(cutPrimaryPreviewAt(edl, .825).opacity).toBeCloseTo(.5);
    expect(cutPrimaryPreviewAt(edl, .825).gain).toBeCloseTo(.5);
    expect(cutPrimaryPreviewAt(edl, 1.175).opacity).toBeCloseTo(.5);
    expect(cutPrimaryPreviewAt(edl, 1.175).sourceTime).toBeCloseTo(2.175);
    expect(cutPrimaryPreviewAt(edl, 0).opacity).toBe(1);
    expect(cutPrimaryPreviewAt(edl, 1).opacity).toBe(0);
  });
  it("counts leading and trailing gaps exactly like the native primary plan", () => {
    const edl: CutEdl = { version: 3, clips: [
      { id: "primary", start: 0, end: 1, timelineStart: 1, transition: "fade_black" },
      { id: "tail", track: "a1", start: 0, end: 1, timelineStart: 2 },
    ] };
    expect(cutPrimaryPreviewAt(edl, .5).clip).toBe(null);
    expect(cutPrimaryPreviewAt(edl, 1.175).opacity).toBeCloseTo(.5);
    expect(cutPrimaryPreviewAt(edl, 1.825).opacity).toBeCloseTo(.5);
    expect(cutPrimaryPreviewAt(edl, 2.5).clip).toBe(null);
  });
  it("rejects invalid timing rather than generating encoder arguments", () => {
    for (const args of [[0, 0, 1], [NaN, 0, 1], [1, -1, 1], [1, 1, 1], [1, 0, 0], [1, .5, 2]]) {
      expect(() => cutClipFades({}, args[0], args[1], args[2])).toThrow("Invalid clip fade timing");
    }
  });
});
