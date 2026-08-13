import { describe, expect, it } from "vitest";
import { applyTranscriptStoryOrder, audioRmsDb, breakApartCutCompound, buildCmx3600Edl, buildKineticAssCaptions, buildSrtCaptions, createCutCompound, cutDuration, cutRenderRequestSchema, cutTimelinePoints, detectCutCandidates, estimateCutRenderSeconds, groupCutClips, moveCutClipGroup, parseCubeLut, removeCutRange, restoreCutRange, rollCutEdit, slipCutClip, snapCutTime, splitCutAt, trimCutClip, ungroupCutClips, validateCutEdl } from "../shared/cut-studio";

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

  it("builds animated word-level captions against the retimed output timeline", () => {
    const transcript = { duration: 8, language: "en", segments: [{ id: "a", start: 0, end: 8, text: "Ship better", words: [{ word: "Ship", start: 0, end: 1 }, { word: "better", start: 2, end: 4 }] }] };
    const result = buildKineticAssCaptions(transcript, validateCutEdl({ version: 3, clips: [{ id: "a", start: 0, end: 8, speed: 2 }] }, 8));
    expect(result).toContain("[V4+ Styles]");
    expect(result).toContain("\\fscx68");
    expect(result).toContain("Dialogue: 0,0:00:00.00,0:00:00.50");
    expect(result).toContain("Dialogue: 0,0:00:01.00,0:00:02.00");
  });

  it("validates bounded three-dimensional cube LUTs", () => {
    const cube = `TITLE "Green transform"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n${Array.from({ length: 8 }, () => "0 1 0").join("\n")}`;
    expect(parseCubeLut(cube)).toEqual({ title: "Green transform", size: 2, entryCount: 8 });
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0")).toThrow(/expected 8/i);
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n<script>")).toThrow(/unsupported/i);
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
      { id: "chapter", start: 3, end: 5, track: "v1", timelineStart: 3, transition: "cross_dissolve" },
    ], graphics: [
      { id: "title", kind: "lower_third", text: "Launch day", timelineStart: .5, duration: 4, x: .08, y: .78, fontSize: 44, textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: .7 },
    ] }, 5);
    expect(result.clips[0]).toMatchObject({ transition: "fade_black" });
    expect(result.clips[1]).toMatchObject({ transition: "cross_dissolve" });
    expect(result.graphics).toEqual([expect.objectContaining({ text: "Launch day", kind: "lower_third" })]);
    expect(cutDuration(result)).toBe(5);
    expect(() => validateCutEdl({ version: 3, clips: [{ start: 0, end: 2 }], graphics: [{ id: "title", text: "Invalid", timelineStart: 0, duration: 2, textColor: "white" }] }, 2)).toThrow();
  });

  it("persists timeline markers and snaps edits to meaningful boundaries", () => {
    const edl = validateCutEdl({ version: 3, clips: [
      { id: "primary", start: 0, end: 10, track: "v1", timelineStart: 0 },
      { id: "overlay", start: 0, end: 2, track: "v2", timelineStart: 4 },
    ], graphics: [
      { id: "title", text: "Opening", timelineStart: 2, duration: 1 },
    ], markers: [
      { id: "beat", label: "Music beat", position: 5.5, kind: "beat", color: "#f43f5e" },
    ] }, 10);

    expect(edl.markers).toEqual([expect.objectContaining({ label: "Music beat", position: 5.5 })]);
    expect(cutTimelinePoints(edl)).toEqual(expect.arrayContaining([0, 2, 3, 4, 5.5, 6, 10]));
    expect(snapCutTime(edl, 5.42)).toBe(5.5);
    expect(snapCutTime(edl, 5.2)).toBe(5.2);
  });

  it("groups clips for synchronized movement and can ungroup them", () => {
    const initial = validateCutEdl({ version: 3, clips: [
      { id: "camera", start: 0, end: 4, track: "v2", timelineStart: 2 },
      { id: "mic", start: 0, end: 4, track: "a1", timelineStart: 2 },
      { id: "music", start: 0, end: 8, track: "a2", timelineStart: 0 },
    ], markers: [{ id: "chapter", label: "Chapter", position: 5, kind: "chapter", color: "#1d9bf0" }] }, 8);
    const grouped = groupCutClips(initial, ["camera", "mic"], "guest_pair");
    expect(grouped.clips.slice(0, 2).map((clip) => clip.groupId)).toEqual(["guest_pair", "guest_pair"]);

    const moved = moveCutClipGroup(grouped, "camera", 4.92, true);
    expect(moved.clips.find((clip) => clip.id === "camera")?.timelineStart).toBe(5);
    expect(moved.clips.find((clip) => clip.id === "mic")?.timelineStart).toBe(5);
    expect(moved.clips.find((clip) => clip.id === "music")?.timelineStart).toBe(0);

    const ungrouped = ungroupCutClips(moved, ["camera"]);
    expect(ungrouped.clips.slice(0, 2).map((clip) => clip.groupId)).toEqual([undefined, undefined]);
  });

  it("measures realtime unsigned audio samples in dBFS", () => {
    expect(audioRmsDb(new Uint8Array(128).fill(128))).toBe(-60);
    expect(audioRmsDb(new Uint8Array([0, 255]))).toBeCloseTo(-0.03, 1);
    expect(audioRmsDb(new Uint8Array([96, 160]))).toBeCloseTo(-12.04, 1);
    expect(audioRmsDb(new Uint8Array())).toBe(-60);
  });

  it("performs precise edge trims and track-local ripple edits", () => {
    const initial = validateCutEdl({ version: 3, clips: [
      { id: "intro", start: 0, end: 4, track: "v1", timelineStart: 0 },
      { id: "main", start: 4, end: 8, track: "v1", timelineStart: 4 },
      { id: "overlay", start: 0, end: 2, track: "v2", timelineStart: 4 },
    ] }, 10);
    const leftTrim = trimCutClip(initial, "intro", "start", 1, { sourceDuration: 10 });
    expect(leftTrim.clips[0]).toMatchObject({ start: 1, end: 4, timelineStart: 1 });
    expect(leftTrim.clips[1].timelineStart).toBe(4);

    const regularOut = trimCutClip(initial, "intro", "end", 3, { sourceDuration: 10 });
    expect(regularOut.clips[0].end).toBe(3);
    expect(regularOut.clips[1].timelineStart).toBe(4);

    const rippleOut = trimCutClip(initial, "intro", "end", 3, { rippleTrack: true, sourceDuration: 10 });
    expect(rippleOut.clips[0].end).toBe(3);
    expect(rippleOut.clips[1].timelineStart).toBe(3);
    expect(rippleOut.clips[2].timelineStart).toBe(4);
  });

  it("ripples linked tracks, graphics and markers after the edited boundary", () => {
    const initial = validateCutEdl({ version: 3, clips: [
      { id: "intro", start: 0, end: 4, track: "v1", timelineStart: 0 },
      { id: "main", start: 4, end: 8, track: "v1", timelineStart: 4 },
      { id: "camera", start: 0, end: 2, track: "v2", timelineStart: 4 },
      { id: "overlap", start: 0, end: 5, track: "a1", timelineStart: 1 },
    ], graphics: [{ id: "title", text: "Next", timelineStart: 4, duration: 1 }], markers: [{ id: "chapter", label: "Next", position: 4, kind: "chapter", color: "#1d9bf0" }] }, 10);
    const result = trimCutClip(initial, "intro", "end", 3, { rippleMode: "linked", sourceDuration: 10 });
    expect(result.clips.find((clip) => clip.id === "main")?.timelineStart).toBe(3);
    expect(result.clips.find((clip) => clip.id === "camera")?.timelineStart).toBe(3);
    expect(result.clips.find((clip) => clip.id === "overlap")?.timelineStart).toBe(1);
    expect(result.graphics?.[0].timelineStart).toBe(3);
    expect(result.markers?.[0].position).toBe(3);
  });

  it("rolls an adjacent edit point without changing the pair's outer duration", () => {
    const initial = validateCutEdl({ version: 3, clips: [
      { id: "left", start: 1, end: 5, track: "v1", timelineStart: 0 },
      { id: "right", start: 2, end: 8, track: "v1", timelineStart: 4 },
      { id: "other", start: 0, end: 3, track: "a1", timelineStart: 4 },
    ] }, 10);
    const result = rollCutEdit(initial, "left", 5, { leftSourceDuration: 10 });
    expect(result.clips.find((clip) => clip.id === "left")).toMatchObject({ start: 1, end: 6, timelineStart: 0 });
    expect(result.clips.find((clip) => clip.id === "right")).toMatchObject({ start: 3, end: 8, timelineStart: 5 });
    expect(result.clips.find((clip) => clip.id === "other")?.timelineStart).toBe(4);
    expect(cutDuration(result)).toBe(cutDuration(initial));
  });

  it("slips source media while preserving placement and output duration", () => {
    const initial = validateCutEdl({ version: 3, clips: [{ id: "take", start: 2, end: 6, track: "v2", timelineStart: 8 }] }, 12);
    const slipped = slipCutClip(initial, "take", 3, 12);
    expect(slipped.clips[0]).toMatchObject({ start: 5, end: 9, timelineStart: 8 });
    expect(cutDuration(slipped)).toBe(cutDuration(initial));
    expect(slipCutClip(slipped, "take", 10, 12).clips[0]).toMatchObject({ start: 8, end: 12, timelineStart: 8 });
    expect(slipCutClip(initial, "take", -10, 12).clips[0]).toMatchObject({ start: 0, end: 4, timelineStart: 8 });
  });

  it("persists compound clips and moves their flattened render members together", () => {
    const initial = validateCutEdl({ version: 3, clips: [
      { id: "camera", start: 0, end: 4, track: "v2", timelineStart: 2 },
      { id: "mic", start: 0, end: 4, track: "a1", timelineStart: 2 },
      { id: "music", start: 0, end: 8, track: "a2", timelineStart: 0 },
    ] }, 8);
    const compound = createCutCompound(initial, ["camera", "mic"], "Interview angle", "compound_interview");
    expect(validateCutEdl(compound, 8).compounds).toEqual([{ id: "compound_interview", label: "Interview angle", clipIds: ["camera", "mic"], collapsed: true }]);
    const moved = moveCutClipGroup(compound, "camera", 4, false);
    expect(moved.clips.find((clip) => clip.id === "camera")?.timelineStart).toBe(4);
    expect(moved.clips.find((clip) => clip.id === "mic")?.timelineStart).toBe(4);
    expect(moved.clips.find((clip) => clip.id === "music")?.timelineStart).toBe(0);
    expect(breakApartCutCompound(moved, ["mic"]).compounds).toEqual([]);

    const splitSource = createCutCompound(validateCutEdl({ version: 3, clips: [
      { id: "primary", start: 0, end: 4, track: "v1", timelineStart: 0 },
      { id: "mic", start: 0, end: 4, track: "a1", timelineStart: 0 },
    ] }, 4), ["primary", "mic"], "Linked take", "compound_take");
    expect(splitCutAt(splitSource, 2).compounds?.[0].clipIds).toEqual(["primary_a", "primary_b", "mic"]);
  });

  it("turns speaker-labeled transcript order into the primary story timeline", () => {
    const initial = validateCutEdl({ version: 3, clips: [
      { id: "primary", label: "Primary", start: 0, end: 10, track: "v1", timelineStart: 0, colorPreset: "cinematic" },
      { id: "music", start: 0, end: 5, track: "a1", timelineStart: 0 },
    ] }, 10);
    const transcript = { duration: 10, language: "en", segments: [
      { id: "close", start: 6, end: 9, text: "Call to action", speaker: "Host", words: [] },
      { id: "hook", start: 1, end: 3, text: "The hook", speaker: "Guest", words: [] },
    ] };
    const result = applyTranscriptStoryOrder(initial, transcript);
    expect(result.clips.slice(0, 2)).toMatchObject([
      { id: "story_close_0", start: 6, end: 9, timelineStart: 0, label: "Host: Call to action", colorPreset: "cinematic" },
      { id: "story_hook_1", start: 1, end: 3, timelineStart: 3, label: "Guest: The hook", colorPreset: "cinematic" },
    ]);
    expect(result.clips[2]).toMatchObject({ id: "music", track: "a1", timelineStart: 0 });
    expect(buildSrtCaptions(transcript, result)).toContain("Host: Call to action");
  });

  it("validates durable render-effective track controls", () => {
    const result = validateCutEdl({ version: 3, clips: [
      { id: "primary", start: 0, end: 4, track: "v1", timelineStart: 0 },
      { id: "music", start: 0, end: 4, track: "a1", timelineStart: 0 },
    ], tracks: [
      { track: "v1", locked: true, hidden: false, muted: true, solo: false, gain: .8 },
      { track: "a1", locked: false, hidden: false, muted: false, solo: true, gain: .5 },
      { track: "a2", locked: false, hidden: false, muted: false, solo: false, gain: 1 },
    ] }, 4);
    expect(result.tracks).toEqual([
      { track: "v1", locked: true, hidden: false, muted: true, solo: false, gain: .8 },
      { track: "a1", locked: false, hidden: false, muted: false, solo: true, gain: .5 },
    ]);
    expect(() => validateCutEdl({ version: 3, clips: [{ start: 0, end: 2, track: "v1" }], tracks: [{ track: "v1", gain: 3 }] }, 2)).toThrow();
  });
});
