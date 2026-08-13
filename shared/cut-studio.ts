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
  transition: z.enum(["cut", "fade_black"]).optional(),
  assetId: z.string().uuid().optional(),
  track: z.string().regex(/^[va][1-8]$/).optional(),
  timelineStart: z.number().finite().min(0).max(43_200).optional(),
  transform: z.object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
    opacity: z.number().finite().min(0).max(1),
  }).optional(),
});

export const cutGraphicSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  kind: z.enum(["title", "lower_third", "callout"]).default("title"),
  text: z.string().max(240),
  timelineStart: z.number().finite().min(0).max(43_200),
  duration: z.number().finite().min(0.25).max(3_600),
  x: z.number().finite().min(0).max(0.95).default(0.1),
  y: z.number().finite().min(0).max(0.95).default(0.75),
  fontSize: z.number().int().min(12).max(160).default(48),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  backgroundOpacity: z.number().finite().min(0).max(1).default(0.72),
});

export const cutEdlSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  clips: z.array(cutClipSchema).min(1).max(200),
  graphics: z.array(cutGraphicSchema).max(50).optional(),
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
export type CutGraphic = z.infer<typeof cutGraphicSchema>;
export type CutTranscript = z.infer<typeof cutTranscriptSchema>;
export type CutTranscriptWord = z.infer<typeof cutTranscriptWordSchema>;
export type CutRenderRequest = z.infer<typeof cutRenderRequestSchema>;

export function estimateCutRenderSeconds(duration: number, request: CutRenderRequest) {
  const resolutionFactor = request.resolution === "2160p" ? 4 : request.resolution === "1080p" ? 1.8 : 1;
  const qualityFactor = request.quality === "master" ? 2.5 : request.quality === "social" ? 1.25 : 0.65;
  const frameFactor = request.fps / 30;
  const captionFactor = request.captions ? 1.15 : 1;
  const audioFactor = request.cleanAudio ? 1.1 : 1;
  return Math.max(5, Math.ceil(Math.max(0, duration) * resolutionFactor * qualityFactor * frameFactor * captionFactor * audioFactor));
}

export function normalizeCutClips(clips: CutClip[], duration?: number, version: 1 | 2 | 3 = 2): CutClip[] {
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
      transition: clip.transition ?? "cut",
    }))
    .filter((clip) => clip.end - clip.start >= 0.05);
  const normalized: CutClip[] = [];
  for (const clip of ordered) {
    normalized.push(clip);
  }
  let cursor = 0;
  return normalized.slice(0, 200).map((clip, index) => {
    const track = clip.track ?? "v1";
    const clipDuration = (clip.end - clip.start) / (clip.speed ?? 1);
    const timelineStart = version === 3 ? (clip.timelineStart ?? (track === "v1" ? cursor : 0)) : cursor;
    if (track === "v1") cursor = Math.max(cursor, timelineStart + clipDuration);
    return {
      ...clip,
      id: clip.id ?? `clip_${String(index).padStart(2, "0")}_${Math.round(clip.start * 1000)}`,
      label: clip.label ?? `clip${String(index).padStart(2, "0")}`,
      ...(version === 3 ? { track, timelineStart, transform: clip.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 } } : {}),
    };
  });
}

export function validateCutEdl(value: unknown, duration: number): CutEdl {
  const parsed = cutEdlSchema.parse(value);
  const clips = normalizeCutClips(parsed.clips, duration, parsed.version);
  if (!clips.length) throw new Error("A cut must retain at least one playable clip");
  for (const clip of clips) {
    const transform = clip.transform;
    if (transform && (transform.x + transform.width > 1.001 || transform.y + transform.height > 1.001)) throw new Error("A multitrack clip must remain inside the frame");
  }
  return { version: parsed.version === 3 ? 3 : 2, clips, graphics: parsed.graphics ?? [] };
}

export function cutDuration(edl: CutEdl | null | undefined) {
  if (!edl) return 0;
  if (edl.version === 3) return Math.max(
    edl.clips.reduce((maximum, clip) => Math.max(maximum, (clip.timelineStart ?? 0) + (clip.end - clip.start) / (clip.speed ?? 1)), 0),
    ...(edl.graphics ?? []).map((graphic) => graphic.timelineStart + graphic.duration),
  );
  return edl.clips.reduce((total, clip) => total + (clip.end - clip.start) / (clip.speed ?? 1), 0);
}

