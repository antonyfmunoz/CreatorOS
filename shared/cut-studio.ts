import { z } from "zod";
import { cutTextLayoutSchema, CUT_NATIVE_TEXT_MAX_CHARACTERS } from "./cut-text-layout";
import { sanitizeCutStudioSvg } from "./cut-studio-svg";

const cutGraphicEffectSchema = z.object({
  kind: z.enum(["blur", "drop_shadow", "glow", "grain", "noise", "vignette", "color_matrix", "chroma_key", "mask", "displacement", "motion_blur", "light_leak"]),
  parameters: z.record(z.string().max(80), z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()])).superRefine((value, context) => {
    if (Object.keys(value).length > 20) context.addIssue({ code: z.ZodIssueCode.custom, message: "A graphic effect may contain at most 20 parameters" });
  }).default({}),
});

export const cutClipSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
  label: z.string().max(80).optional(),
  speed: z.number().finite().min(0.25).max(4).optional(),
  volume: z.number().finite().min(0).max(2).optional(),
  fadeIn: z.number().finite().min(0).max(10).optional(),
  fadeOut: z.number().finite().min(0).max(10).optional(),
  transition: z.enum(["cut", "fade_black", "cross_dissolve"]).optional(),
  assetId: z.string().uuid().optional(),
  sourceVariantId: z.string().uuid().optional(),
  generationJobId: z.string().uuid().nullable().optional(),
  track: z.string().regex(/^[va][1-8]$/).optional(),
  timelineStart: z.number().finite().min(0).max(43_200).optional(),
  groupId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
  duckUnderVoice: z.boolean().optional(),
  colorPreset: z.enum(["original", "cinematic", "vivid", "monochrome"]).optional(),
  lutAssetId: z.string().uuid().optional(),
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
  motionKeyframes: z.array(z.object({
    at: z.number().finite().min(0).max(43_200),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    scale: z.number().finite().min(0.25).max(4).optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    easing: z.enum(["linear", "ease_in_out"]).optional(),
  })).max(50).optional(),
  volumeKeyframes: z.array(z.object({
    at: z.number().finite().min(0).max(43_200),
    volume: z.number().finite().min(0).max(2),
    easing: z.enum(["linear", "ease_in_out"]).optional(),
  })).max(50).optional(),
});

export const cutGraphicSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  kind: z.enum(["title", "lower_third", "callout", "shape", "path", "svg", "image", "lottie", "rive", "three"]).default("title"),
  assetId: z.string().uuid().optional(),
  text: z.string().max(20_000),
  timelineStart: z.number().finite().min(0).max(43_200),
  duration: z.number().finite().min(0.25).max(3_600),
  x: z.number().finite().min(0).max(0.95).default(0.1),
  y: z.number().finite().min(0).max(0.95).default(0.75),
  fontSize: z.number().int().min(12).max(160).default(48),
  // Composition fonts are measured in their authored canvas, not delivery pixels.
  // Absent on legacy/manual graphics: preserve their existing pixel sizing.
  fontReferenceWidth: z.number().int().min(240).max(7_680).optional(),
  textLayout: cutTextLayoutSchema.optional(),
  fontAssetId: z.string().uuid().optional(),
  fontFamily: z.string().trim().min(1).max(160).default("CreativesOS Sans"),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  backgroundOpacity: z.number().finite().min(0).max(1).default(0.72),
  width: z.number().finite().positive().max(1).default(0.25),
  height: z.number().finite().positive().max(1).default(0.25),
  fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  strokeWidth: z.number().finite().positive().max(20).default(2),
  primitive: z.enum(["cube", "pyramid", "plane"]).nullable().default(null),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0b5f99"),
  edgeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  wireframe: z.boolean().default(false),
  depth: z.number().finite().min(0.1).max(4).default(1),
  borderRadius: z.number().finite().min(0).max(50).default(0),
  rotation: z.number().finite().min(-3_600).max(3_600).default(0),
  rotationX: z.number().finite().min(-3_600).max(3_600).default(0),
  rotationY: z.number().finite().min(-3_600).max(3_600).default(0),
  perspective: z.number().finite().min(0).max(10_000).default(0),
  blur: z.number().finite().min(0).max(100).default(0),
  brightness: z.number().finite().min(0).max(4).default(1),
  saturation: z.number().finite().min(0).max(4).default(1),
  revealKind: z.enum(["wipe", "clock_wipe", "iris", "custom_mask"]).nullable().default(null),
  revealDirection: z.enum(["left", "right", "up", "down", "clockwise", "counterclockwise"]).nullable().default(null),
  revealProgress: z.number().finite().min(0).max(1).default(1),
  revealMaskAssetId: z.string().uuid().nullable().default(null),
  effects: z.array(cutGraphicEffectSchema).max(20).default([]),
  motionKeyframes: z.array(z.object({
    at: z.number().finite().min(0).max(3_600),
    x: z.number().finite().min(-4).max(4),
    y: z.number().finite().min(-4).max(4),
    scale: z.number().finite().min(0.01).max(8),
    rotation: z.number().finite().min(-3_600).max(3_600).default(0),
    rotationX: z.number().finite().min(-3_600).max(3_600).default(0),
    rotationY: z.number().finite().min(-3_600).max(3_600).default(0),
    perspective: z.number().finite().min(0).max(10_000).default(0),
    blur: z.number().finite().min(0).max(100).default(0),
    brightness: z.number().finite().min(0).max(4).default(1),
    saturation: z.number().finite().min(0).max(4).default(1),
    revealKind: z.enum(["wipe", "clock_wipe", "iris", "custom_mask"]).nullable().default(null),
    revealDirection: z.enum(["left", "right", "up", "down", "clockwise", "counterclockwise"]).nullable().default(null),
    revealProgress: z.number().finite().min(0).max(1).default(1),
    revealMaskAssetId: z.string().uuid().nullable().default(null),
    opacity: z.number().finite().min(0).max(1),
    easing: z.enum(["linear", "ease_in_out"]).default("linear"),
  })).max(50).optional(),
}).superRefine((value, context) => {
  if (value.textLayout && !value.fontReferenceWidth) context.addIssue({ code: z.ZodIssueCode.custom, path: ["fontReferenceWidth"], message: "Native text layout requires the authored canvas width" });
  const textLimit = value.textLayout ? CUT_NATIVE_TEXT_MAX_CHARACTERS : 240;
  if (!["path", "svg"].includes(value.kind) && value.text.length > textLimit) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: `Graphic text may contain at most ${textLimit} characters` });
  }
  if (value.kind === "path" && (!value.text.trim() || value.text.length > 4_000 || !/^[MmLlHhVvCcSsQqTtAaZz0-9+.,\s-]+$/.test(value.text))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Vector paths may contain only bounded SVG path commands and numbers" });
  }
  if (value.kind === "svg") {
    try { sanitizeCutStudioSvg(value.text); } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: error instanceof Error ? error.message : "SVG source is invalid" });
    }
  }
  if (["image", "lottie", "rive"].includes(value.kind) && !value.assetId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assetId"], message: `${value.kind} graphics require a private asset` });
  if (value.kind === "three" && !value.primitive) context.addIssue({ code: z.ZodIssueCode.custom, path: ["primitive"], message: "3D graphics require a bounded primitive" });
  const staticMask = value.effects.find((effect) => effect.kind === "mask");
  const staticMaskAssetId = staticMask?.parameters.maskAssetId;
  if (staticMask && (typeof staticMaskAssetId !== "string" || !z.string().uuid().safeParse(staticMaskAssetId).success)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["effects"], message: "Mask effects require a private image asset" });
  }
  if (value.revealMaskAssetId && typeof staticMaskAssetId === "string" && value.revealMaskAssetId !== staticMaskAssetId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["effects"], message: "A graphic may not combine different transition and static masks" });
  }
});

