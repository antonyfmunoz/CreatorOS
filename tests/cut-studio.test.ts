import { describe, expect, it } from "vitest";
import { buildCmx3600Edl, buildSrtCaptions, cutDuration, cutRenderRequestSchema, detectCutCandidates, estimateCutRenderSeconds, removeCutRange, restoreCutRange, splitCutAt, validateCutEdl } from "../shared/cut-studio";

describe("CutStudio edit decision list", () => {
  it("normalizes, removes, restores and splits playable ranges", () => {
    const initial = validateCutEdl({ version: 1, clips: [{ start: 0, end: 60 }] }, 60);
    const removed = removeCutRange(initial, 10, 20, 60);
    expect(removed.clips).toMatchObject([{ start: 0, end: 10 }, { start: 20, end: 60 }]);
    expect(cutDuration(removed)).toBe(50);
    const restored = restoreCutRange(removed, 10, 20, 60);
    expect(restored.clips).toMatchObject([{ start: 0, end: 60 }]);
    expect(splitCutAt(restored, 30).clips).toMatchObject([{ start: 0, end: 30 }, { start: 30, end: 60 }]);
  });

  it("finds filler words and dead air from timestamped transcripts", () => {
    const result = detectCutCandidates({ duration: 10, language: "en", segments: [{ id: "1", start: 0, end: 10, text: "Um hello actually world", words: [{ word: "Um", start: 0, end: 0.3 }, { word: "hello", start: 0.4, end: 1 }, { word: "actually", start: 4, end: 4.5 }, { word: "world", start: 4.6, end: 5 }] }] }, 1);
    expect(result.fillerWords.map((word) => word.word)).toEqual(["Um", "actually"]);
    expect(result.silenceGaps).toEqual([{ start: 1, end: 4 }]);
  });

  it("exports a deterministic CMX3600 timeline", () => {
    const result = buildCmx3600Edl("Launch cut", { version: 1, clips: [{ start: 2, end: 4 }, { start: 8, end: 10 }] });
    expect(result).toContain("TITLE: LAUNCH CUT");
    expect(result).toContain("00:00:02:00 00:00:04:00");
    expect(result).toContain("00:00:00:00 00:00:02:00");
  });

  it("preserves per-clip controls and calculates retimed duration", () => {
    const result = validateCutEdl({ version: 2, clips: [
      { id: "intro", start: 0, end: 10, speed: 2, volume: 0.8, fadeIn: 0.5, fadeOut: 0.25 },
      { id: "main", start: 10, end: 20, speed: 0.5, volume: 1.2 },
    ] }, 20);
    expect(result.version).toBe(2);
    expect(result.clips[0]).toMatchObject({ id: "intro", speed: 2, volume: 0.8, fadeIn: 0.5, fadeOut: 0.25 });
    expect(cutDuration(result)).toBe(25);
    const split = splitCutAt(result, 15);
    expect(split.clips).toHaveLength(3);
    expect(split.clips[1]).toMatchObject({ speed: 0.5, volume: 1.2 });
  });

  it("preserves intentional sequence order for story restructuring", () => {
    const result = validateCutEdl({ version: 2, clips: [
      { id: "hook", start: 20, end: 25 },
      { id: "context", start: 0, end: 10 },
    ] }, 30);
    expect(result.clips.map((clip) => clip.id)).toEqual(["hook", "context"]);
  });

  it("exports corrected captions against the retimed output timeline", () => {
    const transcript = { duration: 20, language: "en", segments: [
      { id: "a", start: 0, end: 10, text: "Corrected opening", words: [] },
      { id: "b", start: 10, end: 20, text: "Corrected ending", words: [] },
    ] };
    const result = buildSrtCaptions(transcript, validateCutEdl({ version: 2, clips: [
      { id: "a", start: 0, end: 10, speed: 2 },
      { id: "b", start: 10, end: 20, speed: 1 },
    ] }, 20));
    expect(result).toContain("00:00:00,000 --> 00:00:05,000\nCorrected opening");
    expect(result).toContain("00:00:05,000 --> 00:00:14,999\nCorrected ending");
  });

  it("gives conservative render estimates for production profiles", () => {
    const base = { aspect: "16:9", captions: false, captionStyle: 1, cleanAudio: false, audioPreset: "original", masterGainDb: 0, quality: "draft", resolution: "720p", fps: 30 } as const;
    const draft = estimateCutRenderSeconds(60, base);
    const master = estimateCutRenderSeconds(60, { ...base, captions: true, cleanAudio: true, audioPreset: "broadcast", quality: "master", resolution: "2160p", fps: 60 });
    expect(draft).toBeGreaterThanOrEqual(5);
    expect(master).toBeGreaterThan(draft * 10);
  });

  it("models durable video and audio layers on an absolute multitrack timeline", () => {
    const brollId = "00000000-0000-4000-8000-000000000001";
    const musicId = "00000000-0000-4000-8000-000000000002";
    const result = validateCutEdl({ version: 3, clips: [
      { id: "primary", start: 0, end: 20, track: "v1", timelineStart: 0, colorPreset: "cinematic", colorAdjust: { brightness: .1, contrast: 1.1, saturation: .9, temperature: .2 } },
      { id: "broll", assetId: brollId, start: 1, end: 6, track: "v2", timelineStart: 4, transform: { x: .68, y: .62, width: .28, height: .32, opacity: .9 }, chromaKey: { enabled: true, color: "#00ff00", similarity: .12, blend: .05 } },
      { id: "music", assetId: musicId, start: 0, end: 12, track: "a1", timelineStart: 2, volume: .4, duckUnderVoice: true },
    ] }, 20);
    expect(result.version).toBe(3);
    expect(result.clips[0]).toMatchObject({ colorPreset: "cinematic", colorAdjust: expect.objectContaining({ contrast: 1.1 }) });
    expect(result.clips[1]).toMatchObject({ track: "v2", timelineStart: 4, assetId: brollId, transform: expect.objectContaining({ opacity: .9 }), chromaKey: expect.objectContaining({ enabled: true }) });
    expect(result.clips[2]).toMatchObject({ track: "a1", timelineStart: 2, volume: .4, duckUnderVoice: true });
    expect(cutDuration(result)).toBe(20);
    expect(() => validateCutEdl({ version: 3, clips: [{ start: 0, end: 2, track: "v2", transform: { x: .9, y: 0, width: .5, height: 1, opacity: 1 } }] }, 2)).toThrow(/inside the frame/i);
  });

  it("constrains professional audio finishing controls", () => {
    expect(cutRenderRequestSchema.parse({ audioPreset: "broadcast", masterGainDb: -2 })).toMatchObject({ audioPreset: "broadcast", masterGainDb: -2 });
    expect(() => cutRenderRequestSchema.parse({ audioPreset: "broadcast", masterGainDb: 13 })).toThrow();
    expect(() => cutRenderRequestSchema.parse({ audioPreset: "unsafe-filter" })).toThrow();
  });

  it("models native timed graphics and transition presets", () => {
    const result = validateCutEdl({ version: 3, clips: [
      { id: "intro", start: 0, end: 3, track: "v1", timelineStart: 0, transition: "fade_black" },
    ], graphics: [
      { id: "title", kind: "lower_third", text: "Launch day", timelineStart: .5, duration: 4, x: .08, y: .78, fontSize: 44, textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: .7 },
    ] }, 5);
    expect(result.clips[0]).toMatchObject({ transition: "fade_black" });
    expect(result.graphics).toEqual([expect.objectContaining({ text: "Launch day", kind: "lower_third" })]);
    expect(cutDuration(result)).toBe(4.5);
    expect(() => validateCutEdl({ version: 3, clips: [{ start: 0, end: 2 }], graphics: [{ id: "title", text: "Invalid", timelineStart: 0, duration: 2, textColor: "white" }] }, 2)).toThrow();
  });
});
