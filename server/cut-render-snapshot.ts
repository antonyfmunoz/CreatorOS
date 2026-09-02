import { createHash } from "node:crypto";
import { cutRenderTimelineDataSchema, cutRenderTimelineSnapshotSchema, type CutEdl, type CutTranscript } from "@shared/cut-studio";

type RenderProject = { id: string; sourceAssetId: string; revision: number; name: string; duration: number; edl: CutEdl; transcript: CutTranscript | null };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// The queue stores validated values, never a pointer to a mutable project row.
// Reparse at execution so corrupt snapshots fail rather than silently falling
// back to a newer edit. Asset authorization still uses the live owned project.
export function captureCutRenderTimeline(project: RenderProject) {
  const data = cutRenderTimelineDataSchema.parse({ version: 1, projectId: project.id, sourceAssetId: project.sourceAssetId, revision: project.revision, name: project.name, duration: project.duration, edl: project.edl, transcript: project.transcript });
  return { ...data, sha256: digest(data) };
}

export function resolveCutRenderTimeline<T extends RenderProject>(project: T, value: unknown): T {
  const snapshot = cutRenderTimelineSnapshotSchema.parse(value);
  const data = cutRenderTimelineDataSchema.parse(snapshot);
  if (snapshot.projectId !== project.id || snapshot.sourceAssetId !== project.sourceAssetId || snapshot.sha256 !== digest(data)) throw new Error("The saved render timeline does not match its project, source and content receipt");
  return { ...project, revision: snapshot.revision, name: snapshot.name, duration: snapshot.duration, edl: snapshot.edl, transcript: snapshot.transcript };
}
