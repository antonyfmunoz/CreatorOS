import { describe, expect, it } from "vitest";
import { cutRenderSettingsSchema } from "../shared/cut-studio";
import { cutAudioBitrates, cutRenderEncoding } from "../shared/cut-render-encoding";

describe("native render encoding settings", () => {
  it("preserves all existing quality-profile defaults", () => {
    expect(cutRenderEncoding({ quality: "draft" })).toEqual({ preset: "ultrafast", crf: "28", audio: "128k", audioTargetBitrateKbps: 128 });
    expect(cutRenderEncoding({ quality: "social" })).toEqual({ preset: "veryfast", crf: "20", audio: "192k", audioTargetBitrateKbps: 192 });
    expect(cutRenderEncoding({ quality: "master" })).toEqual({ preset: "medium", crf: "16", audio: "256k", audioTargetBitrateKbps: 256 });
    expect(cutRenderSettingsSchema.parse({})).not.toHaveProperty("audioBitrateKbps");
  });
  it("lets every allowed audio target override without changing video encoding", () => {
    for (const audioBitrateKbps of cutAudioBitrates) {
      const parsed = cutRenderSettingsSchema.parse({ quality: "draft", audioBitrateKbps });
      expect(cutRenderEncoding(parsed)).toEqual({ preset: "ultrafast", crf: "28", audio: `${audioBitrateKbps}k`, audioTargetBitrateKbps: audioBitrateKbps });
    }
  });
  it("rejects malformed or unsupported targets rather than forwarding encoder text", () => {
    for (const audioBitrateKbps of [0, 95, 97, 320.5, 512, Infinity, NaN, null, "192k", "192k -i private", {}]) {
      expect(cutRenderSettingsSchema.safeParse({ audioBitrateKbps }).success).toBe(false);
      expect(() => cutRenderEncoding({ quality: "social", audioBitrateKbps } as never)).toThrow();
    }
  });
});
