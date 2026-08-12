import { z } from "zod";

export const cutClipSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
  label: z.string().max(80).optional(),
  speed: z.number().finite().min(0.25).max(4).optional(),
  volume: z.number().finite().min(0).max(2).optional(),
  fadeIn: z.number().finite().min(0).max(10).optional(),
  fadeOut: z.number().finite().min(0).max(10).optional(),
});

export const cutEdlSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
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
  quality: z.enum(["draft", "social", "master"]).default("social"),
  resolution: z.enum(["720p", "1080p", "2160p"]).default("1080p"),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
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
    .map((clip) => ({
      ...clip,
      start: Math.max(0, Math.min(maxDuration, clip.start)),
      end: Math.max(0, Math.min(maxDuration, clip.end)),
      speed: clip.speed ?? 1,
      volume: clip.volume ?? 1,
      fadeIn: clip.fadeIn ?? 0,
      fadeOut: clip.fadeOut ?? 0,
    }))
    .filter((clip) => clip.end - clip.start >= 0.05);
  const normalized: CutClip[] = [];
  for (const clip of ordered) {
    normalized.push(clip);
  }
  return normalized.slice(0, 100).map((clip, index) => ({
    ...clip,
    id: clip.id ?? `clip_${String(index).padStart(2, "0")}_${Math.round(clip.start * 1000)}`,
    label: clip.label ?? `clip${String(index).padStart(2, "0")}`,
  }));
}

export function validateCutEdl(value: unknown, duration: number): CutEdl {
  const parsed = cutEdlSchema.parse(value);
  const clips = normalizeCutClips(parsed.clips, duration);
  if (!clips.length) throw new Error("A cut must retain at least one playable clip");
  return { version: 2, clips };
}

export function cutDuration(edl: CutEdl | null | undefined) {
  return edl?.clips.reduce((total, clip) => total + (clip.end - clip.start) / (clip.speed ?? 1), 0) ?? 0;
}

export function removeCutRange(edl: CutEdl, start: number, end: number, duration?: number): CutEdl {
  if (end <= start) return edl;
  const clips: CutClip[] = [];
  for (const clip of edl.clips) {
    if (clip.end <= start || clip.start >= end) clips.push(clip);
    else {
      if (clip.start < start) clips.push({ ...clip, id: `${clip.id ?? "clip"}_a`, start: clip.start, end: start });
      if (clip.end > end) clips.push({ ...clip, id: `${clip.id ?? "clip"}_b`, start: end, end: clip.end });
    }
  }
  const normalized = normalizeCutClips(clips, duration);
  return normalized.length ? { version: 2, clips: normalized } : edl;
}

export function restoreCutRange(edl: CutEdl, start: number, end: number, duration?: number): CutEdl {
  const ranges = [...edl.clips.map((clip) => ({ start: clip.start, end: clip.end })), { start, end }]
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const prior = merged.at(-1);
    if (prior && range.start <= prior.end + 0.001) prior.end = Math.max(prior.end, range.end);
    else merged.push({ ...range });
  }
  return { version: 2, clips: normalizeCutClips(merged, duration) };
}

export function splitCutAt(edl: CutEdl, seconds: number): CutEdl {
  const clips: CutClip[] = [];
  for (const clip of edl.clips) {
    if (seconds > clip.start + 0.05 && seconds < clip.end - 0.05) clips.push(
      { ...clip, id: `${clip.id ?? "clip"}_a`, start: clip.start, end: seconds },
      { ...clip, id: `${clip.id ?? "clip"}_b`, start: seconds, end: clip.end },
    );
    else clips.push(clip);
  }
  return { version: 2, clips: clips.map((clip, index) => ({ ...clip, label: `clip${String(index).padStart(2, "0")}` })) };
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
    const outputEnd = outputCursor + (clip.end - clip.start) / (clip.speed ?? 1);
    const line = `${String(index + 1).padStart(3, "0")}  SOURCE   V     C        ${frames(clip.start)} ${frames(clip.end)} ${frames(outputCursor)} ${frames(outputEnd)}`;
    outputCursor = outputEnd;
    return line;
  });
  return [`TITLE: ${projectName.toUpperCase()}`, "FCM: NON-DROP FRAME", "", ...events, ""].join("\n");
}
