import { cutRenderSettingsSchema, type CutRenderRequest } from "./cut-studio";
import { cutRenderEncoding } from "./cut-render-encoding";

const schema = cutRenderSettingsSchema.pick({ quality: true, format: true, audioBitrateKbps: true });

/** Whitelisted codec/container combinations; never accept raw encoder arguments. */
export function cutOutputFormat(input: Pick<CutRenderRequest, "quality" | "format" | "audioBitrateKbps">) {
  const settings = schema.parse(input);
  const encoding = cutRenderEncoding(settings);
  if (settings.format === "webm") {
    const profile = settings.quality === "draft" ? { crf: "35", speed: "5" }
      : settings.quality === "master" ? { crf: "22", speed: "1" } : { crf: "30", speed: "3" };
    return { format: "webm" as const, mimeType: "video/webm", videoCodec: "vp9", audioCodec: "opus",
      videoArgs: ["-c:v", "libvpx-vp9", "-deadline", "good", "-cpu-used", profile.speed, "-crf", profile.crf, "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p"],
      audioArgs: ["-c:a", "libopus", "-b:a", encoding.audio, "-ar", "48000"], muxerArgs: ["-f", "webm"] };
  }
  return { format: "mp4" as const, mimeType: "video/mp4", videoCodec: "h264", audioCodec: "aac",
    videoArgs: ["-c:v", "libx264", "-preset", encoding.preset, "-crf", encoding.crf],
    audioArgs: ["-c:a", "aac", "-b:a", encoding.audio], muxerArgs: ["-movflags", "+faststart"] };
}
