import { describe, it, expect } from "vitest";
import { cutDuration, updateCutTrackSettings, validateCutEdl } from "../shared/cut-studio";

describe("legacy primary-track controls", () => {
  it("preserves sequential timing, trims and clip gain when upgrading for a mixer change", () => {
    const old = validateCutEdl({ version: 2, clips: [{ start: 2, end: 6, speed: 2, volume: .4 }, { start: 7, end: 9, speed: .5 }] }, 10);
    const changed = updateCutTrackSettings(old, "v1", { gain: .25, muted: true }, 10);
    expect(changed.version).toBe(3);
    expect(cutDuration(changed)).toBe(cutDuration(old));
    expect(changed.clips.map((clip) => clip.timelineStart)).toEqual([0, 2]);
    expect(changed.clips.map(({ start, end, speed, volume }) => ({ start, end, speed, volume }))).toEqual(old.clips.map(({ start, end, speed, volume }) => ({ start, end, speed, volume })));
    expect(changed.tracks).toEqual([{ track: "v1", gain: .25, muted: true, locked: false, hidden: false, solo: false }]);
    expect(old.version).toBe(2); expect(old.tracks).toEqual([]);
    expect(updateCutTrackSettings(changed, "v1", { locked: true }, 10).tracks?.[0]).toMatchObject({ gain: .25, muted: true, locked: true });
    expect(() => updateCutTrackSettings(old, "a8", { gain: 1 }, 10)).toThrow();
    expect(() => updateCutTrackSettings(old, "v1", { gain: 100 }, 10)).toThrow();
  });
  it("retains longer associated media when changing an existing multitrack mixer", () => {
    const edit = validateCutEdl({ version: 3, clips: [{ start: 0, end: 3, track: "v1" }, { start: 20, end: 30, track: "a1", timelineStart: 1 }] }, 30);
    const updated = updateCutTrackSettings(edit, "a1", { gain: .5 }, 30);
    expect(updated.clips).toEqual(edit.clips);
    expect(updated.tracks?.[0]).toMatchObject({ track: "a1", gain: .5 });
  });
});
