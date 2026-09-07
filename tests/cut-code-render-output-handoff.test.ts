import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(new URL("../client/src/components/cut/CutStudioCreativeRuntime.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/cut-studio.tsx", import.meta.url), "utf8");

describe("CutStudio local code-render output handoff", () => {
  it("makes sealed stills and videos directly usable after their private media record exists", () => {
    expect(runtime).toContain("onUseCodeRenderOutput?: (media: ProjectMediaInput) => void");
    expect(runtime).toContain('job.mode === "video" || job.mode === "still"');
    expect(runtime).toContain('"Add to timeline"');
    expect(runtime).toContain('"Add as graphic"');
    expect(runtime).toContain("The render is syncing into this project's private media library");
    expect(runtime).toContain("previewCodeRenderId");
    expect(runtime).toContain('aria-label={`Preview ${reusableOutput.name}`}');
    expect(runtime).toContain("/media-library/${encodeURIComponent(reusableOutput.id)}/media-file");
  });

  it("routes videos to a timeline layer and stills to the private image-graphic renderer", () => {
    expect(page).toContain("onUseCodeRenderOutput={(media) =>");
    expect(page).toContain('media.mediaKind === "video") addMediaClip(media)');
    expect(page).toContain('media.mediaKind === "image") addImageGraphic(media)');
  });
});