export const cutMarkerSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  label: z.string().trim().min(1).max(80),
  position: z.number().finite().min(0).max(43_200),
  kind: z.enum(["note", "chapter", "beat"]).default("note"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#f43f5e"),
});

export const cutCompoundSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  label: z.string().trim().min(1).max(80),
  clipIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)).min(2).max(100),
  collapsed: z.boolean().default(true),
});

export const cutMulticamGroupSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  label: z.string().trim().min(1).max(80),
  timelineStart: z.number().finite().min(0).max(43_200),
  duration: z.number().finite().positive().max(43_200),
  angles: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    label: z.string().trim().min(1).max(80),
    assetId: z.string().uuid().nullable(),
    sourceStart: z.number().finite().min(0).max(43_200),
    sourceEnd: z.number().finite().positive().max(43_200),
  })).min(2).max(16),
  switches: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    at: z.number().finite().min(0).max(43_200),
    angleId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  })).min(1).max(500),
});

export const cutTrackSettingsSchema = z.object({
  track: z.string().regex(/^[va][1-8]$/),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false),
  gain: z.number().finite().min(0).max(2).default(1),
  bus: z.enum(["dialogue", "music", "effects"]).optional(),
});

export const cutAudioBusSchema = z.object({
  id: z.enum(["dialogue", "music", "effects"]),
  name: z.string().trim().min(1).max(40),
  gain: z.number().finite().min(0).max(2).default(1),
  muted: z.boolean().default(false),
});

export const cutAudioRoutingTemplatePayloadSchema = z.object({
  audioBuses: z.array(cutAudioBusSchema).length(3),
  trackRouting: z.array(z.object({
    track: z.string().regex(/^a[1-8]$/),
    bus: z.enum(["dialogue", "music", "effects"]),
    gain: z.number().finite().min(0).max(2).default(1),
    muted: z.boolean().default(false),
  })).max(8),
  duckingTracks: z.array(z.string().regex(/^a[1-8]$/)).max(8).default([]),
  finishing: z.object({
    cleanAudio: z.boolean().default(false),
    audioPreset: z.enum(["original", "voice", "broadcast", "music"]).default("original"),
    masterGainDb: z.number().finite().min(-12).max(12).default(0),
  }),
}).superRefine((value, context) => {
  if (new Set(value.audioBuses.map((bus) => bus.id)).size !== 3) context.addIssue({ code: z.ZodIssueCode.custom, path: ["audioBuses"], message: "Dialogue, music, and effects buses are required" });
  if (new Set(value.trackRouting.map((track) => track.track)).size !== value.trackRouting.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["trackRouting"], message: "Each audio track may be routed once" });
  if (new Set(value.duckingTracks).size !== value.duckingTracks.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["duckingTracks"], message: "Each ducking track may be listed once" });
});

