import type { CutTranscript } from "./cut-studio";

export type CutCaptionPreview = { text: string; speaker: string | null; activeWord: string | null } | null;

/** Resolve the transcript visible at a source-media time for edit-time review. */
export function cutCaptionPreviewAt(transcript: CutTranscript | null | undefined, sourceSeconds: number): CutCaptionPreview {
  if (!transcript || !Number.isFinite(sourceSeconds)) return null;
  const segment = transcript.segments.find((candidate) => sourceSeconds >= candidate.start && sourceSeconds < candidate.end && candidate.text.trim());
  if (!segment) return null;
  const word = segment.words.find((candidate) => sourceSeconds >= candidate.start && sourceSeconds < candidate.end)?.word ?? null;
  return { text: segment.text.trim(), speaker: segment.speaker?.trim() || null, activeWord: word };
}
