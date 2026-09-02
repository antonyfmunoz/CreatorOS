import { describe, expect, it } from "vitest";
import { cutGraphicOpacityFilters } from "../server/cut-graphic-opacity";

describe("graphic opacity work", () => {
  it("does no per-pixel expression work for opaque content", () => {
    expect(cutGraphicOpacityFilters("source", "result", "1")).toEqual(["[source]format=rgba[result]"]);
  });
  it("uses a constant alpha multiplier without touching RGB", () => {
    expect(cutGraphicOpacityFilters("source", "result", "0.6")).toEqual(["[source]format=rgba,lutrgb=a='val*0.6'[result]"]);
  });
  it("restricts a varying envelope to the extracted alpha plane", () => {
    const result = cutGraphicOpacityFilters("source", "result", "T/2");
    expect(result).toEqual(["[source]format=rgba,split[resultcolor][resultalpha]", "[resultalpha]alphaextract,geq=lum='lum(X,Y)*(T/2)'[resultopacity]", "[resultcolor][resultopacity]alphamerge[result]"]);
  });
  it("rejects invalid labels and out-of-range constant opacity", () => {
    expect(() => cutGraphicOpacityFilters("source];movie=x", "result", "1")).toThrow(/label/);
    expect(() => cutGraphicOpacityFilters("source", "result", "1.1")).toThrow(/between/);
    expect(() => cutGraphicOpacityFilters("source", "result", " ")).toThrow(/empty/);
  });
});