export const cutEdlSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  clips: z.array(cutClipSchema).min(1).max(200),
  graphics: z.array(cutGraphicSchema).max(50).optional(),
  markers: z.array(cutMarkerSchema).max(200).optional(),
  compounds: z.array(cutCompoundSchema).max(50).optional(),
  multicamGroups: z.array(cutMulticamGroupSchema).max(20).optional(),
  tracks: z.array(cutTrackSettingsSchema).max(16).optional(),
  audioBuses: z.array(cutAudioBusSchema).max(3).optional(),
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
    speaker: z.string().trim().max(80).optional(),
    words: z.array(cutTranscriptWordSchema),
  })).max(10_000),
});

export const cutRenderSettingsSchema = z.object({
  aspect: z.enum(["source", "9:16", "1:1", "16:9"]).default("9:16"),
  captions: z.boolean().default(true),
  captionStyle: z.number().int().min(1).max(4).default(1),
  cleanAudio: z.boolean().default(false),
  audioPreset: z.enum(["original", "voice", "broadcast", "music"]).default("original"),
  masterGainDb: z.number().finite().min(-12).max(12).default(0),
  quality: z.enum(["draft", "social", "master"]).default("social"),
  resolution: z.enum(["720p", "1080p", "2160p"]).default("1080p"),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).default(30),
});

export const cutRenderTimelineDataSchema = z.object({
  version: z.literal(1),
  projectId: z.string().uuid(),
  sourceAssetId: z.string().uuid(),
  revision: z.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  duration: z.number().finite().positive().max(43_200),
  edl: cutEdlSchema,
  transcript: cutTranscriptSchema.nullable(),
});
export const cutRenderTimelineSnapshotSchema = cutRenderTimelineDataSchema.extend({ sha256: z.string().regex(/^[a-f0-9]{64}$/) });

export const cutRenderRequestSchema = cutRenderSettingsSchema.extend({
  clip: z.object({ start: z.number().min(0), end: z.number().positive() }).optional(),
  timeline: cutRenderTimelineSnapshotSchema.optional(),
  composition: z.object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    renderBatchId: z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/),
    variantIndex: z.number().int().min(0).max(19),
    manifest: z.unknown(),
  }).optional(),
}).superRefine((value, context) => {
  if (value.composition && value.timeline) context.addIssue({ code: z.ZodIssueCode.custom, path: ["timeline"], message: "Choose a timeline or composition snapshot, not both" });
  if (value.composition && value.clip) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["clip"], message: "Composition snapshots cannot be combined with a timeline clip range" });
  }
});

export type CutClip = z.infer<typeof cutClipSchema>;
export type CutEdl = z.infer<typeof cutEdlSchema>;
export type CutGraphic = z.infer<typeof cutGraphicSchema>;
export type CutMarker = z.infer<typeof cutMarkerSchema>;
export type CutCompound = z.infer<typeof cutCompoundSchema>;
export type CutMulticamGroup = z.infer<typeof cutMulticamGroupSchema>;
export type CutTrackSettings = z.infer<typeof cutTrackSettingsSchema>;
export type CutAudioBus = z.infer<typeof cutAudioBusSchema>;
export type CutAudioRoutingTemplatePayload = z.infer<typeof cutAudioRoutingTemplatePayloadSchema>;
export type CutTranscript = z.infer<typeof cutTranscriptSchema>;
export type CutTranscriptWord = z.infer<typeof cutTranscriptWordSchema>;
export type CutRenderRequest = z.infer<typeof cutRenderRequestSchema>;
export type CutRippleMode = "off" | "track" | "linked";

export function parseCubeLutData(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
  let title: string | null = null;
  let size: number | null = null;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const entries: number[][] = [];
  for (const line of lines) {
    if (/^TITLE\s+/i.test(line)) {
      title = line.replace(/^TITLE\s+/i, "").replace(/^"|"$/g, "").trim().slice(0, 120) || null;
      continue;
    }
    const sizeMatch = line.match(/^LUT_3D_SIZE\s+(\d+)$/i);
    if (sizeMatch) {
      size = Number(sizeMatch[1]);
      if (!Number.isInteger(size) || size < 2 || size > 65) throw new Error("3D LUT size must be between 2 and 65");
      continue;
    }
    if (/^DOMAIN_(?:MIN|MAX)\s+/i.test(line)) {
      const values = line.split(/\s+/).slice(1).map(Number);
      if (values.length !== 3 || values.some((item) => !Number.isFinite(item))) throw new Error("LUT domain values are invalid");
      if (/^DOMAIN_MIN/i.test(line)) domainMin = values as [number, number, number];
      else domainMax = values as [number, number, number];
      continue;
    }
    const values = line.split(/\s+/).map(Number);
    if (values.length !== 3 || values.some((item) => !Number.isFinite(item) || item < -16 || item > 16)) throw new Error("LUT contains an unsupported directive or color value");
    entries.push(values);
  }
  if (!size) throw new Error("LUT_3D_SIZE is required");
  if (entries.length !== size ** 3) throw new Error(`Expected ${size ** 3} LUT color entries but received ${entries.length}`);
  if (domainMin.some((value, index) => value >= domainMax[index])) throw new Error("LUT domain minimum must be lower than its maximum");
  return { title, size, entryCount: entries.length, domainMin, domainMax, entries };
}

export function parseCubeLut(value: string) {
  const { title, size, entryCount } = parseCubeLutData(value);
  return { title, size, entryCount };
}

