import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  broadcastDestinationInputSchema,
  broadcastSceneSchema,
  broadcastSessionStartSchema,
  broadcastSourceSchema,
  defaultBroadcastStudioConfig,
  validateBroadcastStudioConfig,
} from "@shared/broadcast-studio";
import {
  captureCapabilitiesSchema,
  captureNodeClaimSchema,
  captureNodeConfigurationSchema,
  captureTelemetrySchema,
  recommendCaptureEncoding,
} from "@shared/broadcast-field";
import { createCutMulticamGroup, parseCubeLut, validateCutEdl } from "@shared/cut-studio";
import {
  assets,
  broadcastAudienceMessages,
  broadcastBrandKits,
  broadcastCaptureInvitations,
  broadcastCaptureNodes,
  broadcastCaptureTelemetry,
  broadcastDestinationReceipts,
  broadcastDestinations,
  broadcastSessionMarkers,
  broadcastSessionTracks,
  broadcastSessions,
  broadcastStudioCollaborators,
  broadcastStudioVersions,
  broadcastStudios,
  broadcastTemplateCatalog,
  cutStudioProjectMedia,
  cutStudioProjects,
  notifications,
  users,
} from "@shared/schema";
import { attachUser } from "./auth";
import {
  createPrivateAssetReadUrl,
  materializePrivateAsset,
  persistPrivateFile,
  promotePrivateAsset,
  removeStoredAsset,
} from "./asset-storage";
import { businessRoleCanAdminister, businessRoleCanManage, ensureDefaultBusiness, userBusinessRole } from "./businesses";
import { db } from "./db";
import {
  decryptSocialToken,
  encryptSocialToken,
  isSocialTokenEncryptionConfigured,
} from "./social-oauth";
import { emitProjectionEvent } from "./umh";
import { createBroadcastLiveKitToken, getLiveKitConfiguration } from "./livekit";
import { queueMediaIngestJobs, recordAssetUsage, registerAssetLineage } from "./media-cloud";
import { apiRateLimiter, assetUploadRateLimiter } from "./security";

const idSchema = z.string().uuid();
const FIELD_CAPTURE_COOKIE = "cos_field_capture";
const studioInputSchema = z.object({
  name: z.string().trim().min(1).max(120).default("My broadcast studio"),
});
const recordingInputSchema = z.object({
  assetId: z.string().uuid(),
  durationMs: z
    .number()
    .int()
    .positive()
    .max(8 * 60 * 60_000),
});
const markerInputSchema = z.object({
  kind: z.enum(["highlight", "issue", "note"]).default("highlight"),
  label: z.string().trim().min(1).max(160).default("Highlight"),
});
const isolatedTrackInputSchema = z.object({
  assetId: z.string().uuid(),
  sourceId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  sourceName: z.string().trim().min(1).max(120),
  sourceType: z.enum(["camera", "screen", "microphone"]),
  mimeType: z.enum([
    "video/webm",
    "video/webm;codecs=vp8,opus",
    "audio/webm",
    "audio/webm;codecs=opus",
  ]),
  durationMs: z.number().int().positive().max(8 * 60 * 60_000),
  quality: z.object({
    width: z.number().int().positive().max(7680).optional(),
    height: z.number().int().positive().max(4320).optional(),
    fps: z.number().positive().max(240).optional(),
    audioChannels: z.number().int().positive().max(32).optional(),
    sampleRate: z.number().int().positive().max(384_000).optional(),
    videoBitsPerSecond: z.number().int().positive().max(100_000_000).optional(),
    audioBitsPerSecond: z.number().int().positive().max(2_000_000).optional(),
  }).strict().default({}),
});
const brandKitInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  surfaceColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  textColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  logoAssetId: z.string().uuid().nullable().default(null),
});
const templateCatalogInputSchema = z.discriminatedUnion("kind", [
  z.object({ businessId: z.string().uuid(), kind: z.literal("scene"), name: z.string().trim().min(1).max(80), payload: broadcastSceneSchema }),
  z.object({ businessId: z.string().uuid(), kind: z.literal("source"), name: z.string().trim().min(1).max(80), payload: broadcastSourceSchema }),
]);
const mediaLibraryInputSchema = z.object({
  businessId: z.string().uuid(),
  assetId: z.string().uuid(),
  name: z.string().trim().min(1).max(255).optional(),
});
const broadcastLutInputSchema = z.object({
  businessId: z.string().uuid(),
  assetId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
});
const captureInvitationInputSchema = z.object({
  expiresInMinutes: z.number().int().min(5).max(60).default(15),
});
const captureNodeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  configuration: captureNodeConfigurationSchema.optional(),
});

function hashCaptureSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function publicCaptureNode(row: typeof broadcastCaptureNodes.$inferSelect) {
  const { deviceSecretHash: _deviceSecretHash, ...safe } = row;
  return safe;
}

async function authenticatedCaptureNode(req: Request) {
  const authorization = req.header("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,256})$/)?.[1] ?? null;
  if (authorization && !bearer) return null;
  const cookieValue = (req.header("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${FIELD_CAPTURE_COOKIE}=`))
    ?.slice(FIELD_CAPTURE_COOKIE.length + 1) ?? null;
  const cookie = cookieValue?.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32,256})$/i) ?? null;
  const secret = bearer ?? cookie?.[2] ?? null;
  if (!secret) return null;
  const [node] = await db.select().from(broadcastCaptureNodes).where(and(
    eq(broadcastCaptureNodes.deviceSecretHash, hashCaptureSecret(secret)),
    isNull(broadcastCaptureNodes.revokedAt),
  )).limit(1);
  if (cookie && node?.id !== cookie[1]) return null;
  return node ?? null;
}

function fieldCaptureCookie(nodeId: string, deviceSecret: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${FIELD_CAPTURE_COOKIE}=${nodeId}.${deviceSecret}; Path=/api/broadcast/capture/nodes/${nodeId}; Max-Age=86400; HttpOnly; SameSite=Strict${secure}`;
}

function captureDeviceRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    void handler(req, res).catch((error) => {
      console.error("Capture device request failed:", error instanceof Error ? error.message : error);
      if (!res.headersSent) res.status(500).json({ message: "The capture control plane could not complete this request" });
    });
  };
}

function portableTemplatePayload(input: z.infer<typeof templateCatalogInputSchema>) {
  if (input.kind === "source") return { ...input.payload, assetId: null, captureNodeId: null };
  return { ...input.payload, sources: input.payload.sources.map((source) => ({ ...source, assetId: null, captureNodeId: null })) };
}
const studioCollaboratorInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  role: z.enum(["viewer", "editor"]).default("viewer"),
});
const audienceCommentInputSchema = z.object({ body: z.string().trim().min(1).max(500) });
const audienceCtaInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  actionUrl: z.string().url().refine((value) => new URL(value).protocol === "https:", "CTA links must use HTTPS"),
});
const audienceModerationInputSchema = z.object({ action: z.enum(["feature", "hide", "show"]) });
const runtimeMachineId =
  process.env.FLY_MACHINE_ID?.trim() || `local-${process.pid}`;

type Runtime = {
  sessionId: string;
  child: ChildProcessWithoutNullStreams;
  outputPath: string | null;
  ownerUserId: number;
  businessId: string;
  studioId: string;
  outputMode: "stream" | "recording";
  stopping: boolean;
  startedAt: number;
  lastHealthWrite: number;
  health: Record<string, unknown>;
  timeout: NodeJS.Timeout;
  finalized: boolean;
  progressBuffer: string;
  healthWrite: Promise<void>;
};

const runtimes = new Map<string, Runtime>();

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
}
async function privateBroadcastMediaDescriptor(asset: typeof assets.$inferSelect, localUrl = `/api/broadcast/media/${asset.id}/stream`) {
  if (asset.storageProvider === "local" && process.env.NODE_ENV !== "production") return { url: localUrl, expiresAt: null };
  return createPrivateAssetReadUrl(asset.storageKey);
}
async function streamPrivateBroadcastMedia(res: Response, asset: typeof assets.$inferSelect) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-broadcast-media-"));
  const outputPath = path.join(temp, asset.originalFilename?.replace(/[^A-Za-z0-9._-]/g, "-") || "media.bin");
  try {
    await materializePrivateAsset(asset.storageKey, outputPath);
    res.type(asset.mimeType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(outputPath)}"`);
    res.sendFile(outputPath, { acceptRanges: true }, (error) => {
      void fs.rm(temp, { recursive: true, force: true });
      if (error && !res.headersSent) res.status(500).end();
    });
  } catch (error) {
    await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
function publicDestination(row: typeof broadcastDestinations.$inferSelect) {
  const { streamKeyCiphertext: _secret, ...safe } = row;
  return {
    ...safe,
    hasStreamKey: true,
    ingestUrl: maskBroadcastDestinationUrl(row.ingestUrl),
  };
}
export function maskBroadcastDestinationUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    return url.toString();
  } catch {
    return "Configured destination";
  }
}
export function isPrivateBroadcastAddress(address: string) {
  if (net.isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] >= 224
    );
  }
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}
async function validatePublicDestination(protocol: string, rawUrl: string) {
  if (/\s|[\u0000-\u001f\u007f]/.test(rawUrl))
    throw new Error("Destination contains invalid characters");
  const url = new URL(rawUrl);
  if (url.protocol !== `${protocol}:`)
    throw new Error("Destination protocol does not match the URL");
  if (!["rtmp:", "rtmps:", "srt:"].includes(url.protocol))
    throw new Error("Only RTMP, RTMPS, and SRT destinations are supported");
  if (!url.hostname || url.username || url.password)
    throw new Error("Destination credentials must be stored separately");
  if (url.search || url.hash)
    throw new Error(
      "Destination query parameters and fragments are not allowed",
    );
  const results = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (
    !results.length ||
    results.some((result) => isPrivateBroadcastAddress(result.address))
  )
    throw new Error("Destination must resolve only to public addresses");
  return url;
}
function destinationWithKey(row: typeof broadcastDestinations.$inferSelect) {
  const key = decryptSocialToken(row.streamKeyCiphertext);
  if (/\s|[\u0000-\u001f\u007f]/.test(key))
    throw new Error("Stored stream key is invalid");
  const url = new URL(row.ingestUrl);
  if (row.protocol === "srt") url.searchParams.set("streamid", key);
  else url.pathname = `${url.pathname.replace(/\/+$/, "")}/${key}`;
  return url.toString();
}
export function buildBroadcastTeeOutput(destinations: Array<{ protocol: string; url: string; videoStreamIndex?: number }>) {
  if (!destinations.length) throw new Error("At least one stream destination is required");
  return destinations.map((destination) => {
    const format = destination.protocol === "srt" ? "mpegts" : "flv";
    const escapedUrl = destination.url.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
    const selection = destination.videoStreamIndex === undefined ? "" : `:select='v\\:${destination.videoStreamIndex},a\\:0'`;
    return `[f=${format}:onfail=ignore${selection}]${escapedUrl}`;
  }).join("|");
}

type BroadcastOutputLayout = "program" | "landscape" | "portrait" | "square";
type BroadcastFramingMode = "fit" | "fill";

export function broadcastOutputDimensions(layout: BroadcastOutputLayout, program: { width: number; height: number }) {
  if (layout === "program") return program;
  if (layout === "landscape") return { width: 1920, height: 1080 };
  if (layout === "portrait") return { width: 1080, height: 1920 };
  return { width: 1080, height: 1080 };
}

export function buildBroadcastVariantPlan(
  destinations: Array<{ outputLayout: string; framingMode: string }>,
  program: { width: number; height: number },
) {
  const variants: Array<{ key: string; outputLayout: BroadcastOutputLayout; framingMode: BroadcastFramingMode; width: number; height: number }> = [];
  const destinationVariantIndexes = destinations.map((destination) => {
    const outputLayout = z.enum(["program", "landscape", "portrait", "square"]).parse(destination.outputLayout);
    const framingMode = z.enum(["fit", "fill"]).parse(destination.framingMode);
    const dimensions = broadcastOutputDimensions(outputLayout, program);
    const key = `${dimensions.width}x${dimensions.height}:${framingMode}`;
    let index = variants.findIndex((variant) => variant.key === key);
    if (index < 0) {
      index = variants.length;
      variants.push({ key, outputLayout, framingMode, ...dimensions });
    }
    return index;
  });
  return { variants, destinationVariantIndexes };
}

