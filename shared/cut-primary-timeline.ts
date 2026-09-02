import { cutDuration, type CutClip, type CutEdl } from "./cut-studio";

export type CutPrimarySegment = { clip: CutClip | null; start: number; duration: number };

/** Preserve explicit V1 time. Empty spans are black/silent, never a held camera frame. */
export function cutPrimaryTimeline(edl: CutEdl) {
  const original = edl.clips.filter((clip) => (clip.track ?? "v1") === "v1");
  if (!original.length) throw new Error("A video timeline requires a primary video clip");
  const ordered = [...original].sort((a, b) => (a.timelineStart ?? 0) - (b.timelineStart ?? 0));
  const segments: CutPrimarySegment[] = [];
  let cursor = 0;
  for (const clip of ordered) {
    const start = clip.timelineStart ?? cursor;
    const duration = (clip.end - clip.start) / (clip.speed ?? 1);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration <= 0) throw new Error("Invalid primary timeline timing");
    if (start < cursor - 0.000001) throw new Error("Primary video clips overlap. Trim or move them apart, or place layered video on another track before exporting.");
    if (start > cursor + 0.000001) segments.push({ clip: null, start: cursor, duration: start - cursor });
    segments.push({ clip, start, duration });
    cursor = start + duration;
  }
  const end = cutDuration(edl);
  if (end > cursor + 0.000001) segments.push({ clip: null, start: cursor, duration: end - cursor });
  return { segments, duration: Math.max(cursor, end), requiresTimeline: segments.some((segment) => !segment.clip) || ordered.some((clip, index) => clip !== original[index]) };
}
