import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../server/cut-studio.ts", import.meta.url), "utf8");

describe("CutStudio native animation effect contract", () => {
  it("decorates isolated animation frame sequences with native glow and shadow before FFmpeg composes them", () => {
    expect(source).toContain("async function bakeAnimationGlowAndShadowFrames");
    expect(source).toContain('patternName.replace("%06d", String(frame).padStart(6, "0"))');
    expect(source).toContain("const framePattern = await bakeAnimationGlowAndShadowFrames");
    expect(source).toContain("rasterGraphicInputs.push({ path: framePattern, animated: true })");
  });

  it("keeps private animation masks explicitly unavailable instead of silently omitting them", () => {
    expect(source).toContain('if (maskAssetId) throw new Error("Animation layers cannot use private masks yet")');
    expect(source).not.toContain("Animation layers cannot use baked masks, shadows, or glows");
  });
});
