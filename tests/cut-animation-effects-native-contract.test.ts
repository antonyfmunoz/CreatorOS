import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { bakeCutAnimationGlowAndShadowFrames } from "../server/cut-animation-effects";

describe("CutStudio native animation effect contract", () => {
  it("bakes a visible shadow into every isolated animation frame without altering the source sequence", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-cut-animation-effects-"));
    try {
      const source = path.join(directory, "frame-000000.png");
      await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 8, top: 8 }])
        .png().toFile(source);
      const outputPattern = await bakeCutAnimationGlowAndShadowFrames({
        graphic: { effects: [{ kind: "drop_shadow", parameters: { x: 6, y: 6, blur: 1, color: "#00ff00" } }] },
        pattern: path.join(directory, "frame-%06d.png"), frameCount: 1, width: 32, height: 32, outputDirectory: path.join(directory, "styled"),
      });
      expect(outputPattern).toBe(path.join(directory, "styled", "frame-%06d.png"));
      const [sourcePixels, styledPixels] = await Promise.all([sharp(source).ensureAlpha().raw().toBuffer(), sharp(path.join(directory, "styled", "frame-000000.png")).ensureAlpha().raw().toBuffer()]);
      // The derived shadow reaches beyond the original red square while the
      // original sequence remains transparent at the same pixel.
      const shadowOffset = (18 * 32 + 18) * 4;
      expect(sourcePixels[shadowOffset + 3]).toBe(0);
      expect(styledPixels[shadowOffset + 3]).toBeGreaterThan(0);
      expect(sourcePixels[shadowOffset]).toBe(0);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});
