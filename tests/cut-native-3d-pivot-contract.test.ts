import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("native 3D graphic pivot contract", () => {
  it("routes the authored transform origin into the native perspective filter", () => {
    const source = readFileSync(new URL("../server/cut-studio.ts", import.meta.url), "utf8");
    expect(source).toContain('import { planCutGraphicRasters, planCutPerspectiveSurface, projectCutGraphicCorners } from "./cut-graphic-geometry"');
    expect(source).toContain("projectCutGraphicCorners(transformWidth, transformHeight, point.rotationX, point.rotationY, point.perspective, graphic.anchorX ?? .5, graphic.anchorY ?? .5)");
    expect(source).toContain("projectCutGraphicCorners(surface.width, surface.height, point.rotationX, point.rotationY, point.perspective, surface.anchorX, surface.anchorY)");
    expect(source).toContain("const rotationX = transform.rotationX ?? 0;");
    // Alpha-matte effects expand the native surface. The authored pivot must
    // move into that surface before 3D projection; using the old raw anchor
    // would make the media rotate around the padded canvas instead.
    expect(source).toContain("const surfaceAnchorX = (alphaSurface.padding.left + anchorX * coreWidth) / sourceSurfaceWidth;");
    expect(source).toContain("const surfaceAnchorY = (alphaSurface.padding.top + anchorY * coreHeight) / sourceSurfaceHeight;");
    expect(source).toContain("const surface = planCutPerspectiveSurface(perspectiveRasterWidth, perspectiveRasterHeight, transform3dPoints, surfaceAnchorX, surfaceAnchorY);");
    expect(source).toContain("overlayFilters.push(`pad=${surface.width}:${surface.height}:${surface.padX}:${surface.padY}:color=black@0`);");
  });

  it("keeps planning bounds while allowing the preview-compatible 3D origin", () => {
    const geometry = readFileSync(new URL("../server/cut-graphic-geometry.ts", import.meta.url), "utf8");
    expect(geometry).toContain("export function projectCutGraphicCorners");
    expect(geometry).not.toContain("native 3D pivot support is not implemented yet");
    expect(geometry).toContain("MAX_WORKING_PIXELS");
  });

  it("expands a transparent alpha surface before blurring media glow or shadow", () => {
    const source = readFileSync(new URL("../server/cut-studio.ts", import.meta.url), "utf8");
    expect(source).toContain('"format=rgba", `pad=${overlayWidth}:${overlayHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0`]');
    expect(source).toContain('`[${label}base]format=rgba,pad=${surfaceWidth}:${surfaceHeight}:${padding.left}:${padding.top}:color=black@0[${label}content]`');
    expect(source).toContain('`[${label}effect${effectIndex}]format=rgba,alphaextract,pad=${surfaceWidth}:${surfaceHeight}:${padding.left + effect.x}:${padding.top + effect.y}:color=black${sigma > 0 ? `,gblur=sigma=${sigma}:steps=2:planes=1` : ""}[${alphaLabel}]`');
    expect(source).toContain('`color=c=0x${effect.color.slice(1)}@${effect.kind === "glow" ? ".9" : ".8"}:s=${surfaceWidth}x${surfaceHeight}:r=${fps}:d=${Number(duration.toFixed(5))},format=rgba,setpts=PTS+${Number(timelineStart.toFixed(5))}/TB[${colorLabel}]`');
  });
});
