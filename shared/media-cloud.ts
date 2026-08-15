import { z } from "zod";

export const mediaProcessingKinds = [
  "probe",
  "thumbnail",
  "transcode",
  "package",
  "caption",
  "waveform",
  "moderation",
] as const;

export const mediaProcessingStates = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export const mediaRenditionRoles = [
  "poster",
  "thumbnail",
  "preview",
  "audio",
  "video",
  "adaptive_manifest",
  "download",
] as const;

export const mediaTextTrackKinds = [
  "captions",
  "subtitles",
  "chapters",
  "transcript",
] as const;

export const mediaLineageRelationships = [
  "derived_from",
  "rendered_from",
  "clipped_from",
  "recorded_from",
  "published_from",
  "replaced_by",
] as const;

export const mediaPlaybackEventKinds = [
  "play",
  "pause",
  "seek",
  "progress",
  "quality_change",
  "rebuffer_start",
  "rebuffer_end",
  "ended",
  "error",
] as const;

const boundedMetadata = z.record(z.unknown()).default({});

export const createMediaJobSchema = z.object({
  kind: z.enum(mediaProcessingKinds),
  priority: z.number().int().min(0).max(100).default(50),
  idempotencyKey: z.string().trim().min(8).max(180),
  request: boundedMetadata,
});

export const registerMediaRenditionSchema = z.object({
  renditionKey: z.string().trim().min(1).max(120),
  role: z.enum(mediaRenditionRoles),
  storageProvider: z.string().trim().min(1).max(40),
  storageKey: z.string().trim().min(1).max(1_500),
  publicUrl: z.string().url().max(2_000).nullable().default(null),
  mimeType: z.string().trim().min(1).max(160),
  width: z.number().int().positive().max(16_384).nullable().default(null),
  height: z.number().int().positive().max(16_384).nullable().default(null),
  bitrateKbps: z.number().int().positive().max(1_000_000).nullable().default(null),
  durationMs: z.number().int().nonnegative().max(604_800_000).nullable().default(null),
  sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
  manifestType: z.enum(["hls", "dash"]).nullable().default(null),
  metadata: boundedMetadata,
});

export const registerMediaTextTrackSchema = z.object({
  kind: z.enum(mediaTextTrackKinds),
  language: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/).default("en"),
  label: z.string().trim().min(1).max(120),
  storageProvider: z.string().trim().min(1).max(40),
  storageKey: z.string().trim().min(1).max(1_500),
  publicUrl: z.string().url().max(2_000).nullable().default(null),
  mimeType: z.string().trim().min(1).max(160).default("text/vtt"),
  isDefault: z.boolean().default(false),
  metadata: boundedMetadata,
});

export const createMediaLineageSchema = z.object({
  parentAssetId: z.string().uuid(),
  relationship: z.enum(mediaLineageRelationships),
  metadata: boundedMetadata,
});

export const createAssetCollectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).default(""),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#1d9bf0"),
});

export const updateAssetCollectionSchema = createAssetCollectionSchema.partial();

export const assetRightBases = [
  "owner_declaration",
  "work_for_hire",
  "assignment",
  "license",
  "public_domain",
  "platform_grant",
  "contributor_release",
] as const;

export const assetRightStatuses = ["active", "revoked", "disputed", "expired"] as const;
export const assetPermittedUses = ["all", "native_publish", "commercial_delivery", "editing", "broadcast", "ugc_submission", "external_distribution", "playback", "artwork", "evidence"] as const;

export const assetTagSchema = z.object({
  tag: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
});

const assetRightFields = z.object({
  rightsHolderName: z.string().trim().min(1).max(200),
  basis: z.enum(assetRightBases),
  permittedUses: z.array(z.enum(assetPermittedUses)).min(1).max(10),
  territories: z.array(z.string().trim().regex(/^(worldwide|[A-Z]{2})$/)).min(1).max(250),
  validFrom: z.coerce.date().default(() => new Date()),
  expiresAt: z.coerce.date().nullable().default(null),
  evidenceAssetId: z.string().uuid().nullable().default(null),
  syntheticMedia: z.boolean().default(false),
  clonedVoice: z.boolean().default(false),
  notes: z.string().trim().max(2_000).default(""),
});

const validateAssetRightDates = (value: { validFrom?: Date; expiresAt?: Date | null }, ctx: z.RefinementCtx) => {
  if (value.expiresAt && value.validFrom && value.expiresAt <= value.validFrom) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "Rights expiration must be after its start date" });
};

export const createAssetRightSchema = assetRightFields.superRefine(validateAssetRightDates);
export const updateAssetRightSchema = assetRightFields.partial().superRefine(validateAssetRightDates);

export const createPlaybackSessionSchema = z.object({
  assetId: z.string().uuid(),
  renditionId: z.string().uuid().nullable().default(null),
  clientSessionId: z.string().trim().min(8).max(180),
  playerVersion: z.string().trim().max(80).default("web"),
  metadata: boundedMetadata,
});

export const recordPlaybackEventSchema = z.object({
  sequence: z.number().int().positive().max(1_000_000),
  kind: z.enum(mediaPlaybackEventKinds),
  occurredAt: z.coerce.date(),
  positionMs: z.number().int().nonnegative().max(604_800_000).default(0),
  bufferedMs: z.number().int().nonnegative().max(604_800_000).default(0),
  bitrateKbps: z.number().int().nonnegative().max(1_000_000).nullable().default(null),
  metadata: boundedMetadata,
});

type MediaProcessingState = (typeof mediaProcessingStates)[number];

const mediaJobTransitions: Record<MediaProcessingState, ReadonlySet<MediaProcessingState>> = {
  queued: new Set<MediaProcessingState>(["running", "cancelled"]),
  running: new Set<MediaProcessingState>(["succeeded", "failed", "cancelled"]),
  succeeded: new Set<MediaProcessingState>(),
  failed: new Set<MediaProcessingState>(["queued"]),
  cancelled: new Set<MediaProcessingState>(["queued"]),
};

export function canTransitionMediaJob(from: string, to: string) {
  if (!mediaProcessingStates.includes(from as (typeof mediaProcessingStates)[number])) return false;
  if (!mediaProcessingStates.includes(to as (typeof mediaProcessingStates)[number])) return false;
  return mediaJobTransitions[from as (typeof mediaProcessingStates)[number]].has(to as (typeof mediaProcessingStates)[number]);
}

export function isAdaptiveManifest(mimeType: string) {
  return ["application/vnd.apple.mpegurl", "application/x-mpegurl", "application/dash+xml"].includes(mimeType.toLowerCase());
}

export function playbackSessionDelta(input: {
  previousKind?: string | null;
  kind: (typeof mediaPlaybackEventKinds)[number];
  positionMs: number;
  previousPositionMs: number;
}) {
  const forwardDelta = Math.max(0, Math.min(30_000, input.positionMs - input.previousPositionMs));
  return {
    watchMs: input.kind === "progress" && input.previousKind !== "seek" ? forwardDelta : 0,
    rebufferCount: input.kind === "rebuffer_start" ? 1 : 0,
    errorCount: input.kind === "error" ? 1 : 0,
  };
}
