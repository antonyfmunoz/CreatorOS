import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../client/src/pages/cut-studio.tsx", import.meta.url), "utf8");

describe("CutStudio authoritative rendered monitor", () => {
  it("does not imply that a completed render represents a newer or unsaved timeline", () => {
    expect(page).toContain("cutRenderTimelineProvenance(latestCompletedRender?.output, revision, timelineAwaitingSave)");
    expect(page).toContain('data-rendered-timeline-provenance={timelineMonitorMode === "rendered" ? renderedTimelineProvenance : undefined}');
    expect(page).toContain('latestCompletedRenderProvenance === "current" ? "Use current render" : "Use latest render"');
    expect(page).toContain("cutRenderTimelineProvenanceLabel(renderedTimelineProvenance, renderedTimelineJob?.output?.timelineRevision)");
  });
});