export function removeCutRange(edl: CutEdl, start: number, end: number, duration?: number): CutEdl {
  if (end <= start) return edl;
  const clips: CutClip[] = [];
  for (const clip of edl.clips) {
    if (edl.version === 3 && ((clip.track ?? "v1") !== "v1" || clip.assetId)) { clips.push(clip); continue; }
    if (clip.end <= start || clip.start >= end) clips.push(clip);
    else {
      if (clip.start < start) clips.push({ ...clip, id: `${clip.id ?? "clip"}_a`, start: clip.start, end: start });
      if (clip.end > end) clips.push({ ...clip, id: `${clip.id ?? "clip"}_b`, start: end, end: clip.end });
    }
  }
  const normalized = normalizeCutClips(clips, duration, edl.version);
  return normalized.length ? { version: edl.version === 3 ? 3 : 2, clips: normalized, graphics: edl.graphics } : edl;
}

export function restoreCutRange(edl: CutEdl, start: number, end: number, duration?: number): CutEdl {
  const overlays = edl.version === 3 ? edl.clips.filter((clip) => (clip.track ?? "v1") !== "v1" || clip.assetId) : [];
  const ranges = [...edl.clips.filter((clip) => !overlays.includes(clip)).map((clip) => ({ start: clip.start, end: clip.end })), { start, end }]
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const prior = merged.at(-1);
    if (prior && range.start <= prior.end + 0.001) prior.end = Math.max(prior.end, range.end);
    else merged.push({ ...range });
  }
  return { version: edl.version === 3 ? 3 : 2, clips: normalizeCutClips([...merged, ...overlays], duration, edl.version), graphics: edl.graphics };
}

export function splitCutAt(edl: CutEdl, seconds: number): CutEdl {
  const clips: CutClip[] = [];
  for (const clip of edl.clips) {
    if ((edl.version !== 3 || (clip.track ?? "v1") === "v1") && seconds > clip.start + 0.05 && seconds < clip.end - 0.05) clips.push(
      { ...clip, id: `${clip.id ?? "clip"}_a`, start: clip.start, end: seconds },
      { ...clip, id: `${clip.id ?? "clip"}_b`, start: seconds, end: clip.end },
    );
    else clips.push(clip);
  }
  return { version: edl.version === 3 ? 3 : 2, clips: normalizeCutClips(clips.map((clip, index) => ({ ...clip, label: `clip${String(index).padStart(2, "0")}` })), undefined, edl.version), graphics: edl.graphics };
}

export function transcriptWords(transcript: CutTranscript | null | undefined) {
  return transcript?.segments.flatMap((segment) => segment.words) ?? [];
}

function srtTimestamp(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1_000));
  const hh = Math.floor(milliseconds / 3_600_000);
  const mm = Math.floor((milliseconds % 3_600_000) / 60_000);
  const ss = Math.floor((milliseconds % 60_000) / 1_000);
  const ms = milliseconds % 1_000;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function sourceToOutput(edl: CutEdl, time: number) {
  let cursor = 0;
  for (const clip of edl.clips.filter((item) => (item.track ?? "v1") === "v1" && !item.assetId)) {
    const speed = clip.speed ?? 1;
    if (time >= clip.start && time <= clip.end) return cursor + (time - clip.start) / speed;
    cursor += (clip.end - clip.start) / speed;
  }
  return null;
}

export function buildSrtCaptions(transcript: CutTranscript, edl: CutEdl) {
  let sequence = 0;
  const blocks: string[] = [];
  for (const segment of transcript.segments) {
    const start = sourceToOutput(edl, segment.start);
    const end = sourceToOutput(edl, Math.max(segment.start, segment.end - 0.001));
    if (start === null || end === null || end <= start || !segment.text.trim()) continue;
    sequence += 1;
    blocks.push(`${sequence}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${segment.text.trim()}\n`);
  }
  return blocks.join("\n");
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
  const events = edl.clips.filter((clip) => (clip.track ?? "v1") === "v1").map((clip, index) => {
    const outputEnd = outputCursor + (clip.end - clip.start) / (clip.speed ?? 1);
    const line = `${String(index + 1).padStart(3, "0")}  SOURCE   V     C        ${frames(clip.start)} ${frames(clip.end)} ${frames(outputCursor)} ${frames(outputEnd)}`;
    outputCursor = outputEnd;
    return line;
  });
  return [`TITLE: ${projectName.toUpperCase()}`, "FCM: NON-DROP FRAME", "", ...events, ""].join("\n");
}
