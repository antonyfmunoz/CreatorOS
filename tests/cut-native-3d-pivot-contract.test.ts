import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("native 3D graphic pivot contract", () => {
  it("routes the authored transform origin into the native perspective filter", () => {
    const source = readFileSync(new URL("../server/cut-studio.ts", import.meta.url), "utf8");
    expect(source).toContain('import { planCutGraphicRasters, projectCutGraphicCorners } from "./cut-graphic-geometry"');
    expect(source).toContain("projectCutGraphicCorners(transformWidth, transformHeight, point.rotationX, point.rotationY, point.perspective, graphic.anchorX ?? .5, graphic.anchorY ?? .5)");
  });

  it("keeps planning bounds while allowing the preview-compatible 3D origin", () => {
    const geometry = readFileSync(new URL("../server/cut-graphic-geometry.ts", import.meta.url), "utf8");
    expect(geometry).toContain("export function projectCutGraphicCorners");
    expect(geometry).not.toContain("native 3D pivot support is not implemented yet");
    expect(geometry).toContain("MAX_WORKING_PIXELS");
  });
});
