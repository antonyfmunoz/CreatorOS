import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("native 3D graphic pivot contract", () => {
  it("routes the authored transform origin into the native perspective filter", () => {
    const source = readFileSync(new URL("../server/cut-studio.ts", import.meta.url), "utf8");
    expect(source).toContain('import { planCutGraphicRasters, planCutPerspectiveSurface, projectCutGraphicCorners } from "./cut-graphic-geometry"');
    expect(source).toContain("projectCutGraphicCorners(transformWidth, transformHeight, point.rotationX, point.rotationY, point.perspective, graphic.anchorX ?? .5, graphic.anchorY ?? .5)");
    expect(source).toContain("projectCutGraphicCorners(surface.width, surface.height, point.rotationX, point.rotationY, point.perspective, surface.anchorX, surface.anchorY)");
    expect(source).toContain("const rotationX = transform.rotationX ?? 0;");
    expect(source).toContain("const surface = planCutPerspectiveSurface(perspectiveRasterWidth, perspectiveRasterHeight, transform3dPoints, anchorX, anchorY);");
    expect(source).toContain("overlayFilters.push(`pad=${surface.width}:${surface.height}:${surface.padX}:${surface.padY}:color=black@0`);");
  });

  it("keeps planning bounds while allowing the preview-compatible 3D origin", () => {
    const geometry = readFileSync(new URL("../server/cut-graphic-geometry.ts", import.meta.url), "utf8");
    expect(geometry).toContain("export function projectCutGraphicCorners");
    expect(geometry).not.toContain("native 3D pivot support is not implemented yet");
    expect(geometry).toContain("MAX_WORKING_PIXELS");
  });
});