export function buildBroadcastVariantFilters(variants: Array<{ framingMode: BroadcastFramingMode; width: number; height: number }>) {
  if (!variants.length) throw new Error("At least one output variant is required");
  const splitOutputs = variants.map((_, index) => `[variant_input_${index}]`).join("");
  const filters = [`[0:v:0]split=${variants.length}${splitOutputs}`];
  variants.forEach((variant, index) => {
    const scale = variant.framingMode === "fill"
      ? `scale=${variant.width}:${variant.height}:force_original_aspect_ratio=increase,crop=${variant.width}:${variant.height}`
      : `scale=${variant.width}:${variant.height}:force_original_aspect_ratio=decrease,pad=${variant.width}:${variant.height}:(ow-iw)/2:(oh-ih)/2:black`;
    filters.push(`[variant_input_${index}]${scale},setsar=1[variant_${index}]`);
  });
  return { filterComplex: filters.join(";"), videoMaps: variants.map((_, index) => `[variant_${index}]`) };
}
async function ownedStudio(userId: number, id: string) {
  const [row] = await db
    .select()
    .from(broadcastStudios)
    .where(
      and(
        eq(broadcastStudios.id, id),
        eq(broadcastStudios.ownerUserId, userId),
      ),
    )
    .limit(1);
  return row;
}
async function studioAccess(userId: number, id: string) {
  const studio = await ownedStudio(userId, id);
  if (studio) return { studio, role: "owner" as const, canEdit: true, canOperate: true };
  const [collaborator] = await db.select().from(broadcastStudioCollaborators).where(and(
    eq(broadcastStudioCollaborators.studioId, id),
    eq(broadcastStudioCollaborators.userId, userId),
  )).limit(1);
  if (!collaborator) return null;
  const [sharedStudio] = await db.select().from(broadcastStudios).where(eq(broadcastStudios.id, id)).limit(1);
  if (!sharedStudio) return null;
  return { studio: sharedStudio, role: collaborator.role as "viewer" | "editor", canEdit: collaborator.role === "editor", canOperate: false };
}
async function studioParticipants(studio: typeof broadcastStudios.$inferSelect) {
  const collaborators = await db.select().from(broadcastStudioCollaborators).where(eq(broadcastStudioCollaborators.studioId, studio.id)).orderBy(broadcastStudioCollaborators.createdAt);
  const participantIds = [studio.ownerUserId, ...collaborators.map((item) => item.userId)];
  const accounts = await db.select({ id: users.id, username: users.username, displayName: users.displayName, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, participantIds));
  return accounts.map((account) => ({
    ...account,
    role: account.id === studio.ownerUserId ? "owner" : collaborators.find((item) => item.userId === account.id)?.role ?? "viewer",
  }));
}
async function ownedDestination(userId: number, id: string) {
  const [row] = await db
    .select()
    .from(broadcastDestinations)
    .where(
      and(
        eq(broadcastDestinations.id, id),
        eq(broadcastDestinations.ownerUserId, userId),
      ),
    )
    .limit(1);
  return row;
}
async function ownedSession(userId: number, id: string) {
  const [row] = await db
    .select()
    .from(broadcastSessions)
    .where(
      and(
        eq(broadcastSessions.id, id),
        eq(broadcastSessions.ownerUserId, userId),
      ),
    )
    .limit(1);
  return row;
}
function replayToRuntime(res: Response, machineId: string | null) {
  if (
    !machineId ||
    machineId === runtimeMachineId ||
    !process.env.FLY_MACHINE_ID
  )
    return false;
  res.setHeader("fly-replay", `instance=${machineId}`);
  res.status(409).end();
  return true;
}
function parseProgress(runtime: Runtime, text: string) {
  runtime.progressBuffer += text;
  const lines = runtime.progressBuffer.split(/\r?\n/);
  runtime.progressBuffer = lines.pop() ?? "";
  let completedBlock = false;
  for (const line of lines) {
    const [key, value] = line.split("=", 2);
    if (!value) continue;
    if (key === "frame") runtime.health.frame = Number(value) || 0;
    if (key === "fps") runtime.health.fps = Number(value) || 0;
    if (key === "bitrate")
      runtime.health.bitrateKbps =
        Number(value.replace(/kbits\/s/i, "").trim()) || 0;
    if (key === "total_size")
      runtime.health.totalSizeBytes = Number(value) || 0;
    if (key === "drop_frames")
      runtime.health.droppedFrames = Number(value) || 0;
    if (key === "speed") runtime.health.speed = value;
    if (key === "progress") completedBlock = true;
  }
  runtime.health.uptimeSeconds = Math.round(
    (Date.now() - runtime.startedAt) / 1000,
  );
  if (completedBlock && Date.now() - runtime.lastHealthWrite > 2_000) {
    runtime.lastHealthWrite = Date.now();
    const snapshot = { ...runtime.health };
    runtime.healthWrite = runtime.healthWrite
      .then(async () => {
        await db
          .update(broadcastSessions)
          .set({ health: snapshot, updatedAt: new Date() })
          .where(eq(broadcastSessions.id, runtime.sessionId));
      })
      .catch(() => undefined);
  }
}
async function persistRuntimeRecording(runtime: Runtime) {
  if (!runtime.outputPath) return null;
  const filename = `broadcast-${new Date(runtime.startedAt).toISOString().replace(/[:.]/g, "-")}.mp4`;
  const stored = await persistPrivateFile({
    sourcePath: runtime.outputPath,
    ownerUserId: runtime.ownerUserId,
    kind: "broadcast",
    filename,
    mimeType: "video/mp4",
  });
  const [asset] = await db
    .insert(assets)
    .values({
      ownerUserId: runtime.ownerUserId,
      businessId: runtime.businessId,
      kind: "video",
      storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local",
      storageKey: stored.storageKey,
      mimeType: "video/mp4",
      sizeBytes: stored.sizeBytes,
      visibility: "private",
      status: "ready",
      originalFilename: filename,
      metadata: {
        broadcastSessionId: runtime.sessionId,
        broadcastStudioId: runtime.studioId,
      },
    })
    .returning();
  await queueMediaIngestJobs(asset);
  await recordAssetUsage({ assetId: asset.id, actorUserId: runtime.ownerUserId, surfaceType: "broadcast", surfaceId: runtime.sessionId, useType: "broadcast" });
  return asset;
}
async function finalizeRuntime(runtime: Runtime, code: number | null) {
  if (runtime.finalized) return;
  runtime.finalized = true;
  clearTimeout(runtime.timeout);
  runtimes.delete(runtime.sessionId);
  try {
    await runtime.healthWrite;
    let recording = null;
    let recordingIsUsable = runtime.outputMode !== "recording";
    if (runtime.outputMode === "recording" && runtime.outputPath) {
      const output = await fs.stat(runtime.outputPath).catch(() => null);
      recordingIsUsable = Boolean(output?.isFile() && output.size > 0);
      if (runtime.stopping && recordingIsUsable)
        recording = await persistRuntimeRecording(runtime);
    }
    // FFmpeg commonly exits with a non-zero code after a deliberate SIGINT even
    // though it wrote a valid trailer. User-requested stops are successful when
    // the stream stopped cleanly or a non-empty recording was produced.
    const completed = runtime.stopping && recordingIsUsable;
    const state = completed ? "complete" : "error";
    await db
      .update(broadcastSessions)
      .set({
        state,
        recordingAssetId: recording?.id ?? null,
        health: runtime.health,
        errorCode: state === "error" ? "encoder_exit" : null,
        errorMessage:
          state === "error"
            ? "The broadcast encoder stopped unexpectedly"
            : null,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(broadcastSessions.id, runtime.sessionId));
    await db
      .update(broadcastDestinationReceipts)
      .set({
        state,
        detail: state === "complete" ? "Output completed" : "Encoder stopped unexpectedly",
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(broadcastDestinationReceipts.sessionId, runtime.sessionId));
    await emitProjectionEvent({
      aggregateType: "broadcast_studio",
      aggregateId: runtime.studioId,
      eventType:
        state === "complete"
          ? runtime.outputMode === "recording"
            ? "broadcast.recording.ready"
            : "broadcast.stream.ended"
          : "broadcast.stream.failed",
      actorUserId: runtime.ownerUserId,
      payload: {
        businessId: runtime.businessId,
        sessionId: runtime.sessionId,
        recordingAssetId: recording?.id ?? null,
      },
      idempotencyKey: `broadcast:${runtime.sessionId}:${state}`,
    });
  } finally {
    if (runtime.outputPath)
      await fs
        .rm(path.dirname(runtime.outputPath), { recursive: true, force: true })
        .catch(() => undefined);
  }
}
function buildFfmpegArgs(
  input: z.infer<typeof broadcastSessionStartSchema>,
  studio: typeof broadcastStudios.$inferSelect,
  destinations: Array<typeof broadcastDestinations.$inferSelect>,
  outputPath: string | null,
) {
  const { width, height, fps } = studio.config.canvas;
  const args = ["-hide_banner", "-loglevel", "warning", "-y"];
  if (input.sourceMode === "test_pattern")
    args.push(
      "-re",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=${width}x${height}:rate=${fps}`,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
    );
  else args.push("-fflags", "+genpts", "-f", "webm", "-i", "pipe:0");
  const variantPlan = input.outputMode === "stream" ? buildBroadcastVariantPlan(destinations, { width, height }) : null;
  if (variantPlan && (variantPlan.variants.length > 1 || variantPlan.variants[0]?.key !== `${width}x${height}:fit`)) {
    const variantFilters = buildBroadcastVariantFilters(variantPlan.variants);
    args.push("-filter_complex", variantFilters.filterComplex);
    variantFilters.videoMaps.forEach((map) => args.push("-map", map));
  } else args.push("-map", "0:v:0");
  args.push(
    "-map",
    input.sourceMode === "test_pattern" ? "1:a:0" : "0:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-g",
    String(fps * 2),
    "-keyint_min",
    String(fps * 2),
    "-b:v",
    `${input.videoBitrateKbps}k`,
    "-maxrate",
    `${input.videoBitrateKbps}k`,
    "-bufsize",
    `${input.videoBitrateKbps * 2}k`,
    "-c:a",
    "aac",
    "-b:a",
    `${input.audioBitrateKbps}k`,
    "-ar",
    "48000",
    "-progress",
    "pipe:2",
    "-stats_period",
    "1",
  );
  if (input.outputMode === "stream" && destinations.length) {
    args.push(
      "-f",
      "tee",
      "-use_fifo",
      "1",
      "-fifo_options",
      "attempt_recovery=1:recovery_wait_time=2:restart_with_keyframe=1:drop_pkts_on_overflow=1:queue_size=120",
      buildBroadcastTeeOutput(destinations.map((destination, index) => ({ protocol: destination.protocol, url: destinationWithKey(destination), videoStreamIndex: variantPlan?.destinationVariantIndexes[index] ?? 0 }))),
    );
  }
  else if (outputPath)
    args.push(
      "-movflags",
      "+frag_keyframe+empty_moov",
      "-f",
      "mp4",
      outputPath,
    );
  else throw new Error("Broadcast output is unavailable");
  return args;
}
async function launchRuntime(
  session: typeof broadcastSessions.$inferSelect,
  studio: typeof broadcastStudios.$inferSelect,
  destinations: Array<typeof broadcastDestinations.$inferSelect>,
  request: z.infer<typeof broadcastSessionStartSchema>,
) {
  const temp =
    request.outputMode === "recording"
      ? await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-broadcast-"))
      : null;
  const outputPath = temp ? path.join(temp, "recording.mp4") : null;
  const child = spawn(
    "ffmpeg",
    buildFfmpegArgs(request, studio, destinations, outputPath),
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  ) as ChildProcessWithoutNullStreams;
  const runtime: Runtime = {
    sessionId: session.id,
    child,
    outputPath,
    ownerUserId: session.ownerUserId,
    businessId: session.businessId,
    studioId: session.studioId,
    outputMode: request.outputMode,
    stopping: false,
    startedAt: Date.now(),
    lastHealthWrite: 0,
    health: {
      frame: 0,
      fps: 0,
      bitrateKbps: 0,
      totalSizeBytes: 0,
      droppedFrames: 0,
      uptimeSeconds: 0,
      statusTier: "starting",
    },
    timeout: setTimeout(
      () => {
        runtime.stopping = true;
        child.stdin.end();
        child.kill("SIGINT");
      },
      8 * 60 * 60_000,
    ),
    finalized: false,
    progressBuffer: "",
    healthWrite: Promise.resolve(),
  };
  runtimes.set(session.id, runtime);
  child.stderr.on("data", (chunk) => parseProgress(runtime, String(chunk)));
  child.once("error", () => void finalizeRuntime(runtime, null));
  child.once("close", (code) => void finalizeRuntime(runtime, code));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 700);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error("Encoder could not start"));
      }
    });
  });
  runtime.health.statusTier = "healthy";
  await db
    .update(broadcastSessions)
    .set({
      state: "live",
      startedAt: new Date(runtime.startedAt),
      health: runtime.health,
      updatedAt: new Date(),
    })
    .where(eq(broadcastSessions.id, session.id));
  await db
    .update(broadcastDestinationReceipts)
    .set({ state: "live", detail: "Protected fan-out is delivering with isolated automatic recovery", startedAt: new Date(runtime.startedAt), updatedAt: new Date() })
    .where(eq(broadcastDestinationReceipts.sessionId, session.id));
}

export function registerBroadcastStudioRoutes(app: Express) {
  app.post("/api/broadcast/capture/claim", apiRateLimiter({ max: 20 }), captureDeviceRoute(async (req, res) => {
    noStore(res);
    const parsed = captureNodeClaimSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const tokenHash = hashCaptureSecret(parsed.data.token);
    const deviceSecret = randomBytes(32).toString("base64url");
    const now = new Date();
    const configuration = captureNodeConfigurationSchema.parse({});
    const node = await db.transaction(async (transaction) => {
      const [invitation] = await transaction.select().from(broadcastCaptureInvitations).where(and(
        eq(broadcastCaptureInvitations.tokenHash, tokenHash),
        isNull(broadcastCaptureInvitations.consumedAt),
        gt(broadcastCaptureInvitations.expiresAt, now),
      )).limit(1);
      if (!invitation) return null;
      const consumed = await transaction.update(broadcastCaptureInvitations).set({ consumedAt: now }).where(and(
        eq(broadcastCaptureInvitations.id, invitation.id),
        isNull(broadcastCaptureInvitations.consumedAt),
      )).returning({ id: broadcastCaptureInvitations.id });
      if (!consumed.length) return null;
      const [studio] = await transaction.select().from(broadcastStudios).where(eq(broadcastStudios.id, invitation.studioId)).limit(1);
      if (!studio) return null;
      const [created] = await transaction.insert(broadcastCaptureNodes).values({
        studioId: studio.id,
        ownerUserId: invitation.ownerUserId,
        businessId: studio.businessId,
        name: parsed.data.name,
        kind: parsed.data.kind,
        status: "ready",
        capabilities: captureCapabilitiesSchema.parse(parsed.data.capabilities),
        configuration,
        deviceSecretHash: hashCaptureSecret(deviceSecret),
      }).returning();
      return created;
    });
    if (!node) return res.status(410).json({ message: "This pairing code is invalid, expired, or already used" });
    await emitProjectionEvent({
      aggregateType: "broadcast_studio",
      aggregateId: node.studioId,
      eventType: "broadcast.capture_node.paired",
      actorUserId: node.ownerUserId,
      payload: { businessId: node.businessId, nodeId: node.id, kind: node.kind },
      idempotencyKey: `broadcast:${node.studioId}:capture-node:${node.id}:paired`,
    });
    res.setHeader("Set-Cookie", fieldCaptureCookie(node.id, deviceSecret));
    res.status(201).json({
      node: publicCaptureNode(node),
      telemetryUrl: `/api/broadcast/capture/nodes/${node.id}/telemetry`,
    });
  }));

  app.post("/api/broadcast/capture/nodes/:id/telemetry", apiRateLimiter({ max: 720 }), captureDeviceRoute(async (req, res) => {
    noStore(res);
    const node = await authenticatedCaptureNode(req);
    if (!node || node.id !== req.params.id) return res.status(401).json({ message: "Capture-node authentication failed" });
    const parsed = captureTelemetrySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    if (parsed.data.sequence <= node.lastSequence) return res.status(409).json({ message: "Telemetry sequence was already accepted" });
    const configuration = captureNodeConfigurationSchema.parse(node.configuration);
    const capabilities = captureCapabilitiesSchema.parse(node.capabilities);
    const directive = recommendCaptureEncoding(parsed.data, configuration, capabilities, node.lastDirective ?? undefined);
    const status = parsed.data.state === "pairing" ? "ready" : parsed.data.state;
    const accepted = await db.transaction(async (transaction) => {
      const [updated] = await transaction.update(broadcastCaptureNodes).set({
        status,
        lastTelemetry: parsed.data,
        lastDirective: directive,
        lastSequence: parsed.data.sequence,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(broadcastCaptureNodes.id, node.id),
        isNull(broadcastCaptureNodes.revokedAt),
        lt(broadcastCaptureNodes.lastSequence, parsed.data.sequence),
      )).returning();
      if (!updated) return null;
      await transaction.insert(broadcastCaptureTelemetry).values({
        nodeId: node.id,
        sequence: parsed.data.sequence,
        state: parsed.data.state,
        snapshot: parsed.data,
        directive,
      });
      await transaction.execute(sql`delete from broadcast_capture_telemetry where id in (select id from broadcast_capture_telemetry where node_id = ${node.id} order by sequence desc offset 500)`);
      return updated;
    });
    if (!accepted) return res.status(409).json({ message: "A newer telemetry sample was already accepted" });
    res.status(202).json({
      acceptedSequence: parsed.data.sequence,
      status: accepted.status,
      configuration: captureNodeConfigurationSchema.parse(accepted.configuration),
      directive,
    });
  }));

  app.get("/api/broadcast/capture/nodes/:id/configuration", apiRateLimiter({ max: 120 }), captureDeviceRoute(async (req, res) => {
    noStore(res);
    const node = await authenticatedCaptureNode(req);
    if (!node || node.id !== req.params.id) return res.status(401).json({ message: "Capture-node authentication failed" });
    res.json({
      nodeId: node.id,
      status: node.status,
      configuration: captureNodeConfigurationSchema.parse(node.configuration),
      lastAcceptedSequence: node.lastSequence,
      directive: node.lastDirective,
    });
  }));

  app.get("/api/broadcast/capture/nodes/:id/media-token", apiRateLimiter({ max: 30 }), captureDeviceRoute(async (req, res) => {
    noStore(res);
    const node = await authenticatedCaptureNode(req);
    if (!node || node.id !== req.params.id) return res.status(401).json({ message: "Capture-node authentication failed" });
    const configuration = getLiveKitConfiguration();
    if (!configuration) return res.status(503).json({ message: "Real-time field transport is not configured" });
    res.json(await createBroadcastLiveKitToken(configuration, {
      studioId: node.studioId,
      identity: `capture-node-${node.id}`,
      name: node.name,
      role: "field_camera",
      canPublish: true,
      canSubscribe: false,
    }));
  }));

  app.get("/api/broadcast/studios/:id/capture-nodes", attachUser, async (req, res) => {
    noStore(res);
    const access = await studioAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Studio not found" });
    const nodes = await db.select().from(broadcastCaptureNodes).where(eq(broadcastCaptureNodes.studioId, access.studio.id)).orderBy(desc(broadcastCaptureNodes.updatedAt));
    res.json(nodes.map(publicCaptureNode));
  });

  app.get("/api/broadcast/studios/:id/media-token", attachUser, async (req, res) => {
    noStore(res);
    const access = await studioAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Studio not found" });
    const configuration = getLiveKitConfiguration();
    if (!configuration) return res.status(503).json({ message: "Real-time field transport is not configured" });
    res.json(await createBroadcastLiveKitToken(configuration, {
      studioId: access.studio.id,
      identity: `broadcast-operator-${req.dbUser!.id}-${randomBytes(6).toString("hex")}`,
      name: "Broadcast operator",
      role: "operator",
      canPublish: false,
      canSubscribe: true,
    }));
  });

  app.post("/api/broadcast/studios/:id/capture-invitations", attachUser, async (req, res) => {
    noStore(res);
    const parsed = captureInvitationInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const studio = await ownedStudio(req.dbUser!.id, req.params.id);
    if (!studio) return res.status(404).json({ message: "Studio not found" });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + parsed.data.expiresInMinutes * 60_000);
    await db.transaction(async (transaction) => {
      await transaction.delete(broadcastCaptureInvitations).where(and(
        eq(broadcastCaptureInvitations.studioId, studio.id),
        lt(broadcastCaptureInvitations.expiresAt, new Date()),
      ));
      await transaction.insert(broadcastCaptureInvitations).values({
        studioId: studio.id,
        ownerUserId: req.dbUser!.id,
        tokenHash: hashCaptureSecret(token),
        expiresAt,
      });
    });
    res.status(201).json({
      token,
      expiresAt,
      claimUrl: `${req.protocol}://${req.get("host")}/api/broadcast/capture/claim`,
      fieldUrl: `${req.protocol}://${req.get("host")}/broadcast/field?token=${encodeURIComponent(token)}`,
    });
  });

  app.patch("/api/broadcast/studios/:id/capture-nodes/:nodeId", attachUser, async (req, res) => {
    noStore(res);
    const parsed = captureNodeUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const studio = await ownedStudio(req.dbUser!.id, req.params.id);
    if (!studio) return res.status(404).json({ message: "Studio not found" });
    const [updated] = await db.update(broadcastCaptureNodes).set({
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.configuration ? { configuration: parsed.data.configuration } : {}),
      updatedAt: new Date(),
    }).where(and(eq(broadcastCaptureNodes.id, req.params.nodeId), eq(broadcastCaptureNodes.studioId, studio.id), isNull(broadcastCaptureNodes.revokedAt))).returning();
    if (!updated) return res.status(404).json({ message: "Capture node not found" });
    await emitProjectionEvent({ aggregateType: "broadcast_studio", aggregateId: studio.id, eventType: "broadcast.capture_node.configured", actorUserId: req.dbUser!.id, payload: { businessId: studio.businessId, nodeId: updated.id }, idempotencyKey: `broadcast:${studio.id}:capture-node:${updated.id}:configuration:${updated.updatedAt.getTime()}` });
    res.json(publicCaptureNode(updated));
  });

  app.delete("/api/broadcast/studios/:id/capture-nodes/:nodeId", attachUser, async (req, res) => {
    noStore(res);
    const studio = await ownedStudio(req.dbUser!.id, req.params.id);
    if (!studio) return res.status(404).json({ message: "Studio not found" });
    const [revoked] = await db.update(broadcastCaptureNodes).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(broadcastCaptureNodes.id, req.params.nodeId), eq(broadcastCaptureNodes.studioId, studio.id), isNull(broadcastCaptureNodes.revokedAt))).returning();
    if (!revoked) return res.status(404).json({ message: "Capture node not found" });
    await emitProjectionEvent({ aggregateType: "broadcast_studio", aggregateId: studio.id, eventType: "broadcast.capture_node.revoked", actorUserId: req.dbUser!.id, payload: { businessId: studio.businessId, nodeId: revoked.id }, idempotencyKey: `broadcast:${studio.id}:capture-node:${revoked.id}:revoked` });
    res.status(204).end();
  });

  app.get("/api/broadcast/brand-kits", attachUser, async (req, res) => {
    noStore(res);
    const kits = await db
      .select()
      .from(broadcastBrandKits)
      .where(eq(broadcastBrandKits.ownerUserId, req.dbUser!.id))
      .orderBy(desc(broadcastBrandKits.updatedAt));
    res.json(kits);
  });
  app.post("/api/broadcast/brand-kits", attachUser, async (req, res) => {
    noStore(res);
    const parsed = brandKitInputSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    if (parsed.data.logoAssetId) {
      const [logo] = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(
          eq(assets.id, parsed.data.logoAssetId),
          eq(assets.ownerUserId, req.dbUser!.id),
          eq(assets.status, "ready"),
        ))
        .limit(1);
      if (!logo) return res.status(400).json({ message: "Brand logo is not an available account asset" });
    }
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [kit] = await db
      .insert(broadcastBrandKits)
      .values({
        ownerUserId: req.dbUser!.id,
        businessId: business.id,
        ...parsed.data,
      })
      .onConflictDoUpdate({
        target: [broadcastBrandKits.ownerUserId, broadcastBrandKits.name],
        set: {
          primaryColor: parsed.data.primaryColor,
          surfaceColor: parsed.data.surfaceColor,
          textColor: parsed.data.textColor,
          logoAssetId: parsed.data.logoAssetId,
          updatedAt: new Date(),
        },
      })
      .returning();
    res.status(201).json(kit);
  });
  app.delete("/api/broadcast/brand-kits/:id", attachUser, async (req, res) => {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) return res.status(400).json({ message: "Invalid brand kit" });
    const [removed] = await db
      .delete(broadcastBrandKits)
      .where(and(
        eq(broadcastBrandKits.id, parsedId.data),
        eq(broadcastBrandKits.ownerUserId, req.dbUser!.id),
      ))
      .returning({ id: broadcastBrandKits.id });
    if (!removed) return res.status(404).json({ message: "Brand kit not found" });
    res.status(204).end();
  });

  app.get("/api/broadcast/templates", attachUser, async (req, res) => {
    noStore(res);
    const businessId = z.string().uuid().safeParse(req.query.businessId);
    if (!businessId.success) return res.status(400).json({ message: "A valid business is required" });
    const role = await userBusinessRole(req.dbUser!.id, businessId.data);
    if (!role) return res.status(404).json({ message: "Template library not found" });
    const templates = await db.select().from(broadcastTemplateCatalog)
      .where(eq(broadcastTemplateCatalog.businessId, businessId.data))
      .orderBy(desc(broadcastTemplateCatalog.updatedAt));
    res.json(templates.map((template) => ({ ...template, access: { canDelete: template.ownerUserId === req.dbUser!.id || businessRoleCanAdminister(role) } })));
  });

  app.post("/api/broadcast/templates", attachUser, async (req, res) => {
    noStore(res);
    const parsed = templateCatalogInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid studio template" });
    const role = await userBusinessRole(req.dbUser!.id, parsed.data.businessId);
    if (!businessRoleCanManage(role)) return res.status(404).json({ message: "Template library not found" });
    const payload = portableTemplatePayload(parsed.data);
    const [template] = await db.insert(broadcastTemplateCatalog).values({
      businessId: parsed.data.businessId,
      ownerUserId: req.dbUser!.id,
      kind: parsed.data.kind,
      name: parsed.data.name,
      payload,
    }).onConflictDoUpdate({
      target: [broadcastTemplateCatalog.businessId, broadcastTemplateCatalog.kind, broadcastTemplateCatalog.name],
      set: { payload, ownerUserId: req.dbUser!.id, updatedAt: new Date() },
    }).returning();
    await emitProjectionEvent({ aggregateType: "broadcast_template", aggregateId: template.id, eventType: "broadcast.template.saved", actorUserId: req.dbUser!.id, payload: { businessId: template.businessId, kind: template.kind }, idempotencyKey: `broadcast:template:${template.id}:${template.updatedAt.getTime()}` });
    res.status(201).json({ ...template, access: { canDelete: true } });
  });

  app.delete("/api/broadcast/templates/:id", attachUser, async (req, res) => {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) return res.status(400).json({ message: "Invalid studio template" });
    const [template] = await db.select().from(broadcastTemplateCatalog).where(eq(broadcastTemplateCatalog.id, parsedId.data)).limit(1);
    if (!template) return res.status(404).json({ message: "Studio template not found" });
    const role = await userBusinessRole(req.dbUser!.id, template.businessId);
    if (template.ownerUserId !== req.dbUser!.id && !businessRoleCanAdminister(role)) return res.status(404).json({ message: "Studio template not found" });
    await db.delete(broadcastTemplateCatalog).where(eq(broadcastTemplateCatalog.id, template.id));
    res.status(204).end();
  });

  app.get("/api/broadcast/media", attachUser, async (req, res) => {
    noStore(res);
    const businessId = z.string().uuid().safeParse(req.query.businessId);
    if (!businessId.success) return res.status(400).json({ message: "A valid business is required" });
    const role = await userBusinessRole(req.dbUser!.id, businessId.data);
    if (!role) return res.status(404).json({ message: "Media library not found" });
    const rows = await db.select({
      id: assets.id,
      businessId: assets.businessId,
      ownerUserId: assets.ownerUserId,
      kind: assets.kind,
      mimeType: assets.mimeType,
      originalFilename: assets.originalFilename,
      visibility: assets.visibility,
      status: assets.status,
      sizeBytes: assets.sizeBytes,
      createdAt: assets.createdAt,
    }).from(assets).where(and(
      eq(assets.businessId, businessId.data),
      eq(assets.visibility, "private"),
      eq(assets.status, "ready"),
      inArray(assets.kind, ["photo", "video"]),
      sql`${assets.metadata} ->> 'broadcastLibrary' = 'true'`,
    )).orderBy(desc(assets.createdAt)).limit(200);
    res.json(rows.map((asset) => ({
      ...asset,
      library: true,
      access: { canRemove: asset.ownerUserId === req.dbUser!.id || businessRoleCanAdminister(role) },
    })));
  });

  app.post("/api/broadcast/media", attachUser, async (req, res) => {
    noStore(res);
    const parsed = mediaLibraryInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid media asset" });
    const role = await userBusinessRole(req.dbUser!.id, parsed.data.businessId);
    if (!businessRoleCanManage(role)) return res.status(404).json({ message: "Media library not found" });
    const [asset] = await db.select().from(assets).where(and(
      eq(assets.id, parsed.data.assetId),
      eq(assets.ownerUserId, req.dbUser!.id),
      eq(assets.visibility, "private"),
      eq(assets.status, "ready"),
      inArray(assets.kind, ["photo", "video"]),
    )).limit(1);
    if (!asset) return res.status(404).json({ message: "Private production media not found" });
    const [shared] = await db.update(assets).set({
      businessId: parsed.data.businessId,
      originalFilename: parsed.data.name ?? asset.originalFilename,
      metadata: { ...asset.metadata, broadcastLibrary: true, broadcastLibraryAddedAt: new Date().toISOString() },
    }).where(and(eq(assets.id, asset.id), eq(assets.ownerUserId, req.dbUser!.id))).returning();
    await emitProjectionEvent({
      aggregateType: "broadcast_media",
      aggregateId: shared.id,
      eventType: "broadcast.media.shared",
      actorUserId: req.dbUser!.id,
      payload: { businessId: parsed.data.businessId, kind: shared.kind },
      idempotencyKey: `broadcast:media:${shared.id}:shared`,
    });
    res.status(201).json({ ...shared, library: true, access: { canRemove: true } });
  });

  app.get("/api/broadcast/media/:id/access", attachUser, async (req, res) => {
    try {
      noStore(res);
      const parsedId = idSchema.safeParse(req.params.id);
      if (!parsedId.success) return res.status(400).json({ message: "Invalid media asset" });
      const [asset] = await db.select().from(assets).where(and(
        eq(assets.id, parsedId.data),
        eq(assets.visibility, "private"),
        eq(assets.status, "ready"),
        sql`${assets.metadata} ->> 'broadcastLibrary' = 'true'`,
      )).limit(1);
      if (!asset?.businessId || !(await userBusinessRole(req.dbUser!.id, asset.businessId))) return res.status(404).json({ message: "Media asset not found" });
      res.json(await privateBroadcastMediaDescriptor(asset));
    } catch (error) {
      console.error("Unable to issue Broadcast media access:", error);
      res.status(500).json({ message: "Unable to access production media" });
    }
  });

  app.get("/api/broadcast/media/:id/stream", attachUser, async (req, res) => {
    try {
      noStore(res);
      const parsedId = idSchema.safeParse(req.params.id);
      if (!parsedId.success) return res.status(400).json({ message: "Invalid media asset" });
      const [asset] = await db.select().from(assets).where(and(
        eq(assets.id, parsedId.data),
        eq(assets.visibility, "private"),
        eq(assets.status, "ready"),
        sql`${assets.metadata} ->> 'broadcastLibrary' = 'true'`,
      )).limit(1);
      if (!asset?.businessId || !(await userBusinessRole(req.dbUser!.id, asset.businessId))) return res.status(404).json({ message: "Media asset not found" });
      await streamPrivateBroadcastMedia(res, asset);
    } catch (error) {
      console.error("Unable to stream Broadcast media:", error);
      if (!res.headersSent) res.status(500).json({ message: "Unable to stream production media" });
    }
  });

  app.delete("/api/broadcast/media/:id", attachUser, async (req, res) => {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) return res.status(400).json({ message: "Invalid media asset" });
    const [asset] = await db.select().from(assets).where(and(
      eq(assets.id, parsedId.data),
      eq(assets.visibility, "private"),
      eq(assets.status, "ready"),
      sql`${assets.metadata} ->> 'broadcastLibrary' = 'true'`,
    )).limit(1);
    if (!asset?.businessId) return res.status(404).json({ message: "Media asset not found" });
    const role = await userBusinessRole(req.dbUser!.id, asset.businessId);
    if (asset.ownerUserId !== req.dbUser!.id && !businessRoleCanAdminister(role)) return res.status(404).json({ message: "Media asset not found" });
    await db.update(assets).set({ metadata: { ...asset.metadata, broadcastLibrary: false, broadcastLibraryRemovedAt: new Date().toISOString() } }).where(eq(assets.id, asset.id));
    res.status(204).end();
  });

  app.get("/api/broadcast/luts", attachUser, async (req, res) => {
    noStore(res);
    const businessId = z.string().uuid().safeParse(req.query.businessId);
    if (!businessId.success || !(await userBusinessRole(req.dbUser!.id, businessId.data))) return res.status(404).json({ message: "LUT library not found" });
    const rows = await db.select().from(assets).where(and(eq(assets.businessId, businessId.data), eq(assets.kind, "cut-lut"), eq(assets.visibility, "private"), eq(assets.status, "ready"), sql`${assets.metadata} ->> 'broadcastLut' = 'true'`)).orderBy(desc(assets.createdAt)).limit(100);
    res.json(rows.map((asset) => ({ id: asset.id, name: asset.originalFilename, sizeBytes: asset.sizeBytes, metadata: asset.metadata, access: { canRemove: asset.ownerUserId === req.dbUser!.id } })));
  });

  app.post("/api/broadcast/luts", attachUser, assetUploadRateLimiter({ max: 20 }), async (req, res) => {
    noStore(res);
    const parsed = broadcastLutInputSchema.safeParse(req.body);
    if (!parsed.success || !businessRoleCanManage(await userBusinessRole(req.dbUser!.id, parsed.data.businessId))) return res.status(404).json({ message: "LUT library not found" });
    const [asset] = await db.select().from(assets).where(and(eq(assets.id, parsed.data.assetId), eq(assets.ownerUserId, req.dbUser!.id), eq(assets.kind, "cut-lut"), eq(assets.visibility, "private"), eq(assets.status, "ready"))).limit(1);
    if (!asset || (asset.businessId && asset.businessId !== parsed.data.businessId)) return res.status(400).json({ message: "The private LUT asset is not ready" });
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-broadcast-lut-"));
    const lutPath = path.join(temp, "candidate.cube");
    try {
      await materializePrivateAsset(asset.storageKey, lutPath);
      const descriptor = parseCubeLut(await fs.readFile(lutPath, "utf8"));
      const priorMetadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {};
      const [registered] = await db.update(assets).set({ businessId: parsed.data.businessId, originalFilename: parsed.data.name.endsWith(".cube") ? parsed.data.name : `${parsed.data.name}.cube`, metadata: { ...priorMetadata, cubeLut: descriptor, broadcastLut: true, validatedAt: new Date().toISOString() } }).where(and(eq(assets.id, asset.id), eq(assets.ownerUserId, req.dbUser!.id))).returning();
      await emitProjectionEvent({ aggregateType: "broadcast_lut", aggregateId: registered.id, eventType: "broadcast.lut.registered", actorUserId: req.dbUser!.id, payload: { businessId: parsed.data.businessId, size: descriptor.size, entryCount: descriptor.entryCount }, idempotencyKey: `broadcast:lut:${registered.id}:registered` });
      res.status(201).json({ id: registered.id, name: registered.originalFilename, sizeBytes: registered.sizeBytes, metadata: registered.metadata, access: { canRemove: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The LUT file is invalid";
      await removeStoredAsset(asset.storageKey, "private").catch(() => undefined);
      await db.update(assets).set({ status: "rejected", metadata: { rejectionReason: message } }).where(eq(assets.id, asset.id));
      res.status(400).json({ message });
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
  });

  app.get("/api/broadcast/luts/:id/access", attachUser, async (req, res) => {
    noStore(res);
    const [asset] = await db.select().from(assets).where(and(eq(assets.id, req.params.id), eq(assets.kind, "cut-lut"), eq(assets.visibility, "private"), eq(assets.status, "ready"))).limit(1);
    if (!asset?.businessId || !(await userBusinessRole(req.dbUser!.id, asset.businessId))) return res.status(404).json({ message: "LUT not found" });
    res.json(await privateBroadcastMediaDescriptor(asset, `/api/broadcast/luts/${asset.id}/stream`));
  });

  app.get("/api/broadcast/luts/:id/stream", attachUser, async (req, res) => {
    noStore(res);
    const [asset] = await db.select().from(assets).where(and(eq(assets.id, req.params.id), eq(assets.kind, "cut-lut"), eq(assets.visibility, "private"), eq(assets.status, "ready"))).limit(1);
    if (!asset?.businessId || !(await userBusinessRole(req.dbUser!.id, asset.businessId))) return res.status(404).json({ message: "LUT not found" });
    await streamPrivateBroadcastMedia(res, asset);
  });

  app.delete("/api/broadcast/luts/:id", attachUser, async (req, res) => {
    const [asset] = await db.select().from(assets).where(and(eq(assets.id, req.params.id), eq(assets.kind, "cut-lut"), sql`${assets.metadata} ->> 'broadcastLut' = 'true'`)).limit(1);
    if (!asset?.businessId || asset.ownerUserId !== req.dbUser!.id) return res.status(404).json({ message: "LUT not found" });
    const studios = await db.select({ config: broadcastStudios.config }).from(broadcastStudios).where(eq(broadcastStudios.businessId, asset.businessId));
    if (studios.some((studio) => validateBroadcastStudioConfig(studio.config).scenes.some((scene) => scene.sources.some((source) => source.lutAssetId === asset.id)))) return res.status(409).json({ message: "Remove this LUT from every studio source before removing it from the library" });
    await db.update(assets).set({ metadata: { ...(asset.metadata as Record<string, unknown>), broadcastLut: false, broadcastLutRemovedAt: new Date().toISOString() } }).where(eq(assets.id, asset.id));
    res.status(204).end();
  });

  app.get("/api/broadcast/studios", attachUser, async (req, res) => {
    noStore(res);
    const [owned, collaborations] = await Promise.all([db
        .select()
        .from(broadcastStudios)
        .where(eq(broadcastStudios.ownerUserId, req.dbUser!.id))
        .orderBy(desc(broadcastStudios.updatedAt)), db.select().from(broadcastStudioCollaborators).where(eq(broadcastStudioCollaborators.userId, req.dbUser!.id))]);
    const shared = collaborations.length ? await db.select().from(broadcastStudios).where(inArray(broadcastStudios.id, collaborations.map((item) => item.studioId))).orderBy(desc(broadcastStudios.updatedAt)) : [];
    const roleByStudio = new Map(collaborations.map((item) => [item.studioId, item.role]));
    const studios = [...owned.map((studio) => ({ ...studio, access: { role: "owner", canEdit: true, canOperate: true } })), ...shared.map((studio) => ({ ...studio, access: { role: roleByStudio.get(studio.id) ?? "viewer", canEdit: roleByStudio.get(studio.id) === "editor", canOperate: false } }))].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    res.json(studios.map((studio) => ({ ...studio, config: validateBroadcastStudioConfig(studio.config) })));
  });
  app.post("/api/broadcast/studios", attachUser, async (req, res) => {
    noStore(res);
    const parsed = studioInputSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [studio] = await db
      .insert(broadcastStudios)
      .values({
        ownerUserId: req.dbUser!.id,
        businessId: business.id,
        name: parsed.data.name,
        config: defaultBroadcastStudioConfig(),
      })
      .returning();
    await emitProjectionEvent({
      aggregateType: "broadcast_studio",
      aggregateId: studio.id,
      eventType: "broadcast.studio.created",
      actorUserId: req.dbUser!.id,
      payload: { businessId: business.id },
      idempotencyKey: `broadcast:${studio.id}:created`,
    });
    res.status(201).json(studio);
  });
  app.get("/api/broadcast/studios/:id", attachUser, async (req, res) => {
    noStore(res);
    const access = await studioAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Studio not found" });
    const studio = access.studio;
    const sessions = await db
      .select()
      .from(broadcastSessions)
      .where(eq(broadcastSessions.studioId, studio.id))
      .orderBy(desc(broadcastSessions.createdAt))
      .limit(20);
    const tracks = sessions.length ? await db.select().from(broadcastSessionTracks).where(and(
      inArray(broadcastSessionTracks.sessionId, sessions.map((session) => session.id)),
      eq(broadcastSessionTracks.ownerUserId, studio.ownerUserId),
    )).orderBy(broadcastSessionTracks.createdAt) : [];
    const tracksBySession = new Map<string, typeof tracks>();
    for (const track of tracks) tracksBySession.set(track.sessionId, [...(tracksBySession.get(track.sessionId) ?? []), track]);
    res.json({ ...studio, access: { role: access.role, canEdit: access.canEdit, canOperate: access.canOperate }, participants: await studioParticipants(studio), config: validateBroadcastStudioConfig(studio.config), sessions: sessions.map((session) => ({ ...session, tracks: tracksBySession.get(session.id) ?? [] })) });
  });
  app.put("/api/broadcast/studios/:id", attachUser, async (req, res) => {
    noStore(res);
    const access = await studioAccess(req.dbUser!.id, req.params.id);
    if (!access?.canEdit) return res.status(404).json({ message: "Studio not found" });
    const studio = access.studio;
    const expected = Number(req.header("if-match"));
    if (!Number.isInteger(expected))
      return res.status(428).json({ message: "If-Match revision is required" });
    let config;
    try {
      config = validateBroadcastStudioConfig(req.body?.config);
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Invalid studio",
      });
    }
    const lutIds = Array.from(new Set(config.scenes.flatMap((scene) => scene.sources.flatMap((source) => source.lutAssetId ? [source.lutAssetId] : []))));
    if (lutIds.length) {
      const availableLuts = await db.select({ id: assets.id }).from(assets).where(and(inArray(assets.id, lutIds), eq(assets.businessId, studio.businessId), eq(assets.kind, "cut-lut"), eq(assets.visibility, "private"), eq(assets.status, "ready")));
      if (availableLuts.length !== lutIds.length) return res.status(400).json({ message: "Every source LUT must be a private LUT from this production business" });
    }
    const name =
      typeof req.body?.name === "string"
        ? req.body.name.trim().slice(0, 120)
        : studio.name;
    const updated = await db.transaction(async (transaction) => {
      await transaction.insert(broadcastStudioVersions).values({ studioId: studio.id, businessId: studio.businessId, actorUserId: req.dbUser!.id, revision: studio.revision, name: studio.name, config: validateBroadcastStudioConfig(studio.config), reason: "save" }).onConflictDoNothing();
      const [row] = await transaction.update(broadcastStudios).set({ name: name || studio.name, config, revision: sql`${broadcastStudios.revision} + 1`, updatedAt: new Date() }).where(and(eq(broadcastStudios.id, studio.id), eq(broadcastStudios.revision, expected))).returning();
      if (row) await transaction.execute(sql`delete from broadcast_studio_versions where id in (select id from broadcast_studio_versions where studio_id = ${studio.id} order by revision desc offset 50)`);
      return row;
    });
    if (!updated)
      return res.status(409).json({
        message: "Studio changed in another session",
        currentRevision: studio.revision,
      });
    await emitProjectionEvent({
      aggregateType: "broadcast_studio",
      aggregateId: studio.id,
      eventType: "broadcast.studio.updated",
      actorUserId: req.dbUser!.id,
      payload: { businessId: studio.businessId, revision: updated.revision },
      idempotencyKey: `broadcast:${studio.id}:revision:${updated.revision}`,
    });
    res.json({ ...updated, access: { role: access.role, canEdit: access.canEdit, canOperate: access.canOperate } });
  });
  app.get("/api/broadcast/studios/:id/versions", attachUser, async (req, res) => {
    noStore(res);
    const access = await studioAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Studio not found" });
    const rows = await db.select({ id: broadcastStudioVersions.id, revision: broadcastStudioVersions.revision, name: broadcastStudioVersions.name, reason: broadcastStudioVersions.reason, createdAt: broadcastStudioVersions.createdAt, actor: { id: users.id, username: users.username, displayName: users.displayName } }).from(broadcastStudioVersions).leftJoin(users, eq(users.id, broadcastStudioVersions.actorUserId)).where(eq(broadcastStudioVersions.studioId, access.studio.id)).orderBy(desc(broadcastStudioVersions.revision)).limit(50);
    res.json(rows.map((row) => ({ ...row, access: { canRestore: access.canEdit } })));
  });
  app.post("/api/broadcast/studios/:id/versions/:versionId/restore", attachUser, async (req, res) => {
    noStore(res);
    const access = await studioAccess(req.dbUser!.id, req.params.id);
    if (!access?.canEdit) return res.status(404).json({ message: "Studio not found" });
    const expected = Number(req.header("if-match"));
    if (!Number.isInteger(expected)) return res.status(428).json({ message: "If-Match revision is required" });
    const [version] = await db.select().from(broadcastStudioVersions).where(and(eq(broadcastStudioVersions.id, req.params.versionId), eq(broadcastStudioVersions.studioId, access.studio.id))).limit(1);
    if (!version) return res.status(404).json({ message: "Studio version not found" });
    const [active] = await db.select({ id: broadcastSessions.id }).from(broadcastSessions).where(and(eq(broadcastSessions.studioId, access.studio.id), inArray(broadcastSessions.state, ["starting", "live", "stopping"]))).limit(1);
    if (active) return res.status(409).json({ message: "Stop the active output before restoring studio history" });
    const restored = await db.transaction(async (transaction) => {
      await transaction.insert(broadcastStudioVersions).values({ studioId: access.studio.id, businessId: access.studio.businessId, actorUserId: req.dbUser!.id, revision: access.studio.revision, name: access.studio.name, config: validateBroadcastStudioConfig(access.studio.config), reason: "restore" }).onConflictDoNothing();
      const [row] = await transaction.update(broadcastStudios).set({ name: version.name, config: validateBroadcastStudioConfig(version.config), revision: sql`${broadcastStudios.revision} + 1`, updatedAt: new Date() }).where(and(eq(broadcastStudios.id, access.studio.id), eq(broadcastStudios.revision, expected))).returning();
      if (row) await transaction.execute(sql`delete from broadcast_studio_versions where id in (select id from broadcast_studio_versions where studio_id = ${access.studio.id} order by revision desc offset 50)`);
      return row;
    });
    if (!restored) return res.status(409).json({ message: "Studio changed in another session", currentRevision: access.studio.revision });
    await emitProjectionEvent({ aggregateType: "broadcast_studio", aggregateId: access.studio.id, eventType: "broadcast.studio.restored", actorUserId: req.dbUser!.id, payload: { businessId: access.studio.businessId, fromRevision: access.studio.revision, restoredRevision: version.revision, revision: restored.revision }, idempotencyKey: `broadcast:${access.studio.id}:restore:${restored.revision}` });
    res.json({ ...restored, access: { role: access.role, canEdit: access.canEdit, canOperate: access.canOperate } });
  });
  app.post("/api/broadcast/studios/:id/collaborators", attachUser, async (req, res) => {
    noStore(res);
    const parsed = studioCollaboratorInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A valid collaborator username and role are required" });
    const studio = await ownedStudio(req.dbUser!.id, req.params.id);
    if (!studio) return res.status(404).json({ message: "Studio not found" });
    const [account] = await db.select().from(users).where(eq(users.username, parsed.data.username)).limit(1);
    if (!account || account.status !== "active" || account.deletedAt) return res.status(404).json({ message: "That active CreativesOS account was not found" });
    if (account.id === studio.ownerUserId) return res.status(409).json({ message: "The studio owner already has access" });
    const [collaborator] = await db.insert(broadcastStudioCollaborators).values({ studioId: studio.id, userId: account.id, invitedByUserId: req.dbUser!.id, role: parsed.data.role }).onConflictDoUpdate({ target: [broadcastStudioCollaborators.studioId, broadcastStudioCollaborators.userId], set: { role: parsed.data.role, invitedByUserId: req.dbUser!.id } }).returning();
    await db.insert(notifications).values({ userId: account.id, type: "mention", message: `${req.dbUser!.displayName} invited you to ${studio.name} in Broadcast Studio`, read: false, linkTo: "/broadcast", relatedUserId: req.dbUser!.id, relatedUserImage: req.dbUser!.profileImageUrl, sourceType: "broadcast_studio_collaborator", sourceId: collaborator.id }).onConflictDoNothing();
    await emitProjectionEvent({ aggregateType: "broadcast_studio", aggregateId: studio.id, eventType: "broadcast.collaborator.added", actorUserId: req.dbUser!.id, payload: { collaboratorUserId: account.id, role: collaborator.role }, idempotencyKey: `broadcast:${studio.id}:collaborator:${account.id}:${collaborator.role}` });
    res.status(201).json({ id: collaborator.id, userId: account.id, username: account.username, displayName: account.displayName, profileImageUrl: account.profileImageUrl, role: collaborator.role });
  });
  app.delete("/api/broadcast/studios/:id/collaborators/:userId", attachUser, async (req, res) => {
    const studio = await ownedStudio(req.dbUser!.id, req.params.id);
    const userId = Number(req.params.userId);
    if (!studio || !Number.isInteger(userId)) return res.status(404).json({ message: "Collaborator not found" });
    const [removed] = await db.delete(broadcastStudioCollaborators).where(and(eq(broadcastStudioCollaborators.studioId, studio.id), eq(broadcastStudioCollaborators.userId, userId))).returning();
    if (!removed) return res.status(404).json({ message: "Collaborator not found" });
    res.status(204).end();
  });
  app.delete("/api/broadcast/studios/:id", attachUser, async (req, res) => {
    const studio = await ownedStudio(req.dbUser!.id, req.params.id);
    if (!studio) return res.status(404).json({ message: "Studio not found" });
    const active = await db
      .select({ id: broadcastSessions.id })
      .from(broadcastSessions)
      .where(
        and(
          eq(broadcastSessions.studioId, studio.id),
          inArray(broadcastSessions.state, ["starting", "live", "stopping"]),
        ),
      )
      .limit(1);
    if (active.length)
      return res
        .status(409)
        .json({ message: "Stop the active broadcast first" });
    await db.delete(broadcastStudios).where(eq(broadcastStudios.id, studio.id));
    res.status(204).end();
  });

  app.get("/api/broadcast/destinations", attachUser, async (req, res) => {
    noStore(res);
    const rows = await db
      .select()
      .from(broadcastDestinations)
      .where(eq(broadcastDestinations.ownerUserId, req.dbUser!.id))
      .orderBy(desc(broadcastDestinations.updatedAt));
    res.json(rows.map(publicDestination));
  });
  app.post("/api/broadcast/destinations", attachUser, async (req, res) => {
    noStore(res);
    if (!isSocialTokenEncryptionConfigured())
      return res
        .status(503)
        .json({ message: "Secure destination storage is not configured" });
    const parsed = broadcastDestinationInputSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    try {
      await validatePublicDestination(
        parsed.data.protocol,
        parsed.data.ingestUrl,
      );
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Invalid destination",
      });
    }
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [row] = await db
      .insert(broadcastDestinations)
      .values({
        ownerUserId: req.dbUser!.id,
        businessId: business.id,
        name: parsed.data.name,
        protocol: parsed.data.protocol,
        ingestUrl: parsed.data.ingestUrl,
        streamKeyCiphertext: encryptSocialToken(parsed.data.streamKey),
        outputLayout: parsed.data.outputLayout,
        framingMode: parsed.data.framingMode,
      })
      .returning();
    res.status(201).json(publicDestination(row));
  });
  app.put("/api/broadcast/destinations/:id", attachUser, async (req, res) => {
    noStore(res);
    const current = await ownedDestination(req.dbUser!.id, req.params.id);
    if (!current)
      return res.status(404).json({ message: "Destination not found" });
    const parsed = broadcastDestinationInputSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    try {
      await validatePublicDestination(
        parsed.data.protocol,
        parsed.data.ingestUrl,
      );
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Invalid destination",
      });
    }
    const [row] = await db
      .update(broadcastDestinations)
      .set({
        name: parsed.data.name,
        protocol: parsed.data.protocol,
        ingestUrl: parsed.data.ingestUrl,
        streamKeyCiphertext: encryptSocialToken(parsed.data.streamKey),
        outputLayout: parsed.data.outputLayout,
        framingMode: parsed.data.framingMode,
        updatedAt: new Date(),
      })
      .where(eq(broadcastDestinations.id, current.id))
      .returning();
    res.json(publicDestination(row));
  });
  app.post(
    "/api/broadcast/destinations/:id/test",
    attachUser,
    async (req, res) => {
      noStore(res);
      const row = await ownedDestination(req.dbUser!.id, req.params.id);
      if (!row)
        return res.status(404).json({ message: "Destination not found" });
      try {
        const url = await validatePublicDestination(
          row.protocol,
          row.ingestUrl,
        );
        res.json({
          reachable: true,
          hostname: url.hostname,
          protocol: row.protocol,
          detail:
            "Destination DNS and security policy passed. No content was published.",
        });
      } catch (error) {
        res.status(400).json({
          reachable: false,
          detail:
            error instanceof Error
              ? error.message
              : "Destination failed validation",
        });
      }
    },
  );
  app.delete(
    "/api/broadcast/destinations/:id",
    attachUser,
    async (req, res) => {
      const row = await ownedDestination(req.dbUser!.id, req.params.id);
      if (!row)
        return res.status(404).json({ message: "Destination not found" });
      await db
        .delete(broadcastDestinations)
        .where(eq(broadcastDestinations.id, row.id));
      res.status(204).end();
    },
  );

  app.post(
    "/api/broadcast/studios/:id/sessions",
    attachUser,
    async (req, res) => {
      noStore(res);
      const studio = await ownedStudio(req.dbUser!.id, req.params.id);
      if (!studio) return res.status(404).json({ message: "Studio not found" });
      const parsed = broadcastSessionStartSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message });
      const requestedDestinationIds = Array.from(new Set([
        ...parsed.data.destinationIds,
        ...(parsed.data.destinationId ? [parsed.data.destinationId] : []),
      ]));
      const destinations = (await Promise.all(requestedDestinationIds.map((id) => ownedDestination(req.dbUser!.id, id))))
        .filter((value): value is NonNullable<typeof value> => Boolean(value));
      if (destinations.length !== requestedDestinationIds.length)
        return res.status(404).json({ message: "One or more destinations were not found" });
      if (parsed.data.outputMode === "stream" && !destinations.length)
        return res
          .status(400)
          .json({ message: "Choose a streaming destination" });
      if (destinations.some((destination) => destination.status !== "active"))
        return res.status(409).json({ message: "Destination is disabled" });
      let sessionId: string | null = null;
      try {
        for (const destination of destinations)
          await validatePublicDestination(
            destination.protocol,
            destination.ingestUrl,
          );
        const [session] = await db
          .insert(broadcastSessions)
          .values({
            studioId: studio.id,
            ownerUserId: req.dbUser!.id,
            businessId: studio.businessId,
            destinationId: destinations[0]?.id ?? null,
            destinationIds: destinations.map((destination) => destination.id),
            outputMode: parsed.data.outputMode,
            sourceMode: parsed.data.sourceMode,
            runtimeMachineId,
          })
          .returning();
        sessionId = session.id;
        await db.insert(broadcastDestinationReceipts).values(
          destinations.length
            ? destinations.map((destination) => ({ sessionId: session.id, destinationId: destination.id, ownerUserId: req.dbUser!.id, destinationName: destination.name }))
            : [{ sessionId: session.id, destinationId: null, ownerUserId: req.dbUser!.id, destinationName: "Private recording" }],
        );
        await launchRuntime(session, studio, destinations, parsed.data);
        await emitProjectionEvent({
          aggregateType: "broadcast_studio",
          aggregateId: studio.id,
          eventType:
            parsed.data.outputMode === "stream"
              ? "broadcast.stream.started"
              : "broadcast.recording.started",
          actorUserId: req.dbUser!.id,
          payload: {
            businessId: studio.businessId,
            sessionId: session.id,
            destinationId: destinations[0]?.id ?? null,
            destinationIds: destinations.map((destination) => destination.id),
          },
          idempotencyKey: `broadcast:${session.id}:started`,
        });
        return res
          .status(201)
          .json((await ownedSession(req.dbUser!.id, session.id))!);
      } catch (error: any) {
        if (sessionId)
          await Promise.all([
            db.update(broadcastSessions).set({ state: "error", errorCode: "encoder_start_failed", errorMessage: "The encoder could not start", endedAt: new Date(), updatedAt: new Date() }).where(eq(broadcastSessions.id, sessionId)).catch(() => undefined),
            db.update(broadcastDestinationReceipts).set({ state: "error", detail: "Encoder could not start", endedAt: new Date(), updatedAt: new Date() }).where(eq(broadcastDestinationReceipts.sessionId, sessionId)).catch(() => undefined),
          ]);
        if (error?.code === "23505")
          return res
            .status(409)
            .json({ message: "Only one broadcast can be active at a time" });
        return res.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : "Broadcast could not start",
        });
      }
    },
  );
  app.post(
    "/api/broadcast/studios/:id/recordings",
    attachUser,
    async (req, res) => {
      noStore(res);
      const studio = await ownedStudio(req.dbUser!.id, req.params.id);
      if (!studio) return res.status(404).json({ message: "Studio not found" });
      const parsed = recordingInputSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message });
      const [asset] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, parsed.data.assetId),
            eq(assets.ownerUserId, req.dbUser!.id),
            eq(assets.visibility, "private"),
            eq(assets.status, "ready"),
          ),
        )
        .limit(1);
      if (!asset)
        return res
          .status(404)
          .json({ message: "Private recording asset not found" });
      const now = new Date();
      const [session] = await db
        .insert(broadcastSessions)
        .values({
          studioId: studio.id,
          ownerUserId: req.dbUser!.id,
          businessId: studio.businessId,
          recordingAssetId: asset.id,
          outputMode: "recording",
          sourceMode: "browser",
          state: "complete",
          health: {
            durationMs: parsed.data.durationMs,
            source: "browser_compositor",
          },
          startedAt: new Date(now.getTime() - parsed.data.durationMs),
          endedAt: now,
        })
        .returning();
      await db.insert(broadcastDestinationReceipts).values({
        sessionId: session.id,
        destinationId: null,
        ownerUserId: req.dbUser!.id,
        destinationName: "Private recording",
        state: "complete",
        detail: "Browser-composited recording saved",
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      });
      await emitProjectionEvent({
        aggregateType: "broadcast_studio",
        aggregateId: studio.id,
        eventType: "broadcast.recording.ready",
        actorUserId: req.dbUser!.id,
        payload: {
          businessId: studio.businessId,
          sessionId: session.id,
          recordingAssetId: asset.id,
        },
        idempotencyKey: `broadcast:${session.id}:recording.ready`,
      });
      res.status(201).json(session);
    },
  );
  app.get("/api/broadcast/sessions/:id", attachUser, async (req, res) => {
    noStore(res);
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session)
      return res.status(404).json({ message: "Broadcast not found" });
    const [markers, tracks, destinationReceipts] = await Promise.all([
      db.select().from(broadcastSessionMarkers).where(and(eq(broadcastSessionMarkers.sessionId, session.id), eq(broadcastSessionMarkers.ownerUserId, req.dbUser!.id))).orderBy(broadcastSessionMarkers.positionMs),
      db.select().from(broadcastSessionTracks).where(and(eq(broadcastSessionTracks.sessionId, session.id), eq(broadcastSessionTracks.ownerUserId, req.dbUser!.id))).orderBy(broadcastSessionTracks.createdAt),
      db.select().from(broadcastDestinationReceipts).where(and(eq(broadcastDestinationReceipts.sessionId, session.id), eq(broadcastDestinationReceipts.ownerUserId, req.dbUser!.id))).orderBy(broadcastDestinationReceipts.updatedAt),
    ]);
    res.json({ ...session, markers, tracks, destinationReceipts });
  });
  app.get("/api/broadcast/sessions/:id/audience", attachUser, async (req, res) => {
    noStore(res);
    const [session] = await db.select().from(broadcastSessions).where(eq(broadcastSessions.id, req.params.id)).limit(1);
    if (!session) return res.status(404).json({ message: "Audience room not found" });
    const access = await studioAccess(req.dbUser!.id, session.studioId);
    const isProductionTeam = Boolean(access);
    if (!isProductionTeam && !["starting", "live", "stopping"].includes(session.state)) return res.status(404).json({ message: "Audience room is closed" });
    const rows = await db.select().from(broadcastAudienceMessages).where(eq(broadcastAudienceMessages.sessionId, session.id)).orderBy(desc(broadcastAudienceMessages.createdAt)).limit(200);
    const messages = isProductionTeam ? rows : rows.filter((row) => row.status === "visible");
    res.json({ session: { id: session.id, state: session.state, studioId: session.studioId }, access: { productionTeam: isProductionTeam, canModerate: access?.canOperate ?? false }, messages });
  });
  app.post("/api/broadcast/sessions/:id/audience/messages", attachUser, async (req, res) => {
    noStore(res);
    const parsed = audienceCommentInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const [session] = await db.select().from(broadcastSessions).where(eq(broadcastSessions.id, req.params.id)).limit(1);
    if (!session || !["starting", "live", "stopping"].includes(session.state)) return res.status(404).json({ message: "Audience room is closed" });
    const [message] = await db.insert(broadcastAudienceMessages).values({ sessionId: session.id, authorUserId: req.dbUser!.id, provider: "native", kind: "comment", authorName: req.dbUser!.displayName, body: parsed.data.body }).returning();
    await emitProjectionEvent({ aggregateType: "broadcast_studio", aggregateId: session.studioId, eventType: "broadcast.audience.comment.received", actorUserId: req.dbUser!.id, payload: { businessId: session.businessId, sessionId: session.id, messageId: message.id, provider: "native" }, idempotencyKey: `broadcast:${session.id}:audience:${message.id}` });
    res.status(201).json(message);
  });
  app.post("/api/broadcast/sessions/:id/audience/cta", attachUser, async (req, res) => {
    noStore(res);
    const parsed = audienceCtaInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session) return res.status(404).json({ message: "Broadcast not found" });
    const message = await db.transaction(async (tx) => {
      await tx.update(broadcastAudienceMessages).set({ featured: false, moderatedByUserId: req.dbUser!.id, moderatedAt: new Date() }).where(and(eq(broadcastAudienceMessages.sessionId, session.id), eq(broadcastAudienceMessages.featured, true)));
      const [created] = await tx.insert(broadcastAudienceMessages).values({ sessionId: session.id, authorUserId: req.dbUser!.id, provider: "native", kind: "cta", authorName: req.dbUser!.displayName, body: parsed.data.label, actionUrl: parsed.data.actionUrl, featured: true, moderatedByUserId: req.dbUser!.id, moderatedAt: new Date() }).returning();
      return created;
    });
    res.status(201).json(message);
  });
  app.post("/api/broadcast/sessions/:id/audience/messages/:messageId/moderate", attachUser, async (req, res) => {
    noStore(res);
    const parsed = audienceModerationInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "A valid moderation action is required" });
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session) return res.status(404).json({ message: "Broadcast not found" });
    const updated = await db.transaction(async (tx) => {
      if (parsed.data.action === "feature") await tx.update(broadcastAudienceMessages).set({ featured: false, moderatedByUserId: req.dbUser!.id, moderatedAt: new Date() }).where(and(eq(broadcastAudienceMessages.sessionId, session.id), eq(broadcastAudienceMessages.featured, true)));
      const [row] = await tx.update(broadcastAudienceMessages).set({ status: parsed.data.action === "hide" ? "hidden" : "visible", featured: parsed.data.action === "feature", moderatedByUserId: req.dbUser!.id, moderatedAt: new Date() }).where(and(eq(broadcastAudienceMessages.id, req.params.messageId), eq(broadcastAudienceMessages.sessionId, session.id))).returning();
      return row;
    });
    if (!updated) return res.status(404).json({ message: "Audience message not found" });
    res.json(updated);
  });
  app.post("/api/broadcast/sessions/:id/markers", attachUser, async (req, res) => {
    noStore(res);
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session) return res.status(404).json({ message: "Broadcast not found" });
    if (!session.startedAt || !["live", "stopping"].includes(session.state)) return res.status(409).json({ message: "Markers can only be added to active output" });
    const parsed = markerInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const [marker] = await db.insert(broadcastSessionMarkers).values({
      sessionId: session.id,
      ownerUserId: req.dbUser!.id,
      kind: parsed.data.kind,
      label: parsed.data.label,
      positionMs: Math.max(0, Date.now() - session.startedAt.getTime()),
    }).returning();
    res.status(201).json(marker);
  });
  app.delete("/api/broadcast/sessions/:id/markers/:markerId", attachUser, async (req, res) => {
    noStore(res);
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session) return res.status(404).json({ message: "Broadcast not found" });
    const deleted = await db.delete(broadcastSessionMarkers).where(and(eq(broadcastSessionMarkers.id, req.params.markerId), eq(broadcastSessionMarkers.sessionId, session.id), eq(broadcastSessionMarkers.ownerUserId, req.dbUser!.id))).returning({ id: broadcastSessionMarkers.id });
    if (!deleted.length) return res.status(404).json({ message: "Marker not found" });
    res.status(204).end();
  });
  app.post("/api/broadcast/sessions/:id/tracks", attachUser, async (req, res) => {
    noStore(res);
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session) return res.status(404).json({ message: "Broadcast not found" });
    const parsed = isolatedTrackInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const [asset] = await db.select().from(assets).where(and(
      eq(assets.id, parsed.data.assetId),
      eq(assets.ownerUserId, req.dbUser!.id),
      eq(assets.visibility, "private"),
      eq(assets.status, "ready"),
    )).limit(1);
    if (!asset) return res.status(404).json({ message: "Private source recording asset not found" });
    if (asset.mimeType !== parsed.data.mimeType || !asset.sizeBytes || asset.sizeBytes <= 0)
      return res.status(409).json({ message: "Source recording metadata does not match its private asset" });
    const [track] = await db.insert(broadcastSessionTracks).values({
      sessionId: session.id,
      ownerUserId: req.dbUser!.id,
      assetId: asset.id,
      sourceId: parsed.data.sourceId,
      sourceName: parsed.data.sourceName,
      sourceType: parsed.data.sourceType,
      mimeType: parsed.data.mimeType,
      durationMs: parsed.data.durationMs,
      sizeBytes: asset.sizeBytes,
      quality: parsed.data.quality,
    }).onConflictDoUpdate({
      target: [broadcastSessionTracks.sessionId, broadcastSessionTracks.sourceId],
      set: {
        assetId: asset.id,
        sourceName: parsed.data.sourceName,
        sourceType: parsed.data.sourceType,
        mimeType: parsed.data.mimeType,
        durationMs: parsed.data.durationMs,
        sizeBytes: asset.sizeBytes,
        quality: parsed.data.quality,
      },
    }).returning();
    await emitProjectionEvent({
      aggregateType: "broadcast_studio",
      aggregateId: session.studioId,
      eventType: "broadcast.track.ready",
      actorUserId: req.dbUser!.id,
      payload: { businessId: session.businessId, sessionId: session.id, trackId: track.id, sourceId: track.sourceId, assetId: track.assetId },
      idempotencyKey: `broadcast:${session.id}:track:${track.sourceId}:${track.assetId}`,
    });
    res.status(201).json(track);
  });
  app.get("/api/broadcast/sessions/:id/tracks/:trackId/media", attachUser, async (req, res) => {
    noStore(res);
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session) return res.status(404).json({ message: "Broadcast not found" });
    const [track] = await db.select({ storageKey: assets.storageKey }).from(broadcastSessionTracks)
      .innerJoin(assets, eq(assets.id, broadcastSessionTracks.assetId))
      .where(and(
        eq(broadcastSessionTracks.id, req.params.trackId),
        eq(broadcastSessionTracks.sessionId, session.id),
        eq(broadcastSessionTracks.ownerUserId, req.dbUser!.id),
        eq(assets.ownerUserId, req.dbUser!.id),
        eq(assets.visibility, "private"),
      )).limit(1);
    if (!track) return res.status(404).json({ message: "Source recording not found" });
    try {
      res.json(await createPrivateAssetReadUrl(track.storageKey));
    } catch {
      res.status(503).json({ message: "Private source recording delivery is not configured" });
    }
  });
  app.post(
    "/api/broadcast/sessions/:id/chunks",
    attachUser,
    async (req: Request, res: Response) => {
      noStore(res);
      const session = await ownedSession(req.dbUser!.id, req.params.id);
      if (!session)
        return res.status(404).json({ message: "Broadcast not found" });
      if (replayToRuntime(res, session.runtimeMachineId)) return;
      const runtime = runtimes.get(session.id);
      if (
        !runtime ||
        session.sourceMode !== "browser" ||
        session.state !== "live"
      )
        return res
          .status(409)
          .json({ message: "Browser ingest is not active" });
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const value of req) {
        const chunk = Buffer.from(value);
        size += chunk.byteLength;
        if (size > 5 * 1024 * 1024) {
          runtime.child.stdin.destroy();
          return res
            .status(413)
            .json({ message: "Broadcast chunk is too large" });
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!body.length)
        return res.status(400).json({ message: "Broadcast chunk is empty" });
      if (!runtime.child.stdin.write(body))
        await new Promise<void>((resolve) =>
          runtime.child.stdin.once("drain", resolve),
        );
      runtime.health.ingestBytes =
        Number(runtime.health.ingestBytes ?? 0) + body.byteLength;
      res.status(202).json({ accepted: body.byteLength });
    },
  );
  app.post("/api/broadcast/sessions/:id/stop", attachUser, async (req, res) => {
    noStore(res);
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session)
      return res.status(404).json({ message: "Broadcast not found" });
    if (replayToRuntime(res, session.runtimeMachineId)) return;
    const runtime = runtimes.get(session.id);
    if (!runtime) {
      if (["complete", "error", "interrupted"].includes(session.state))
        return res.json(session);
      await db
        .update(broadcastSessions)
        .set({
          state: "interrupted",
          errorCode: "runtime_missing",
          errorMessage: "The broadcast runtime was interrupted",
          endedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(broadcastSessions.id, session.id));
      await db.update(broadcastDestinationReceipts).set({ state: "interrupted", detail: "Broadcast runtime was interrupted", endedAt: new Date(), updatedAt: new Date() }).where(eq(broadcastDestinationReceipts.sessionId, session.id));
      return res
        .status(409)
        .json({ message: "Broadcast runtime was interrupted" });
    }
    runtime.stopping = true;
    await db
      .update(broadcastSessions)
      .set({ state: "stopping", updatedAt: new Date() })
      .where(eq(broadcastSessions.id, session.id));
    runtime.child.stdin.end();
    runtime.child.kill("SIGINT");
    res.status(202).json({ ...session, state: "stopping" });
  });
  app.get("/api/broadcast/sessions/:id/media", attachUser, async (req, res) => {
    noStore(res);
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session?.recordingAssetId)
      return res.status(404).json({ message: "Recording not found" });
    const [asset] = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, session.recordingAssetId),
          eq(assets.ownerUserId, req.dbUser!.id),
        ),
      )
      .limit(1);
    if (!asset) return res.status(404).json({ message: "Recording not found" });
    try {
      res.json(await createPrivateAssetReadUrl(asset.storageKey));
    } catch {
      res
        .status(503)
        .json({ message: "Private recording delivery is not configured" });
    }
  });
  app.post("/api/broadcast/sessions/:id/cut-studio", attachUser, async (req, res) => {
    noStore(res);
    const session = await ownedSession(req.dbUser!.id, req.params.id);
    if (!session) return res.status(404).json({ message: "Broadcast not found" });
    if (!session.recordingAssetId || session.state !== "complete")
      return res.status(409).json({ message: "A completed recording is required" });
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from assets where id = ${session.recordingAssetId} and owner_user_id = ${req.dbUser!.id} for update`);
      const [recording] = await tx.select().from(assets).where(and(
        eq(assets.id, session.recordingAssetId!),
        eq(assets.ownerUserId, req.dbUser!.id),
        eq(assets.visibility, "private"),
        eq(assets.status, "ready"),
      )).limit(1);
      if (!recording || !recording.mimeType?.startsWith("video/")) return null;
      const existingProjectId = typeof recording.metadata?.cutStudioProjectId === "string" ? recording.metadata.cutStudioProjectId : null;
      if (existingProjectId) {
        const [existing] = await tx.select().from(cutStudioProjects).where(and(eq(cutStudioProjects.id, existingProjectId), eq(cutStudioProjects.ownerUserId, req.dbUser!.id))).limit(1);
        if (existing) return { project: existing, reused: true, importedTrackCount: 0, omittedTimelineTrackCount: 0 };
      }
      const [studio, markers, tracks] = await Promise.all([
        tx.select({ name: broadcastStudios.name }).from(broadcastStudios).where(eq(broadcastStudios.id, session.studioId)).limit(1).then((rows) => rows[0]),
        tx.select().from(broadcastSessionMarkers).where(and(eq(broadcastSessionMarkers.sessionId, session.id), eq(broadcastSessionMarkers.ownerUserId, req.dbUser!.id))).orderBy(broadcastSessionMarkers.positionMs),
        tx.select().from(broadcastSessionTracks).where(and(eq(broadcastSessionTracks.sessionId, session.id), eq(broadcastSessionTracks.ownerUserId, req.dbUser!.id))).orderBy(broadcastSessionTracks.createdAt),
      ]);
      const duration = Math.max(0.1, Number(session.health?.durationMs ?? 0) / 1_000 || ((session.endedAt?.getTime() ?? Date.now()) - (session.startedAt?.getTime() ?? Date.now())) / 1_000);
      const trackAssetIds = Array.from(new Set(tracks.map((track) => track.assetId).filter((id) => id !== recording.id)));
      const trackAssets = trackAssetIds.length ? await tx.select().from(assets).where(and(inArray(assets.id, trackAssetIds), eq(assets.ownerUserId, req.dbUser!.id), eq(assets.visibility, "private"), eq(assets.status, "ready"))) : [];
      const assetById = new Map(trackAssets.map((asset) => [asset.id, asset]));
      let videoTrack = 2;
      let audioTrack = 1;
      let omittedTimelineTrackCount = 0;
      const importedClips = tracks.flatMap((track) => {
        const asset = assetById.get(track.assetId);
        if (!asset) return [];
        const mediaKind = asset.mimeType?.startsWith("audio/") ? "audio" : asset.mimeType?.startsWith("video/") ? "video" : null;
        if (!mediaKind) return [];
        const timelineTrack = mediaKind === "video" ? (videoTrack <= 8 ? `v${videoTrack++}` : null) : (audioTrack <= 8 ? `a${audioTrack++}` : null);
        if (!timelineTrack) { omittedTimelineTrackCount += 1; return []; }
        return [{
          id: `broadcast_${track.id}`,
          assetId: asset.id,
          label: track.sourceName.slice(0, 80),
          start: 0,
          end: Math.max(0.05, Math.min(duration, track.durationMs / 1_000)),
          speed: 1,
          volume: 0,
          fadeIn: 0,
          fadeOut: 0,
          transition: "cut" as const,
          track: timelineTrack,
          timelineStart: 0,
          groupId: "broadcast_sources",
          transform: { x: 0, y: 0, width: 1, height: 1, opacity: mediaKind === "video" ? 0 : 1 },
        }];
      });
      let edl = validateCutEdl({
        version: 3,
        clips: [{ id: "broadcast_program", label: "Program recording", start: 0, end: duration, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, transition: "cut", track: "v1", timelineStart: 0, transform: { x: 0, y: 0, width: 1, height: 1, opacity: 1 } }, ...importedClips],
        markers: markers.map((marker) => ({ id: `broadcast_${marker.id}`, label: marker.label.slice(0, 80), position: Math.min(duration, marker.positionMs / 1_000), kind: marker.kind === "highlight" ? "beat" : "note", color: marker.kind === "issue" ? "#f59e0b" : marker.kind === "highlight" ? "#1d9bf0" : "#f43f5e" })),
        tracks: Array.from(new Set(["v1", ...importedClips.map((clip) => clip.track)])).map((track) => ({ track, locked: false, hidden: false, muted: false, solo: false, gain: 1 })),
      }, duration);
      const cameraAngleIds = importedClips.filter((clip) => clip.track.startsWith("v")).map((clip) => clip.id);
      if (cameraAngleIds.length) edl = createCutMulticamGroup(edl, ["broadcast_program", ...cameraAngleIds], "Broadcast multicam", `broadcast_multicam_${session.id.replaceAll("-", "").slice(0, 24)}`);
      const projectName = `${studio?.name ?? "Broadcast"} recording · ${session.createdAt.toISOString().slice(0, 10)}`;
      const [project] = await tx.insert(cutStudioProjects).values({ ownerUserId: req.dbUser!.id, businessId: session.businessId, sourceAssetId: recording.id, name: projectName, duration, mediaKind: "video", edl }).returning();
      const mediaRows = [{ projectId: project.id, assetId: recording.id, ownerUserId: req.dbUser!.id, name: recording.originalFilename ?? "Broadcast program recording", mediaKind: "video", duration }, ...tracks.flatMap((track) => {
        const asset = assetById.get(track.assetId);
        if (!asset) return [];
        const mediaKind = asset.mimeType?.startsWith("audio/") ? "audio" : asset.mimeType?.startsWith("video/") ? "video" : null;
        return mediaKind ? [{ projectId: project.id, assetId: asset.id, ownerUserId: req.dbUser!.id, name: track.sourceName, mediaKind, duration: Math.max(0.05, track.durationMs / 1_000) }] : [];
      })];
      await tx.insert(cutStudioProjectMedia).values(mediaRows).onConflictDoNothing();
      await tx.update(assets).set({ metadata: { ...recording.metadata, cutStudioProjectId: project.id, broadcastSessionId: session.id } }).where(eq(assets.id, recording.id));
      return { project, reused: false, importedTrackCount: mediaRows.length - 1, omittedTimelineTrackCount };
    });
    if (!result) return res.status(404).json({ message: "Private recording not found" });
    await emitProjectionEvent({ aggregateType: "broadcast_studio", aggregateId: session.studioId, eventType: "broadcast.cutstudio.project.created", actorUserId: req.dbUser!.id, payload: { businessId: session.businessId, sessionId: session.id, projectId: result.project.id, importedTrackCount: result.importedTrackCount, omittedTimelineTrackCount: result.omittedTimelineTrackCount }, idempotencyKey: `broadcast:${session.id}:cutstudio:${result.project.id}` });
    res.status(result.reused ? 200 : 201).json(result);
  });
  app.post(
    "/api/broadcast/sessions/:id/distribute",
    attachUser,
    async (req, res) => {
      noStore(res);
      const session = await ownedSession(req.dbUser!.id, req.params.id);
      if (!session?.recordingAssetId || session.state !== "complete")
        return res
          .status(409)
          .json({ message: "A completed recording is required" });
      const [recording] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, session.recordingAssetId),
            eq(assets.ownerUserId, req.dbUser!.id),
          ),
        )
        .limit(1);
      if (!recording)
        return res.status(404).json({ message: "Recording not found" });
      const existingId =
        typeof recording.metadata?.distributionAssetId === "string"
          ? recording.metadata.distributionAssetId
          : null;
      if (existingId) {
        const [existing] = await db
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.id, existingId),
              eq(assets.ownerUserId, req.dbUser!.id),
            ),
          )
          .limit(1);
        if (existing) return res.json(existing);
      }
      const promoted = await promotePrivateAsset({
        storageKey: recording.storageKey,
        ownerUserId: req.dbUser!.id,
        kind: "video",
        filename: recording.originalFilename ?? "broadcast-recording.mp4",
        mimeType: recording.mimeType ?? "video/mp4",
      });
      const [publicAsset] = await db
        .insert(assets)
        .values({
          ownerUserId: req.dbUser!.id,
          businessId: recording.businessId,
          kind: "video",
          storageProvider: "r2",
          storageKey: promoted.storageKey,
          publicUrl: promoted.publicUrl,
          mimeType: recording.mimeType,
          sizeBytes: promoted.sizeBytes,
          visibility: "public",
          status: "ready",
          originalFilename: recording.originalFilename,
          metadata: {
            broadcastSessionId: session.id,
            sourcePrivateAssetId: recording.id,
          },
        })
        .returning();
      await Promise.all([
        queueMediaIngestJobs(publicAsset),
        registerAssetLineage({
          parentAssetId: recording.id,
          childAssetId: publicAsset.id,
          relationship: "published_from",
          createdByUserId: req.dbUser!.id,
          metadata: { instrument: "broadcast", sessionId: session.id },
        }),
      ]);
      await db
        .update(assets)
        .set({
          metadata: {
            ...recording.metadata,
            distributionAssetId: publicAsset.id,
          },
        })
        .where(eq(assets.id, recording.id));
      await emitProjectionEvent({
        aggregateType: "broadcast_studio",
        aggregateId: session.studioId,
        eventType: "broadcast.recording.promoted",
        actorUserId: req.dbUser!.id,
        payload: {
          businessId: session.businessId,
          sessionId: session.id,
          distributionAssetId: publicAsset.id,
        },
        idempotencyKey: `broadcast:${session.id}:recording.promoted`,
      });
      res.status(201).json(publicAsset);
    },
  );
}

export async function reconcileBroadcastSessions() {
  const cutoff = new Date(Date.now() - 90_000);
  const stale = await db
    .update(broadcastSessions)
    .set({
      state: "interrupted",
      errorCode: "runtime_interrupted",
      errorMessage: "The encoder host restarted or stopped reporting",
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(broadcastSessions.state, ["starting", "live", "stopping"]),
        lt(broadcastSessions.updatedAt, cutoff),
      ),
    )
    .returning({ id: broadcastSessions.id });
  if (stale.length) await db.update(broadcastDestinationReceipts).set({ state: "interrupted", detail: "Encoder host stopped reporting", endedAt: new Date(), updatedAt: new Date() }).where(inArray(broadcastDestinationReceipts.sessionId, stale.map((row) => row.id)));
  return stale.length;
}

export function scheduleBroadcastRecovery() {
  const run = () =>
    void reconcileBroadcastSessions().catch((error) =>
      console.error(
        "Broadcast reconciliation failed:",
        error instanceof Error ? error.message : error,
      ),
    );
  const timer = setInterval(run, 60_000);
  timer.unref();
  run();
  return timer;
}
