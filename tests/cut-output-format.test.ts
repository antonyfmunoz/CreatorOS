import { describe, expect, it } from "vitest";
import { cutOutputFormat } from "../shared/cut-output-format";
import { cutRenderSettingsSchema } from "../shared/cut-studio";
import { cutRenderWorkspacePaths } from "../server/cut-render-paths";

describe("native output container contracts", () => {
  it("preserves MP4 and its existing profile by default", () => {
    expect(cutRenderSettingsSchema.parse({})).not.toHaveProperty("format");
    expect(cutOutputFormat({ quality: "social" })).toEqual({ format: "mp4", mimeType: "video/mp4", videoCodec: "h264", audioCodec: "aac",
      videoArgs: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"], audioArgs: ["-c:a", "aac", "-b:a", "192k"], muxerArgs: ["-movflags", "+faststart"] });
  });
  it("pairs VP9 with Opus/WebM and codec-specific quality settings", () => {
    const output = cutOutputFormat({ quality: "master", format: "webm", audioBitrateKbps: 256 });
    expect(output).toMatchObject({ format: "webm", mimeType: "video/webm", videoCodec: "vp9", audioCodec: "opus",
      audioArgs: ["-c:a", "libopus", "-b:a", "256k", "-ar", "48000"], muxerArgs: ["-f", "webm"] });
    expect(output.videoArgs).toContain("libvpx-vp9"); expect(output.videoArgs).not.toContain("-preset");
    expect(output.videoArgs.slice(output.videoArgs.indexOf("-crf"), output.videoArgs.indexOf("-crf") + 2)).toEqual(["-crf", "22"]);
  });
  it("uses separate input/output paths for both containers and rejects arbitrary extensions", () => {
    for (const format of ["mp4", "webm"] as const) {
      const paths = cutRenderWorkspacePaths("fixture", "input-source", `render-output.${format}`, format);
      expect(paths.outputName).toBe(`input-source.${format}`);
      expect(paths.outputPath.endsWith(`render-output.${format}`)).toBe(true);
      expect(paths.sourcePath).not.toBe(paths.outputPath);
    }
    for (const format of ["mov", "../mp4", "webm -i private", null, 1, {}]) {
      expect(cutRenderSettingsSchema.safeParse({ format }).success).toBe(false);
      expect(() => cutOutputFormat({ quality: "social", format } as never)).toThrow();
      expect(() => cutRenderWorkspacePaths("fixture", "render", "source.mp4", format as never)).toThrow();
    }
  });
});