export function parseEbur128Summary(value: string) {
  const finalNumber = (pattern: RegExp) => Array.from(value.matchAll(pattern)).at(-1)?.[1];
  const integratedLufs = Number(finalNumber(/\bI:\s*(-?[\d.]+) LUFS/g));
  const loudnessRangeLu = Number(finalNumber(/\bLRA:\s*([\d.]+) LU/g));
  const truePeakDbfs = Number(finalNumber(/\bPeak:\s*(-?[\d.]+) dBFS/g));
  if (![integratedLufs, loudnessRangeLu, truePeakDbfs].every(Number.isFinite)) throw new Error("The loudness analyzer returned invalid measurements");
  return { integratedLufs, loudnessRangeLu, truePeakDbfs };
}

function reconcileCutCompounds(compounds: CutCompound[] | undefined, clips: CutClip[], replacements: Map<string, string[]> = new Map()) {
  const validClipIds = new Set(clips.flatMap((clip) => clip.id ? [clip.id] : []));
  const claimedClipIds = new Set<string>();
  return (compounds ?? []).flatMap((compound) => {
    const clipIds = Array.from(new Set(compound.clipIds.flatMap((id) => replacements.has(id) ? replacements.get(id)! : [id])))
      .filter((id) => validClipIds.has(id) && !claimedClipIds.has(id));
    if (clipIds.length < 2) return [];
    clipIds.forEach((id) => claimedClipIds.add(id));
    return [{ ...compound, clipIds }];
  });
}

export function estimateCutRenderSeconds(duration: number, request: CutRenderRequest) {
  const resolutionFactor = request.resolution === "2160p" ? 4 : request.resolution === "1080p" ? 1.8 : 1;
  const qualityFactor = request.quality === "master" ? 2.5 : request.quality === "social" ? 1.25 : 0.65;
  const frameFactor = request.fps / 30;
  const captionFactor = request.captions ? 1.15 : 1;
  const audioFactor = (request.cleanAudio ? 1.1 : 1) * (request.audioPreset !== "original" ? 1.2 : 1);
  return Math.max(5, Math.ceil(Math.max(0, duration) * resolutionFactor * qualityFactor * frameFactor * captionFactor * audioFactor));
}

export function cutTrackEffectiveGain(track: string, tracks: CutTrackSettings[] = [], buses: CutAudioBus[] = []) {
  const setting = tracks.find((item) => item.track === track);
  const bus = setting?.bus ? buses.find((item) => item.id === setting.bus) : undefined;
  return (setting?.gain ?? 1) * (bus?.muted ? 0 : bus?.gain ?? 1);
}

/** Shared automation points keep native export and audible monitoring on the
 * same gain curve. A keyframe at zero overrides the clip's initial volume. */
export function cutClipVolumePoints(clip: CutClip) {
  return [{ at: 0, value: clip.volume ?? 1, easing: "linear" as const }, ...(clip.volumeKeyframes ?? []).map((point) => ({ at: point.at, value: point.volume, easing: point.easing ?? "linear" }))]
    .sort((left, right) => left.at - right.at)
    .filter((point, index, all) => index === all.length - 1 || Math.abs(point.at - all[index + 1].at) > .0005);
}

export function cutClipVolumeAt(clip: CutClip, localSeconds: number, multiplier = 1) {
  const points = cutClipVolumePoints(clip);
  const time = Math.max(0, Number.isFinite(localSeconds) ? localSeconds : 0);
  const gain = (value: number) => Number((value * multiplier).toFixed(5));
  for (let index = 0; index < points.length - 1; index++) {
    const left = points[index], right = points[index + 1];
    if (time >= right.at) continue;
    const progress = Math.max(0, Math.min(1, (time - left.at) / (right.at - left.at)));
    const eased = right.easing === "ease_in_out" ? progress * progress * (3 - 2 * progress) : progress;
    return gain(left.value) + Number((gain(right.value) - gain(left.value)).toFixed(5)) * eased;
  }
  return gain(points.at(-1)!.value);
}

