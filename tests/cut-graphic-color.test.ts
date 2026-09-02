import { describe, expect, it } from "vitest";
import { cutGraphicColorFilters } from "../server/cut-graphic-color";

describe("native CSS graphic color compilation", () => {
  it("leaves neutral RGB unchanged and avoids expensive per-pixel expressions", () => {
    expect(cutGraphicColorFilters("1", "1")).toEqual(["format=rgba"]);
    expect(cutGraphicColorFilters("0.5", "1").join(",")).toContain("lutrgb=");
    expect(cutGraphicColorFilters("0.5", "1").join(",")).not.toContain("geq");
  });
  it("preserves alpha and uses RGB multiplication for animated brightness", () => {
    const filter = cutGraphicColorFilters("1+T", "1").join(",");
    expect(filter).toContain("r(X,Y)*(1+T)");
    expect(filter).toContain("a='alpha(X,Y)'");
    expect(filter).not.toContain("eq=brightness");
  });
  it("uses the CSS saturation matrix with isolated reset scratch values", () => {
    const filter = cutGraphicColorFilters("1", "T").join(",");
    expect(filter).toContain("0.213+0.787*ld(3)");
    expect(filter).toContain("0.715+0.285*ld(3)");
    expect(filter).toContain("0.072+0.928*ld(3)");
    expect(filter).toContain("a='alpha(X,Y)'");
    expect(filter).not.toContain("st(0");
    expect(filter).not.toContain("st(1");
  });
  it("uses a fast bounded native matrix for constant saturation without clipping its controls", () => {
    const filter = cutGraphicColorFilters(".9", ".7").join(",");
    expect(filter).toContain("colorchannelmixer=");
    expect(filter).toContain("lutrgb=");
    expect(filter).not.toContain("geq=");
    expect(filter).toContain("alphaextract[graphiccolorpreserved]");
    expect(filter).toContain("[graphiccolorprocessed][graphiccolorpreserved]alphamerge");
    expect(cutGraphicColorFilters("1", "4").join(",")).toContain("geq=");
  });
  it("rejects missing and out-of-range constant controls", () => {
    expect(() => cutGraphicColorFilters("1", "1", "bad;label")).toThrow(/label/);
    for (const values of [["", "1"], ["1", " "], ["-1", "1"], ["1", "9"]]) {
      expect(() => cutGraphicColorFilters(values[0], values[1])).toThrow();
    }
  });
});
