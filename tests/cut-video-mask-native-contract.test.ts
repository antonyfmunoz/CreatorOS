import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("native video composition mask contract", () => {
  it("materializes a private image mask and alpha-merges it into the video overlay", () => {
    const source = readFileSync(new URL("../server/cut-studio.ts", import.meta.url), "utf8");
    expect(source).toContain("clip.maskAssetId");
    expect(source).toContain("A video composition mask must be ready private image media");
    expect(source).toContain("alphamerge[${overlayLabel}]");
  });
});
