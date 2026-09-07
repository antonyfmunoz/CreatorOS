import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("CutStudio primary caption preview UI", () => {
  it("receives the current render settings and paints the active source-time caption", () => {
    const primary = readFileSync(new URL("../client/src/components/cut/CutStudioPrimaryPreview.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../client/src/pages/cut-studio.tsx", import.meta.url), "utf8");
    expect(primary).toContain("<PrimaryCaptions transcript={transcript} sourceSeconds={state?.sourceTime ?? null} enabled={captions} style={captionStyle}/>");
    expect(primary).toContain("data-primary-preview-caption-style={style}");
    expect(page).toContain("transcript={project.transcript} captions={captions} captionStyle={captionStyle}");
  });
});
