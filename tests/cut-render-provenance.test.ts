import { describe, expect, it } from "vitest";
import { cutRenderTimelineProvenance, cutRenderTimelineProvenanceLabel } from "../shared/cut-render-provenance";

const receipt = { timelineSnapshot: "captured", timelineRevision: 7, timelineSha256: "a".repeat(64) };

describe("CutStudio rendered-timeline provenance", () => {
  it("only calls a completed render current when its immutable server snapshot matches the saved draft", () => {
    expect(cutRenderTimelineProvenance(receipt, 7, false)).toBe("current");
    expect(cutRenderTimelineProvenance(receipt, 8, false)).toBe("stale");
    expect(cutRenderTimelineProvenance(receipt, 7, true)).toBe("stale");
  });

  it("never guesses provenance for legacy or non-timeline outputs", () => {
    expect(cutRenderTimelineProvenance({ timelineSnapshot: "composition", timelineRevision: 7, timelineSha256: "a".repeat(64) }, 7, false)).toBe("unknown");
    expect(cutRenderTimelineProvenance({ timelineSnapshot: "captured", timelineRevision: 7, timelineSha256: "short" }, 7, false)).toBe("unknown");
    expect(cutRenderTimelineProvenance(undefined, 7, false)).toBe("unknown");
    expect(cutRenderTimelineProvenanceLabel("current", 7)).toBe("Matches saved timeline revision 7");
  });
});
