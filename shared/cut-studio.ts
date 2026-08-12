import { z } from "zod";

export const cutClipSchema = z.object({
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
  label: z.string().max(80).optional(),
});

export const cutEdlSchema = z.object({
  version: z.literal(1),
  clips: z.array(cutClipSchema).min(1).max(100),
});

export const cutTranscriptWordSchema = z.object({
  word: z.string().min(1).max(200),
  start: z.number().finite().min(0),
  end: z.number().finite().min(0),
});

export const cutTranscriptSchema = z.object({
  duration: z.number().finite().min(0),
  language: z.string().max(32).default("en"),
  segments: z.array(z.object({
    id: z.string().min(1).max(100),
    start: z.number().finite().min(0),
    end: z.number().finite().min(0),
    text: z.string().max(20_000),
    words: z.array(cutTranscriptWordSchema),
  })).max(10_000),
});

export const cutRenderRequestSchema = z.object({
  aspect: z.enum(["source", "9:16", "1:1", "16:9"]).default("9:16"),
  captions: z.boolean().default(true),
  captionStyle: z.number().int().min(1).max(3).default(1),
  cleanAudio: z.boolean().default(false),
  clip: z.object({ start: z.number().min(0), end: z.number().positive() }).optional(),
});

export type CutClip = z.infer<typeof cutClipSchema>;
export type CutEdl = z.infer<typeof cutEdlSchema>;
export type CutTranscript = z.infer<typeof cutTranscriptSchema>;
export type CutTranscriptWord = z.infer<typeof cutTranscriptWordSchema>;
export type CutRenderRequest = z.infer<typeof cutRenderRequestSchema>;

export function normalizeCutClips(clips: CutClip[], duration?: number): CutClip[] {
  const maxDuration = typeof duration === "number" && Number.isFinite(duration) ? Math.max(0, duration) : Number.POSITIVE_INFINITY;
  const ordered = clips
    .map((clip) => ({ start: Math.max(0, Math.min(maxDuration, clip.start)), end: Math.max(0, Math.min(maxDuration, clip.end)) }))
    .filter((clip) => clip.end - clip.start >= 0.05)
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const clip of ordered) {
    const prior = merged.at(-1);
    if (prior && clip.start <= prior.end + 0.001) prior.end = Math.max(prior.end, clip.end);
    else merged.push({ ...clip });
  }
  return merged.slice(0, 100).map((clip, index) => ({ ...clip, label: `clip${String(index).padStart(2, "0")}` }));
}

export function validateCutEdl(value: unknown, duration: number): CutEdl {
  const parsed = cutEdlSchema.parse(value);
  const clips = normalizeCutClips(parsed.clips, duration);
  if (!clips.length) throw new Error("A cut must retain at least one playable clip");
  return { version: 1, clips };
}

export function cutDuration(edl: CutEdl | null | undefined) {
  return edl?.clips.reduce((total, clip) => total + clip.end - clip.start, 0) ?? 0;
}

export function removeCutRange(edl: CutEdl, start: number, end: number, duration?: number): CutEdl {
  if (end <= start) return edl;
  const clips: CutClip[] = [];
  for (const clip of edl.clips) {
    if (clip.end <= start || clip.start >= end) clips.push(clip);
    else {
      if (clip.start < start) clips.push({ start: clip.start, end: start });
      if (clip.end > end) clips.push({ start: end, end: clip.end });
    }
  }
  const normalized = normalizeCutClips(clips, duration);
  return normalized.length ? { version: 1, clips: normalized } : edl;
}

export function restoreCutRange(edl: CutEdl, start: number, end: number, duration?: number): CutEdl {
  return { version: 1, clips: normalizeCutClips([...edl.clips, { start, end }], duration) };
}

export function splitCutAt(edl: CutEdl, seconds: number): CutEdl {
  const clips: CutClip[] = [];
  for (const clip of edl.clips) {
    if (seconds > clip.start + 0.05 && seconds < clip.end - 0.05) clips.push({ start: clip.start, end: seconds }, { start: seconds, end: clip.end });
    else clips.push(clip);
  }
  return { version: 1, clips: clips.map((clip, index) => ({ ...clip, label: `clip${String(index).padStart(2, "0")}` })) };
}

export function transcriptWords(transcript: CutTranscript | null | undefined) {
  return transcript?.segments.flatMap((segment) => segment.words) ?? [];
}

export function detectCutCandidates(transcript: CutTranscript, silenceThreshold = 1) {
  const fillers = new Set(["um", "uh", "erm", "like", "basically", "literally", "actually"]);
  const words = transcriptWords(transcript);
  const fillerWords = words.filter((word) => fillers.has(word.word.toLowerCase().replace(/[^a-z]/g, "")));
  const silenceGaps: CutClip[] = [];
  for (let index = 1; index < words.length; index += 1) {
    const start = words[index - 1].end;
    const end = words[index].start;
    if (end - start >= silenceThreshold) silenceGaps.push({ start, end });
  }
  return { fillerWords, silenceGaps };
}

export function buildCmx3600Edl(projectName: string, edl: CutEdl) {
  const frames = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds * 30));
    const hh = Math.floor(total / 108000);
    const mm = Math.floor((total % 108000) / 1800);
    const ss = Math.floor((total % 1800) / 30);
    const ff = total % 30;
    return [hh, mm, ss, ff].map((part) => String(part).padStart(2, "0")).join(":");
  };
  let outputCursor = 0;
  const events = edl.clips.map((clip, index) => {
    const outputEnd = outputCursor + clip.end - clip.start;
    const line = `${String(index + 1).padStart(3, "0")}  SOURCE   V     C        ${frames(clip.start)} ${frames(clip.end)} ${frames(outputCursor)} ${frames(outputEnd)}`;
    outputCursor = outputEnd;
    return line;
  });
  return [`TITLE: ${projectName.toUpperCase()}`, "FCM: NON-DROP FRAME", "", ...events, ""].join("\n");
}