export function updateCutTrackSettings(edl: CutEdl, track: string, patch: Partial<CutTrackSettings>, duration: number): CutEdl {
  // Legacy sequential edits expose the primary mixer too. Upgrade on the first
  // track edit, preserving their speed-adjusted concatenation order and trims.
  let cursor = 0;
  const clips = edl.version === 3 ? edl.clips : edl.clips.map((clip) => {
    const timelineStart = cursor;
    cursor += (clip.end - clip.start) / (clip.speed ?? 1);
    return { ...clip, track: "v1", timelineStart };
  });
  if (!clips.some((clip) => (clip.track ?? "v1") === track)) throw new Error("The selected timeline track does not exist");
  const current = edl.tracks?.find((item) => item.track === track) ?? { track, locked: false, hidden: false, muted: false, solo: false, gain: 1 };
  return validateCutEdl({ ...edl, version: 3, clips, tracks: [...(edl.tracks ?? []).filter((item) => item.track !== track), { ...current, ...patch, track }] }, duration);
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
      ...(version === 3 && clip.motionKeyframes ? { motionKeyframes: [...clip.motionKeyframes].sort((left, right) => left.at - right.at) } : {}),
      ...(version === 3 && clip.volumeKeyframes ? { volumeKeyframes: [...clip.volumeKeyframes].sort((left, right) => left.at - right.at) } : {}),
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
    const clipDuration = (clip.end - clip.start) / (clip.speed ?? 1);
    const keyframeTimes = new Set<number>();
    for (const keyframe of clip.motionKeyframes ?? []) {
      if (keyframe.at > clipDuration + 0.001) throw new Error("A motion keyframe must remain inside its clip");
      const scale = keyframe.scale ?? 1;
      if (transform && (keyframe.x + transform.width * scale > 1.001 || keyframe.y + transform.height * scale > 1.001)) throw new Error("A motion keyframe must remain inside the frame");
      const roundedTime = Math.round(keyframe.at * 1_000);
      if (keyframeTimes.has(roundedTime)) throw new Error("Motion keyframes must use unique times");
      keyframeTimes.add(roundedTime);
    }
    const volumeKeyframeTimes = new Set<number>();
    for (const keyframe of clip.volumeKeyframes ?? []) {
      if (keyframe.at > clipDuration + 0.001) throw new Error("A volume keyframe must remain inside its clip");
      const roundedTime = Math.round(keyframe.at * 1_000);
      if (volumeKeyframeTimes.has(roundedTime)) throw new Error("Volume keyframes must use unique times");
      volumeKeyframeTimes.add(roundedTime);
    }
  }
  for (const graphic of parsed.graphics ?? []) {
    const keyframeTimes = new Set<number>();
    for (const keyframe of graphic.motionKeyframes ?? []) {
      if (keyframe.at > graphic.duration + 0.001) throw new Error("A graphic motion keyframe must remain inside its graphic");
      const roundedTime = Math.round(keyframe.at * 1_000);
      if (keyframeTimes.has(roundedTime)) throw new Error("Graphic motion keyframes must use unique times");
      keyframeTimes.add(roundedTime);
    }
  }
  const compounds = parsed.version === 3 ? reconcileCutCompounds(parsed.compounds, clips) : [];
  const multicamGroups = parsed.version === 3 ? (parsed.multicamGroups ?? []).map((group) => {
    const angleIds = new Set(group.angles.map((angle) => angle.id));
    if (angleIds.size !== group.angles.length) throw new Error("Multicam angle identifiers must be unique");
    if (group.timelineStart + group.duration > duration + 0.001) throw new Error("A multicam group must remain inside the project");
    for (const angle of group.angles) {
      if (angle.sourceEnd <= angle.sourceStart || angle.sourceEnd - angle.sourceStart + 0.001 < group.duration) throw new Error("Every multicam angle must cover the group duration");
    }
    const switchTimes = new Set<number>();
    for (const item of group.switches) {
      if (!angleIds.has(item.angleId)) throw new Error("Every multicam switch must reference an angle");
      if (item.at >= group.duration) throw new Error("A multicam switch must remain inside its group");
      const rounded = Math.round(item.at * 1_000);
      if (switchTimes.has(rounded)) throw new Error("Multicam switches must use unique times");
      switchTimes.add(rounded);
    }
    if (!group.switches.some((item) => item.at === 0)) throw new Error("A multicam group must select its opening angle at zero");
    return { ...group, switches: [...group.switches].sort((left, right) => left.at - right.at) };
  }) : [];
  const usedTracks = new Set(clips.map((clip) => clip.track ?? "v1"));
  const tracks = parsed.version === 3 ? Array.from(new Map((parsed.tracks ?? []).filter((track) => usedTracks.has(track.track)).map((track) => [track.track, track])).values()) : [];
  const audioBuses = parsed.version === 3 ? Array.from(new Map((parsed.audioBuses ?? []).map((bus) => [bus.id, bus])).values()) : [];
  return { version: parsed.version === 3 ? 3 : 2, clips, graphics: parsed.graphics ?? [], markers: parsed.markers ?? [], compounds, multicamGroups, tracks, audioBuses };
}

function materializeMulticamGroup(edl: CutEdl, group: CutMulticamGroup): CutEdl {
  const groupEnd = group.timelineStart + group.duration;
  const switches = [...group.switches].sort((left, right) => left.at - right.at);
  const generated: CutClip[] = switches.map((item, index) => {
    const angle = group.angles.find((candidate) => candidate.id === item.angleId)!;
    const nextAt = switches[index + 1]?.at ?? group.duration;
    return {
      id: `${group.id}_${String(index).padStart(3, "0")}`.slice(0, 80),
      assetId: angle.assetId ?? undefined,
      label: angle.label,
      start: angle.sourceStart + item.at,
      end: angle.sourceStart + nextAt,
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      transition: "cut",
      track: "v1",
      timelineStart: group.timelineStart + item.at,
      groupId: group.id,
      transform: { x: 0, y: 0, width: 1, height: 1, opacity: 1 },
    };
  });
  const retained = edl.clips.filter((clip) => {
    if ((clip.track ?? "v1") !== "v1") return true;
    if (clip.groupId === group.id) return false;
    const clipStart = clip.timelineStart ?? 0;
    const clipEnd = clipStart + (clip.end - clip.start) / (clip.speed ?? 1);
    return clipEnd <= group.timelineStart + 0.001 || clipStart >= groupEnd - 0.001;
  });
  return { ...edl, clips: [...retained, ...generated].sort((left, right) => (left.timelineStart ?? 0) - (right.timelineStart ?? 0)) };
}

