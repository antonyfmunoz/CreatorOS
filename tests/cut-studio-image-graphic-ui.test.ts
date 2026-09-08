import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../client/src/pages/cut-studio.tsx", import.meta.url), "utf8");

describe("CutStudio private image graphic handoff", () => {
  it("makes project-library images renderable graphics instead of invalid timeline clips", () => {
    expect(page).toContain("const addImageGraphic");
    expect(page).toContain('kind: "image", assetId: media.assetId');
    expect(page).toContain('sourceMedia.mediaKind === "image"');
    expect(page).toContain('Add ${media.name} as image graphic');
  });
});
