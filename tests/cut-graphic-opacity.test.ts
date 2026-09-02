import { describe, expect, it } from "vitest";
import { cutGraphicOpacityFilters } from "../server/cut-graphic-opacity";

describe("graphic opacity work", () => {
  it("caches opted-in frame curves per slice without touching other alpha/RGB samples", () => {
    expect(cutGraphicOpacityFilters("source", "result", "T/2", { frameUniform: true })[1]).toContain("if(eq(ld(7),N+1),0,st(2,T/2);st(7,N+1));lum(X,Y)*ld(2)");
    expect(cutGraphicOpacityFilters("source", "result", "X/W")[1]).not.toContain("st(7");
    expect(cutGraphicOpacityFilters("source", "result", "1", { frameUniform: true })).toEqual(["[source]format=rgba[result]"]);
  });
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
