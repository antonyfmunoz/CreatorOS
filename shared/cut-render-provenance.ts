export type CutRenderTimelineProvenance = "current" | "stale" | "unknown";

type RenderOutput = {
  timelineSnapshot?: unknown;
  timelineRevision?: unknown;
  timelineSha256?: unknown;
} | null | undefined;

/**
 * A completed render is immutable, but the editor draft is not. Keep those
 * facts distinct at the UI boundary: a private media URL proves that a render
 * exists, not that it represents the draft currently on screen.
 */
export function cutRenderTimelineProvenance(output: RenderOutput, currentRevision: number, hasUnsavedTimeline: boolean): CutRenderTimelineProvenance {
  if (output?.timelineSnapshot !== "captured" || !Number.isInteger(output.timelineRevision) || typeof output.timelineSha256 !== "string" || output.timelineSha256.length !== 64) return "unknown";
  if (hasUnsavedTimeline || output.timelineRevision !== currentRevision) return "stale";
  return "current";
}

export function cutRenderTimelineProvenanceLabel(provenance: CutRenderTimelineProvenance, revision?: number) {
  if (provenance === "current") return `Matches saved timeline revision ${revision}`;
  if (provenance === "stale") return "Historical render · it does not match the current timeline";
  return "Snapshot provenance is unavailable · treat this as historical output";
}
