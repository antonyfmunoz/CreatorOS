import { cutRenderSettingsSchema, type CutRenderRequest } from "./cut-studio";

export const cutAudioBitrates = [96, 128, 160, 192, 256, 320] as const;
const encodingSettingsSchema = cutRenderSettingsSchema.pick({ quality: true, audioBitrateKbps: true });

/** Target encoding settings, not a claim about the measured artifact bitrate. */
export function cutRenderEncoding(input: Pick<CutRenderRequest, "quality" | "audioBitrateKbps">) {
  const settings = encodingSettingsSchema.parse(input);
  const profile = settings.quality === "draft" ? { preset: "ultrafast", crf: "28", audio: 128 }
    : settings.quality === "master" ? { preset: "medium", crf: "16", audio: 256 }
    : { preset: "veryfast", crf: "20", audio: 192 };
  const audioTargetBitrateKbps = settings.audioBitrateKbps ?? profile.audio;
  return { preset: profile.preset, crf: profile.crf, audio: `${audioTargetBitrateKbps}k`, audioTargetBitrateKbps };
}
