import { describe, expect, it } from "vitest";
import { cutPrimaryPreviewAt } from "../shared/cut-primary-preview";
import type { CutEdl } from "../shared/cut-studio";

describe("primary preview clock", () => {
  const edl: CutEdl = { version: 3, clips: [
    { id: "late", track: "v1", start: 4, end: 6, timelineStart: 3, speed: 2, volume: .5 },
    { id: "early", track: "v1", start: 2, end: 3, timelineStart: 1 },
    { id: "tail", track: "a1", start: 0, end: 1, timelineStart: 4 },
  ] };
  it("seeks source offsets on the edited clock, not the original recording clock", () => {
    expect(cutPrimaryPreviewAt(edl, 1.5)).toMatchObject({ clip: { id: "early" }, sourceTime: 2.5, speed: 1 });
    expect(cutPrimaryPreviewAt(edl, 3.5)).toMatchObject({ clip: { id: "late" }, sourceTime: 5, speed: 2, gain: .5 });
    for (const time of [0, .5, 2, 2.5, 4, 4.5, 5, 10]) expect(cutPrimaryPreviewAt(edl, time).clip).toBeNull();
    expect(cutPrimaryPreviewAt(edl, NaN).time).toBe(0);
  });
  it("evaluates fades and track mute/gain on the same local clock as export", () => {
    const mixed: CutEdl = { ...edl, clips: edl.clips.map((clip) => clip.id === "early" ? { ...clip, fadeIn: 1 } : clip),
      tracks: [{ track: "v1", gain: .5, muted: false, hidden: false, locked: false, solo: false }] };
    // Native export caps either fade to half the edited clip duration.
    expect(cutPrimaryPreviewAt(mixed, 1.25)).toMatchObject({ gain: .25, opacity: .5 });
    expect(cutPrimaryPreviewAt(mixed, 1.5).gain).toBeCloseTo(.5);
    mixed.tracks![0].muted = true;
    expect(cutPrimaryPreviewAt(mixed, 1.5).gain).toBe(0);
  });
});
