import { describe, expect, it } from "vitest";
import { cutPrimaryAudioPreviewAt } from "../shared/cut-primary-audio-preview";
import type { CutEdl } from "../shared/cut-studio";

describe("primary timeline audio preview", () => {
  const edl: CutEdl = { version: 3, clips: [
    { id: "music", track: "a1", start: 4, end: 12, timelineStart: 2, speed: 2, volume: .8, volumeKeyframes: [{ at: 2, volume: .4, easing: "linear" }] },
    { id: "voice", track: "a2", start: 0, end: 8, timelineStart: 1, duckUnderVoice: true },
  ], tracks: [
    { track: "a1", gain: .5, muted: false, hidden: false, locked: false, solo: false, bus: "music" },
    { track: "a2", gain: 1, muted: false, hidden: false, locked: false, solo: false },
  ], audioBuses: [{ id: "music", name: "Music", gain: .5, muted: false }] };

  it("uses edited time, speed, automation and routed gain for active audio", () => {
    const state = cutPrimaryAudioPreviewAt(edl, 3);
    expect(state.items.find((item) => item.clip.id === "music")).toMatchObject({ track: "a1", sourceTime: 6, speed: 2 });
    expect(state.items.find((item) => item.clip.id === "music")?.gain).toBeCloseTo(.15);
    expect(state.items.find((item) => item.clip.id === "voice")).toMatchObject({ track: "a2", sourceTime: 2, speed: 1, gain: 1 });
    expect(state.requiresRenderedDucking).toBe(true);
  });

  it("honors mute and solo routing without pretending a silent track is active", () => {
    expect(cutPrimaryAudioPreviewAt({ ...edl, tracks: edl.tracks!.map((track) => track.track === "a1" ? { ...track, muted: true } : track) }, 3).items.map((item) => item.track)).toEqual(["a2"]);
    expect(cutPrimaryAudioPreviewAt({ ...edl, tracks: edl.tracks!.map((track) => ({ ...track, solo: track.track === "a1" })) }, 3).items.map((item) => item.track)).toEqual(["a1"]);
  });
});
