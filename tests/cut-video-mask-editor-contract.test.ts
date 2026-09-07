import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CutStudio video mask editor", () => {
  it("lets an editor select a private image mask and previews it on visual overlays", () => {
    const page = readFileSync(new URL("../client/src/pages/cut-studio.tsx", import.meta.url), "utf8");
    const preview = readFileSync(new URL("../client/src/components/cut/CutStudioPrimaryPreview.tsx", import.meta.url), "utf8");
    expect(page).toContain('aria-label="Clip composition mask"');
    expect(page).toContain('media.mediaKind === "image"');
    expect(page).toContain('maskAssetId: event.target.value || undefined');
    expect(preview).toContain('data-primary-preview-mask');
    expect(preview).toContain('WebkitMaskImage');
  });
});
