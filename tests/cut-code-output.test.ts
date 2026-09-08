import { describe, expect, it } from "vitest";
import { describeCutCodeOutput } from "../shared/cut-code-output";

describe("CutStudio local code-output custody contract", () => {
  it("derives sealed ProRes and audio media types from a bounded format allowlist", () => {
    expect(describeCutCodeOutput({ mode: "video", format: "mov" })).toEqual({ format: "mov", mimeType: "video/quicktime", filename: "cutstudio-code-render.mov", assetKind: "video" });
    expect(describeCutCodeOutput({ mode: "video", format: "gif" })).toEqual({ format: "gif", mimeType: "image/gif", filename: "cutstudio-code-render.gif", assetKind: "image" });
    expect(describeCutCodeOutput({ mode: "audio", format: "m4a" })).toEqual({ format: "m4a", mimeType: "audio/mp4", filename: "cutstudio-code-render.m4a", assetKind: "audio" });
    expect(describeCutCodeOutput({ mode: "sequence", format: "png" })).toEqual({ format: "zip", mimeType: "application/zip", filename: "cutstudio-code-render.zip", assetKind: "file" });
  });

  it("does not infer a media kind for unknown modes or MIME types", () => {
    expect(() => describeCutCodeOutput({ mode: "video", format: "avi" })).toThrow(/supported output format/);
    expect(() => describeCutCodeOutput({ mode: "archive", format: "zip" })).toThrow(/supported output mode/);
  });
});
