import { describe, expect, it } from "vitest";
import { cutPrimaryTimeline } from "../shared/cut-primary-timeline";
import type { CutEdl } from "../shared/cut-studio";

describe("primary timeline placement", () => {
  it("preserves leading/interior gaps, source speed, sorting and audio-only tails without mutating clips", () => {
    const edl: CutEdl = { version: 3, clips: [
      { id: "late", track: "v1", start: 0, end: 2, speed: 2, timelineStart: 3 },
      { id: "early", track: "v1", start: 0, end: 1, timelineStart: 1 },
      { id: "sound", track: "a1", start: 0, end: 1, timelineStart: 4 },
    ] };
    const before = JSON.stringify(edl);
    const plan = cutPrimaryTimeline(edl);
    expect(plan.segments.map(({ clip, start, duration }) => [clip?.id ?? "blank", start, duration])).toEqual([
      ["blank", 0, 1], ["early", 1, 1], ["blank", 2, 1], ["late", 3, 1], ["blank", 4, 1],
    ]);
    expect(plan.duration).toBe(5); expect(plan.requiresTimeline).toBe(true); expect(JSON.stringify(edl)).toBe(before);
  });
  it("keeps contiguous primary edits on their original fast path", () => {
    expect(cutPrimaryTimeline({ version: 3, clips: [{ start: 0, end: 1, timelineStart: 0 }, { start: 1, end: 2, timelineStart: 1 }] }).requiresTimeline).toBe(false);
  });
  it("rejects ambiguous overlapping primary clips instead of concatenating them at the wrong time", () => {
    expect(() => cutPrimaryTimeline({ version: 3, clips: [{ start: 0, end: 2, timelineStart: 0 }, { start: 0, end: 1, timelineStart: 1 }] })).toThrow("Primary video clips overlap");
  });
});