export function createCutMulticamGroup(
  edl: CutEdl,
  angleClipIds: string[],
  label = "Multicam sequence",
  groupId = `multicam_${Date.now()}`,
): CutEdl {
  if (edl.version !== 3) return edl;
  const selected = angleClipIds.flatMap((id) => {
    const clip = edl.clips.find((candidate) => candidate.id === id && (candidate.track ?? "v1").startsWith("v"));
    return clip ? [clip] : [];
  });
  if (selected.length < 2) return edl;
  const timelineStart = Math.max(...selected.map((clip) => clip.timelineStart ?? 0));
  const duration = Math.min(...selected.map((clip) => (clip.end - clip.start) / (clip.speed ?? 1)));
  if (!Number.isFinite(duration) || duration <= 0.05) return edl;
  const angles = selected.map((clip, index) => ({
    id: `angle_${String(index + 1).padStart(2, "0")}`,
    label: clip.label ?? `Angle ${index + 1}`,
    assetId: clip.assetId ?? null,
    sourceStart: clip.start,
    sourceEnd: clip.start + duration,
  }));
  const group = cutMulticamGroupSchema.parse({ id: groupId, label, timelineStart, duration, angles, switches: [{ id: `${groupId}_opening`.slice(0, 80), at: 0, angleId: angles[0].id }] });
  const next = { ...edl, multicamGroups: [...(edl.multicamGroups ?? []).filter((item) => item.id !== group.id), group] };
  return materializeMulticamGroup(next, group);
}

export function switchCutMulticamAngle(edl: CutEdl, groupId: string, timelineTime: number, angleId: string): CutEdl {
  if (edl.version !== 3) return edl;
  const group = edl.multicamGroups?.find((item) => item.id === groupId);
  if (!group || !group.angles.some((angle) => angle.id === angleId)) return edl;
  const at = Math.max(0, Math.min(group.duration - 0.001, timelineTime - group.timelineStart));
  const roundedAt = Math.round(at * 1_000) / 1_000;
  const switches = [...group.switches.filter((item) => Math.abs(item.at - roundedAt) > 0.0005), { id: `${group.id}_${Math.round(roundedAt * 1_000)}_${angleId}`.slice(0, 80), at: roundedAt, angleId }].sort((left, right) => left.at - right.at);
  const updated = cutMulticamGroupSchema.parse({ ...group, switches });
  return materializeMulticamGroup({ ...edl, multicamGroups: edl.multicamGroups!.map((item) => item.id === group.id ? updated : item) }, updated);
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
  const replacements = new Map<string, string[]>();
  for (const clip of edl.clips) {
    if (edl.version === 3 && ((clip.track ?? "v1") !== "v1" || clip.assetId)) { clips.push(clip); continue; }
    if (clip.end <= start || clip.start >= end) clips.push(clip);
    else {
      const replacementIds: string[] = [];
      if (clip.start < start) { const id = `${clip.id ?? "clip"}_a`; clips.push({ ...clip, id, start: clip.start, end: start }); replacementIds.push(id); }
      if (clip.end > end) { const id = `${clip.id ?? "clip"}_b`; clips.push({ ...clip, id, start: end, end: clip.end }); replacementIds.push(id); }
      if (clip.id) replacements.set(clip.id, replacementIds);
    }
  }
  const normalized = normalizeCutClips(clips, duration, edl.version);
  return normalized.length ? { version: edl.version === 3 ? 3 : 2, clips: normalized, graphics: edl.graphics, markers: edl.markers, compounds: reconcileCutCompounds(edl.compounds, normalized, replacements), multicamGroups: edl.multicamGroups, tracks: edl.tracks, audioBuses: edl.audioBuses } : edl;
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
  const normalized = normalizeCutClips([...merged, ...overlays], duration, edl.version);
  return { version: edl.version === 3 ? 3 : 2, clips: normalized, graphics: edl.graphics, markers: edl.markers, compounds: reconcileCutCompounds(edl.compounds, normalized), multicamGroups: edl.multicamGroups, tracks: edl.tracks, audioBuses: edl.audioBuses };
}

