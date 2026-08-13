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
  groupId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
  duckUnderVoice: z.boolean().optional(),
  colorPreset: z.enum(["original", "cinematic", "vivid", "monochrome"]).optional(),
  colorAdjust: z.object({
    brightness: z.number().finite().min(-1).max(1),
    contrast: z.number().finite().min(0.5).max(2),
    saturation: z.number().finite().min(0).max(3),
    temperature: z.number().finite().min(-1).max(1),
  }).optional(),
  chromaKey: z.object({
    enabled: z.boolean(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    similarity: z.number().finite().min(0.01).max(1),
    blend: z.number().finite().min(0).max(1),
  }).optional(),
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

export const cutMarkerSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  label: z.string().trim().min(1).max(80),
  position: z.number().finite().min(0).max(43_200),
  kind: z.enum(["note", "chapter", "beat"]).default("note"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#f43f5e"),
});

export const cutEdlSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  clips: z.array(cutClipSchema).min(1).max(200),
  graphics: z.array(cutGraphicSchema).max(50).optional(),
  markers: z.array(cutMarkerSchema).max(200).optional(),
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
  audioPreset: z.enum(["original", "voice", "broadcast", "music"]).default("original"),
  masterGainDb: z.number().finite().min(-12).max(12).default(0),
  quality: z.enum(["draft", "social", "master"]).default("social"),
  resolution: z.enum(["720p", "1080p", "2160p"]).default("1080p"),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
  clip: z.object({ start: z.number().min(0), end: z.number().positive() }).optional(),
});

export type CutClip = z.infer<typeof cutClipSchema>;
export type CutEdl = z.infer<typeof cutEdlSchema>;
export type CutGraphic = z.infer<typeof cutGraphicSchema>;
export type CutMarker = z.infer<typeof cutMarkerSchema>;
export type CutTranscript = z.infer<typeof cutTranscriptSchema>;
export type CutTranscriptWord = z.infer<typeof cutTranscriptWordSchema>;
export type CutRenderRequest = z.infer<typeof cutRenderRequestSchema>;

export function estimateCutRenderSeconds(duration: number, request: CutRenderRequest) {
  const resolutionFactor = request.resolution === "2160p" ? 4 : request.resolution === "1080p" ? 1.8 : 1;
  const qualityFactor = request.quality === "master" ? 2.5 : request.quality === "social" ? 1.25 : 0.65;
  const frameFactor = request.fps / 30;
  const captionFactor = request.captions ? 1.15 : 1;
  const audioFactor = (request.cleanAudio ? 1.1 : 1) * (request.audioPreset !== "original" ? 1.2 : 1);
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
  return { version: parsed.version === 3 ? 3 : 2, clips, graphics: parsed.graphics ?? [], markers: parsed.markers ?? [] };
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
  return normalized.length ? { version: edl.version === 3 ? 3 : 2, clips: normalized, graphics: edl.graphics, markers: edl.markers } : edl;
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
  return { version: edl.version === 3 ? 3 : 2, clips: normalizeCutClips([...merged, ...overlays], duration, edl.version), graphics: edl.graphics, markers: edl.markers };
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
  return { version: edl.version === 3 ? 3 : 2, clips: normalizeCutClips(clips.map((clip, index) => ({ ...clip, label: `clip${String(index).padStart(2, "0")}` })), undefined, edl.version), graphics: edl.graphics, markers: edl.markers };
}

export function cutTimelinePoints(edl: CutEdl, excludeClipIds: string[] = []) {
  const excluded = new Set(excludeClipIds);
  const points = [0, ...(edl.markers ?? []).map((marker) => marker.position)];
  for (const clip of edl.clips) {
    if (clip.id && excluded.has(clip.id)) continue;
    const start = edl.version === 3 ? (clip.timelineStart ?? 0) : clip.start;
    points.push(start, start + (clip.end - clip.start) / (clip.speed ?? 1));
  }
  for (const graphic of edl.graphics ?? []) points.push(graphic.timelineStart, graphic.timelineStart + graphic.duration);
  return Array.from(new Set(points.filter((point) => Number.isFinite(point) && point >= 0))).sort((left, right) => left - right);
}

export function snapCutTime(edl: CutEdl, candidate: number, threshold = 0.15, excludeClipIds: string[] = []) {
  const bounded = Math.max(0, candidate);
  const closest = cutTimelinePoints(edl, excludeClipIds).reduce<{ point: number; distance: number } | null>((best, point) => {
    const distance = Math.abs(point - bounded);
    return !best || distance < best.distance ? { point, distance } : best;
  }, null);
  return closest && closest.distance <= threshold ? closest.point : bounded;
}

export function groupCutClips(edl: CutEdl, clipIds: string[], groupId = `group_${Date.now()}`): CutEdl {
  if (edl.version !== 3) return edl;
  const selected = new Set(clipIds);
  if (selected.size < 2) return edl;
  return { ...edl, clips: edl.clips.map((clip) => clip.id && selected.has(clip.id) ? { ...clip, groupId } : clip) };
}

export function ungroupCutClips(edl: CutEdl, clipIds: string[]): CutEdl {
  if (edl.version !== 3) return edl;
  const selectedGroups = new Set(edl.clips.filter((clip) => clip.id && clipIds.includes(clip.id)).map((clip) => clip.groupId).filter(Boolean));
  if (!selectedGroups.size) return edl;
  return { ...edl, clips: edl.clips.map((clip) => clip.groupId && selectedGroups.has(clip.groupId) ? { ...clip, groupId: undefined } : clip) };
}

export function moveCutClipGroup(edl: CutEdl, clipId: string, requestedStart: number, snap = true, threshold = 0.15): CutEdl {
  if (edl.version !== 3) return edl;
  const anchor = edl.clips.find((clip) => clip.id === clipId);
  if (!anchor) return edl;
  const moving = anchor.groupId ? edl.clips.filter((clip) => clip.groupId === anchor.groupId) : [anchor];
  const movingIds = moving.flatMap((clip) => clip.id ? [clip.id] : []);
  const anchorStart = anchor.timelineStart ?? 0;
  const earliestStart = Math.min(...moving.map((clip) => clip.timelineStart ?? 0));
  const boundedStart = Math.max(requestedStart, anchorStart - earliestStart);
  const targetStart = snap ? snapCutTime(edl, boundedStart, threshold, movingIds) : boundedStart;
  const delta = targetStart - anchorStart;
  return {
    ...edl,
    clips: edl.clips.map((clip) => moving.includes(clip) ? { ...clip, timelineStart: Math.max(0, (clip.timelineStart ?? 0) + delta) } : clip),
  };
}

export function audioRmsDb(samples: Uint8Array, floorDb = -60) {
  if (!samples.length) return floorDb;
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const normalized = (sample - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  if (!Number.isFinite(rms) || rms <= 0.000001) return floorDb;
  return Math.max(floorDb, Math.min(0, 20 * Math.log10(rms)));
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
