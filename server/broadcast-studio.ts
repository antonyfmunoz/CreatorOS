import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  broadcastDestinationInputSchema,
  broadcastSessionStartSchema,
  defaultBroadcastStudioConfig,
  validateBroadcastStudioConfig,
} from "@shared/broadcast-studio";
import {
  assets,
  broadcastBrandKits,
  broadcastDestinationReceipts,
  broadcastDestinations,
  broadcastSessionMarkers,
  broadcastSessionTracks,
  broadcastSessions,
  broadcastStudioCollaborators,
  broadcastStudios,
  notifications,
  users,
} from "@shared/schema";
import { attachUser } from "./auth";
import {
  createPrivateAssetReadUrl,
  persistPrivateFile,
  promotePrivateAsset,
} from "./asset-storage";
import { ensureDefaultBusiness } from "./businesses";
import { db } from "./db";
import {
  decryptSocialToken,
  encryptSocialToken,
  isSocialTokenEncryptionConfigured,
} from "./social-oauth";
import { emitProjectionEvent } from "./umh";

const idSchema = z.string().uuid();
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
const studioCollaboratorInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  role: z.enum(["viewer", "editor"]).default("viewer"),
});
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
export function buildBroadcastTeeOutput(destinations: Array<{ protocol: string; url: string }>) {
  if (!destinations.length) throw new Error("At least one stream destination is required");
  return destinations.map((destination) => {
    const format = destination.protocol === "srt" ? "mpegts" : "flv";
    const escapedUrl = destination.url.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
    return `[f=${format}:onfail=ignore]${escapedUrl}`;
  }).join("|");
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
  args.push(
    "-map",
    "0:v:0",
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
      buildBroadcastTeeOutput(destinations.map((destination) => ({ protocol: destination.protocol, url: destinationWithKey(destination) }))),
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
    const name =
      typeof req.body?.name === "string"
        ? req.body.name.trim().slice(0, 120)
        : studio.name;
    const [updated] = await db
      .update(broadcastStudios)
      .set({
        name: name || studio.name,
        config,
        revision: sql`${broadcastStudios.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(broadcastStudios.id, studio.id),
          eq(broadcastStudios.revision, expected),
        ),
      )
      .returning();
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