export function splitCutAt(edl: CutEdl, seconds: number): CutEdl {
  const clips: CutClip[] = [];
  const replacements = new Map<string, string[]>();
  for (const clip of edl.clips) {
    if ((edl.version !== 3 || (clip.track ?? "v1") === "v1") && seconds > clip.start + 0.05 && seconds < clip.end - 0.05) {
      const ids = [`${clip.id ?? "clip"}_a`, `${clip.id ?? "clip"}_b`];
      clips.push({ ...clip, id: ids[0], start: clip.start, end: seconds }, { ...clip, id: ids[1], start: seconds, end: clip.end });
      if (clip.id) replacements.set(clip.id, ids);
    }
    else clips.push(clip);
  }
  const normalized = normalizeCutClips(clips.map((clip, index) => ({ ...clip, label: `clip${String(index).padStart(2, "0")}` })), undefined, edl.version);
  return { version: edl.version === 3 ? 3 : 2, clips: normalized, graphics: edl.graphics, markers: edl.markers, compounds: reconcileCutCompounds(edl.compounds, normalized, replacements), multicamGroups: edl.multicamGroups, tracks: edl.tracks, audioBuses: edl.audioBuses };
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

export function createCutCompound(edl: CutEdl, clipIds: string[], label = "Compound clip", compoundId = `compound_${Date.now()}`): CutEdl {
  if (edl.version !== 3) return edl;
  const validIds = new Set(edl.clips.flatMap((clip) => clip.id ? [clip.id] : []));
  const selected = Array.from(new Set(clipIds)).filter((id) => validIds.has(id));
  if (selected.length < 2) return edl;
  const selectedSet = new Set(selected);
  const retained = (edl.compounds ?? []).flatMap((compound) => {
    const remaining = compound.clipIds.filter((id) => !selectedSet.has(id));
    return remaining.length >= 2 ? [{ ...compound, clipIds: remaining }] : [];
  });
  return { ...edl, compounds: [...retained, { id: compoundId, label: label.trim() || "Compound clip", clipIds: selected, collapsed: true }] };
}

export function breakApartCutCompound(edl: CutEdl, clipIds: string[]): CutEdl {
  if (edl.version !== 3) return edl;
  const selected = new Set(clipIds);
  return { ...edl, compounds: (edl.compounds ?? []).filter((compound) => !compound.clipIds.some((id) => selected.has(id))) };
}

export function moveCutClipGroup(edl: CutEdl, clipId: string, requestedStart: number, snap = true, threshold = 0.15): CutEdl {
  if (edl.version !== 3) return edl;
  const anchor = edl.clips.find((clip) => clip.id === clipId);
  if (!anchor) return edl;
  const compound = (edl.compounds ?? []).find((item) => anchor.id && item.clipIds.includes(anchor.id));
  const compoundIds = new Set(compound?.clipIds ?? []);
  const moving = compound ? edl.clips.filter((clip) => clip.id && compoundIds.has(clip.id)) : anchor.groupId ? edl.clips.filter((clip) => clip.groupId === anchor.groupId) : [anchor];
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

export function trimCutClip(
  edl: CutEdl,
  clipId: string,
  edge: "start" | "end",
  requestedTimelineTime: number,
  options: { rippleMode?: CutRippleMode; rippleTrack?: boolean; sourceDuration?: number; minimumDuration?: number } = {},
): CutEdl {
  if (edl.version !== 3) return edl;
  const anchor = edl.clips.find((clip) => clip.id === clipId);
  if (!anchor) return edl;
  const speed = anchor.speed ?? 1;
  const timelineStart = anchor.timelineStart ?? 0;
  const originalDuration = (anchor.end - anchor.start) / speed;
  const timelineEnd = timelineStart + originalDuration;
  const minimumDuration = Math.max(0.05, options.minimumDuration ?? 0.05);
  const sourceDuration = Math.max(anchor.end, options.sourceDuration ?? 43_200);

  if (edge === "start") {
    const requested = Math.max(0, Math.min(timelineEnd - minimumDuration / speed, requestedTimelineTime));
    const sourceStart = Math.max(0, Math.min(anchor.end - minimumDuration, anchor.start + (requested - timelineStart) * speed));
    const actualTimelineStart = timelineStart + (sourceStart - anchor.start) / speed;
    return { ...edl, clips: edl.clips.map((clip) => clip === anchor ? { ...clip, start: sourceStart, timelineStart: actualTimelineStart } : clip) };
  }

  const requested = Math.max(timelineStart + minimumDuration / speed, requestedTimelineTime);
  const sourceEnd = Math.max(anchor.start + minimumDuration, Math.min(sourceDuration, anchor.start + (requested - timelineStart) * speed));
  const nextDuration = (sourceEnd - anchor.start) / speed;
  const durationDelta = nextDuration - originalDuration;
  const track = anchor.track ?? "v1";
  const rippleMode = options.rippleMode ?? (options.rippleTrack ? "track" : "off");
  const shouldRippleClip = (clip: CutClip) => {
    if (rippleMode === "off" || (clip.timelineStart ?? 0) < timelineEnd - 0.001) return false;
    return rippleMode === "linked" || (clip.track ?? "v1") === track;
  };
  return {
    ...edl,
    clips: edl.clips.map((clip) => {
      if (clip === anchor) return { ...clip, end: sourceEnd };
      if (!shouldRippleClip(clip)) return clip;
      return { ...clip, timelineStart: Math.max(0, (clip.timelineStart ?? 0) + durationDelta) };
    }),
    graphics: rippleMode === "linked" ? (edl.graphics ?? []).map((graphic) => graphic.timelineStart < timelineEnd - 0.001 ? graphic : { ...graphic, timelineStart: Math.max(0, graphic.timelineStart + durationDelta) }) : edl.graphics,
    markers: rippleMode === "linked" ? (edl.markers ?? []).map((marker) => marker.position < timelineEnd - 0.001 ? marker : { ...marker, position: Math.max(0, marker.position + durationDelta) }) : edl.markers,
  };
}

export function rollCutEdit(
  edl: CutEdl,
  leftClipId: string,
  requestedTimelineTime: number,
  options: { leftSourceDuration?: number; minimumDuration?: number; adjacencyTolerance?: number } = {},
): CutEdl {
  if (edl.version !== 3) return edl;
  const left = edl.clips.find((clip) => clip.id === leftClipId);
  if (!left) return edl;
  const leftSpeed = left.speed ?? 1;
  const leftTimelineStart = left.timelineStart ?? 0;
  const boundary = leftTimelineStart + (left.end - left.start) / leftSpeed;
  const tolerance = Math.max(0.001, options.adjacencyTolerance ?? 0.02);
  const right = edl.clips
    .filter((clip) => clip !== left && (clip.track ?? "v1") === (left.track ?? "v1"))
    .map((clip) => ({ clip, distance: Math.abs((clip.timelineStart ?? 0) - boundary) }))
    .filter((candidate) => candidate.distance <= tolerance)
    .sort((a, b) => a.distance - b.distance)[0]?.clip;
  if (!right) return edl;

  const rightSpeed = right.speed ?? 1;
  const rightTimelineStart = right.timelineStart ?? boundary;
  const minimumDuration = Math.max(0.05, options.minimumDuration ?? 0.05);
  const leftSourceDuration = Math.max(left.end, options.leftSourceDuration ?? 43_200);
  const lowerBound = Math.max(
    leftTimelineStart + minimumDuration,
    rightTimelineStart - right.start / rightSpeed,
  );
  const upperBound = Math.min(
    leftTimelineStart + (leftSourceDuration - left.start) / leftSpeed,
    rightTimelineStart + (right.end - right.start) / rightSpeed - minimumDuration,
  );
  if (upperBound < lowerBound) return edl;
  const nextBoundary = Math.max(lowerBound, Math.min(upperBound, requestedTimelineTime));
  const boundaryDelta = nextBoundary - rightTimelineStart;
  const nextLeftEnd = left.start + (nextBoundary - leftTimelineStart) * leftSpeed;
  const nextRightStart = right.start + boundaryDelta * rightSpeed;
  return {
    ...edl,
    clips: edl.clips.map((clip) => {
      if (clip === left) return { ...clip, end: nextLeftEnd };
      if (clip === right) return { ...clip, start: nextRightStart, timelineStart: nextBoundary };
      return clip;
    }),
  };
}

export function slipCutClip(edl: CutEdl, clipId: string, requestedSourceDelta: number, sourceDuration: number): CutEdl {
  if (edl.version !== 3 || !Number.isFinite(requestedSourceDelta)) return edl;
  const anchor = edl.clips.find((clip) => clip.id === clipId);
  if (!anchor) return edl;
  const maximumSource = Math.max(anchor.end, sourceDuration);
  const delta = Math.max(-anchor.start, Math.min(maximumSource - anchor.end, requestedSourceDelta));
  if (Math.abs(delta) < 0.000001) return edl;
  return {
    ...edl,
    clips: edl.clips.map((clip) => clip === anchor ? { ...clip, start: clip.start + delta, end: clip.end + delta } : clip),
  };
}

export function applyTranscriptStoryOrder(edl: CutEdl, transcript: CutTranscript): CutEdl {
  if (edl.version !== 3) return edl;
  const base = edl.clips.find((clip) => (clip.track ?? "v1") === "v1" && !clip.assetId);
  if (!base) return edl;
  let cursor = 0;
  const storyClips = transcript.segments.flatMap((segment, index) => {
    if (segment.end - segment.start < 0.05) return [];
    const speed = base.speed ?? 1;
    const clip: CutClip = {
      ...base,
      id: `story_${segment.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 50)}_${index}`,
      label: `${segment.speaker ? `${segment.speaker}: ` : ""}${segment.text || `Segment ${index + 1}`}`.slice(0, 80),
      start: segment.start,
      end: segment.end,
      timelineStart: cursor,
      groupId: undefined,
    };
    cursor += (segment.end - segment.start) / speed;
    return [clip];
  });
  if (!storyClips.length) return edl;
  const overlays = edl.clips.filter((clip) => clip !== base && ((clip.track ?? "v1") !== "v1" || clip.assetId));
  const clips = [...storyClips, ...overlays];
  return { ...edl, clips, compounds: reconcileCutCompounds(edl.compounds, clips) };
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

export function shortTermLufs(energies: number[], floorLufs = -70) {
  const valid = energies.filter((value) => Number.isFinite(value) && value >= 0);
  if (!valid.length) return floorLufs;
  const meanSquare = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  if (meanSquare <= 0) return floorLufs;
  return Math.max(floorLufs, -0.691 + 10 * Math.log10(meanSquare));
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
    blocks.push(`${sequence}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${segment.speaker ? `${segment.speaker}: ` : ""}${segment.text.trim()}\n`);
  }
  return blocks.join("\n");
}

function assTimestamp(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hh = Math.floor(centiseconds / 360_000);
  const mm = Math.floor((centiseconds % 360_000) / 6_000);
  const ss = Math.floor((centiseconds % 6_000) / 100);
  const cs = centiseconds % 100;
  return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/[\r\n]+/g, " ").trim();
}

export function buildKineticAssCaptions(transcript: CutTranscript, edl: CutEdl) {
  const events: string[] = [];
  for (const segment of transcript.segments) {
    const timedWords = segment.words.length ? segment.words : [{ word: segment.text, start: segment.start, end: segment.end }];
    for (const word of timedWords) {
      const start = sourceToOutput(edl, word.start);
      const end = sourceToOutput(edl, Math.max(word.start, word.end - 0.001));
      const text = escapeAssText(word.word);
      if (start === null || end === null || end <= start || !text) continue;
      events.push(`Dialogue: 0,${assTimestamp(start)},${assTimestamp(end)},Kinetic,,0,0,0,,{\\an2\\fscx68\\fscy68\\t(0,120,\\fscx112\\fscy112)\\t(120,220,\\fscx100\\fscy100)}${text}`);
    }
  }
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Kinetic,Arial,78,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,1,2,80,80,110,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join("\n")}\n`;
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
