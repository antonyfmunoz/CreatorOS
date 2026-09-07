import { describe, expect, it } from "vitest";
import { cutClipCssColorPreview, cutClipRequiresRenderedColorPreview } from "../shared/cut-clip-color-preview";

const clip = { start: 0, end: 4 };

describe("CutStudio edit-time color preview", () => {
  it("shares safe browser color controls across primary and editor previews", () => {
    expect(cutClipCssColorPreview({ ...clip, colorPreset: "vivid", colorAdjust: { brightness: .1, contrast: 1.2, saturation: 1.3, temperature: .5 } })).toBe("contrast(1.08) saturate(1.25) brightness(1.1) contrast(1.2) saturate(1.3) sepia(0.06)");
    expect(cutClipCssColorPreview({ ...clip, colorAdjust: { brightness: 0, contrast: 1, saturation: 1, temperature: -.5 } })).toContain("hue-rotate(-2deg)");
  });

  it("never presents calibrated LUT or chroma key output as a browser-equivalent preview", () => {
    expect(cutClipRequiresRenderedColorPreview({ ...clip, colorPreset: "cinematic" })).toBe(false);
    expect(cutClipRequiresRenderedColorPreview({ ...clip, lutAssetId: "11111111-1111-4111-8111-111111111111" })).toBe(true);
    expect(cutClipRequiresRenderedColorPreview({ ...clip, chromaKey: { enabled: true, color: "#00ff00", similarity: .12, blend: .05 } })).toBe(true);
  });
});
