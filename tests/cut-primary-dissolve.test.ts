import { describe, expect, it } from "vitest";
import { cutPrimaryPreviewAt } from "../shared/cut-primary-preview";
import type { CutEdl } from "../shared/cut-studio";

const clips: CutEdl["clips"] = [{ id: "before", start: 2, end: 4, speed: 2, timelineStart: 0 },
  { id: "after", start: 5, end: 6, timelineStart: 1, transition: "cross_dissolve" }];
describe("native-clock primary dissolves", () => {
  it("holds the preceding last output frame while fading in the incoming audio and video", () => {
    const state = cutPrimaryPreviewAt({ version: 3, clips }, 1.175, 60);
    expect(state.mix).toBeCloseTo(.5); expect(state.gain).toBeCloseTo(.5); expect(state.opacity).toBe(1);
    expect(state.sourceTime).toBeCloseTo(5.175); expect(state.outgoing?.sourceTime).toBeCloseTo(2 + 59 / 60 * 2);
    expect(state.outgoing?.clip.id).toBe("before");
    expect(cutPrimaryPreviewAt({ version: 3, clips }, 1.4).outgoing).toBeNull();
  });
  it("does not hold or replay preceding audio after its edited end", () => {
    const start = cutPrimaryPreviewAt({ version: 3, clips }, 1);
    expect(start.mix).toBe(0); expect(start.gain).toBe(0); expect(start.outgoing?.opacity).toBe(1);
  });
  it("dissolves from black after a gap and caps to half the shorter segment", () => {
    const gapped: CutEdl = { version: 3, clips: [clips[0], { ...clips[1], timelineStart: 1.2 }] };
    const state = cutPrimaryPreviewAt(gapped, 1.25);
    expect(state.mix).toBeCloseTo(.5); expect(state.outgoing).toBeNull();
    expect(cutPrimaryPreviewAt(gapped, 1.1).clip).toBeNull();
  });
  it("preserves the outgoing clip's already-faded pixels and ignores a transition on the first clip", () => {
    const value: CutEdl = { version: 3, clips: [{ ...clips[0], fadeOut: .2, transition: "cross_dissolve" }, clips[1]] };
    expect(cutPrimaryPreviewAt(value, 0).mix).toBe(1);
    expect(cutPrimaryPreviewAt(value, 1.1, 60).outgoing?.opacity).toBeCloseTo((1 / 60) / .2);
  });
});
