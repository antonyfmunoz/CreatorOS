import { describe, expect, it } from "vitest";
import { cutGraphicColorFilters } from "../server/cut-graphic-color";
import { cutColorMatrixControls } from "../shared/cut-color-effects";
import { cutGraphicSchema } from "../shared/cut-studio";

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
  it("implements contrast around the sRGB midpoint before brightness and saturation", () => {
    const filter = cutGraphicColorFilters(".8", ".7", "contrasted", 2).join(",");
    expect(filter).toContain("clip((val-32767.5)*2+32767.5,0,65535)*0.8");
    expect(filter).toContain("[contrastedprocessed][contrastedpreserved]alphamerge");
    expect(cutGraphicColorFilters("1", "1", "neutral", 0).join(",")).toContain("(val-127.5)*0+127.5");
    expect(cutGraphicColorFilters("1+T", "4", "dynamic", .5).join(",")).toContain("clip((r(X,Y)-127.5)*0.5+127.5,0,255)");
    for (const contrast of [-1, 9, Infinity, NaN]) expect(() => cutGraphicColorFilters("1", "1", "test", contrast)).toThrow(/contrast/);
  });
  it("shares explicit controls and legacy amount/intensity defaults with the preview", () => {
    expect(cutColorMatrixControls({})).toEqual({ contrast: 1, brightness: 1, saturation: 1 });
    expect(cutColorMatrixControls({ amount: .7, contrast: 0, brightness: 2 })).toEqual({ contrast: 0, brightness: 2, saturation: .7 });
    expect(cutColorMatrixControls({ intensity: .5, saturation: -1 })).toEqual({ contrast: .5, brightness: .5, saturation: 0 });
    expect(cutColorMatrixControls({ contrast: "bad", brightness: NaN, saturation: Infinity })).toEqual({ contrast: 1, brightness: 1, saturation: 1 });
  });
  it("rejects unsupported native color effects before admitting a render", () => {
    const graphic = { id: "color", text: "Color", timelineStart: 0, duration: 1 };
    expect(() => cutGraphicSchema.parse({ ...graphic, effects: [{ kind: "color_matrix", parameters: { contrast: 8, brightness: 8, saturation: 8 } }] })).not.toThrow();
    for (const key of ["contrast", "brightness", "saturation", "amount", "intensity"]) {
      expect(() => cutGraphicSchema.parse({ ...graphic, effects: [{ kind: "color_matrix", parameters: { [key]: 9 } }] })).toThrow(/cannot exceed eight/);
    }
  });
});
