import { describe, expect, it } from "vitest";
import { buildCmx3600Edl, cutDuration, detectCutCandidates, removeCutRange, restoreCutRange, splitCutAt, validateCutEdl } from "../shared/cut-studio";

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
});
