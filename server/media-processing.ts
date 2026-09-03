import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { assets, mediaProcessingJobs, mediaRenditions, mediaWorkerNodes, type Asset, type MediaProcessingJob } from "@shared/schema";
import { nativeMediaWorkerCapabilities, normalizeMediaWorkerConfiguration } from "@shared/media-workers";
import { materializeStoredAsset, persistManagedFile, persistManagedFileAtKey } from "./asset-storage";
import { db } from "./db";
import { recordOperationalServiceEvent } from "./operations";
import { estimatedComputeCostMicros } from "@shared/operations";
import { reserveWorkerSlot } from "./worker-admission";
import { runManagedMediaProcess } from "./media-process";
import { finalizeOwnedHlsMediaPlaylist, finalizeOwnedHlsSegment } from "./media-hls";

type Probe = {
  durationMs: number;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  frameRate: number | null;
  channels: number | null;
  sampleRate: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
};

const running = new Set<string>();
const activeProcesses = new Map<string, Set<ReturnType<typeof spawn>>>();
let timer: NodeJS.Timeout | null = null;
let nodeHeartbeatTimer: NodeJS.Timeout | null = null;
let workerRegistered = false;
let lastWorkerPruneAt = 0;
let workerStopping = false;

const leaseMs = Math.max(30_000, Math.min(30 * 60_000, Number(process.env.MEDIA_WORKER_LEASE_MS) || 5 * 60_000));

export type MediaWorkerIdentity = {
  id: string;
  region: string;
  capabilities: string[];
  maxConcurrency: number;
  version: string | null;
};

export function mediaWorkerIdentity(environment: NodeJS.ProcessEnv = process.env): MediaWorkerIdentity {
  return normalizeMediaWorkerConfiguration({
    id: environment.MEDIA_WORKER_ID || `${os.hostname()}:${process.pid}`,
    region: environment.MEDIA_WORKER_REGION || environment.FLY_REGION || "local",
    capabilities: environment.MEDIA_WORKER_CAPABILITIES,
    maxConcurrency: environment.MEDIA_WORKER_CONCURRENCY,
    version: environment.RELEASE_COMMIT || environment.FLY_IMAGE_REF || null,
    allowedCapabilities: nativeMediaWorkerCapabilities.slice(0, 5),
  });
}

const worker = mediaWorkerIdentity();

export async function claimMediaJob(jobId: string, identity: MediaWorkerIdentity, leaseToken: string, now = new Date()) {
  const [claimed] = await db.update(mediaProcessingJobs).set({
    state: "running",
    progress: 0.05,
    attempt: sql`${mediaProcessingJobs.attempt} + 1`,
    workerId: identity.id,
    workerRegion: identity.region,
    leaseToken,
    leaseExpiresAt: new Date(now.getTime() + leaseMs),
    heartbeatAt: now,
    cancellationRequestedAt: null,
    startedAt: now,
    updatedAt: now,
  }).where(and(
    eq(mediaProcessingJobs.id, jobId),
    eq(mediaProcessingJobs.state, "queued"),
    inArray(mediaProcessingJobs.kind, identity.capabilities),
  )).returning();
  return claimed;
}

async function heartbeatWorker(requestedStatus?: "active" | "draining" | "offline") {
  const now = new Date();
  const status = requestedStatus ?? (workerStopping ? "draining" : "active");
  await db.insert(mediaWorkerNodes).values({
    ...worker,
    status,
    activeJobs: Math.min(running.size, worker.maxConcurrency),
    heartbeatAt: now,
    drainStartedAt: status === "draining" ? now : null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: mediaWorkerNodes.id,
    set: {
      region: worker.region,
      capabilities: worker.capabilities,
      maxConcurrency: worker.maxConcurrency,
      activeJobs: Math.min(running.size, worker.maxConcurrency),
      version: worker.version,
      status,
      heartbeatAt: now,
      drainStartedAt: status === "draining" ? sql`coalesce(${mediaWorkerNodes.drainStartedAt}, ${now})` : null,
      updatedAt: now,
    },
  });
  workerRegistered = status !== "offline";
  if (now.getTime() - lastWorkerPruneAt >= 6 * 60 * 60_000) {
    lastWorkerPruneAt = now.getTime();
    await db.delete(mediaWorkerNodes).where(lt(mediaWorkerNodes.heartbeatAt, new Date(now.getTime() - 7 * 24 * 60 * 60_000)));
  }
}

function extension(filename: string | null, fallback: string) {
  const value = path.extname(filename ?? "").toLowerCase();
  return /^[.a-z0-9]{1,12}$/.test(value) ? value : fallback;
}

function frameRate(value: string | undefined) {
  if (!value) return null;
  const [numerator, denominator = 1] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return Number((numerator / denominator).toFixed(3));
}

async function run(command: "ffmpeg" | "ffprobe", args: string[], timeoutMs: number, jobId?: string) {
  return runManagedMediaProcess(command, args, timeoutMs, {
    started(child) {
      if (!jobId) return;
      const processes = activeProcesses.get(jobId) ?? new Set<ReturnType<typeof spawn>>();
      processes.add(child);
      activeProcesses.set(jobId, processes);
    },
    finished(child) {
      if (!jobId) return;
      const processes = activeProcesses.get(jobId);
      processes?.delete(child);
      if (!processes?.size) activeProcesses.delete(jobId);
    },
  });
}

async function probeFile(inputPath: string, jobId?: string): Promise<Probe> {
  const output = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", inputPath], 2 * 60_000, jobId);
  const parsed = JSON.parse(output) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const durationSeconds = Number(parsed.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  return {
    durationMs: Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds * 1_000)) : 0,
    width: video && Number.isInteger(Number(video.width)) ? Number(video.width) : null,
    height: video && Number.isInteger(Number(video.height)) ? Number(video.height) : null,
    videoCodec: video?.codec_name ? String(video.codec_name) : null,
    audioCodec: audio?.codec_name ? String(audio.codec_name) : null,
    frameRate: frameRate(video?.avg_frame_rate ? String(video.avg_frame_rate) : undefined),
    channels: audio && Number.isInteger(Number(audio.channels)) ? Number(audio.channels) : null,
    sampleRate: audio && Number.isInteger(Number(audio.sample_rate)) ? Number(audio.sample_rate) : null,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
  };
}

async function sha256File(inputPath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(inputPath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function saveRendition(asset: Asset, input: {
  renditionKey: string;
  role: "poster" | "thumbnail" | "preview" | "audio" | "video" | "adaptive_manifest" | "download";
  storageProvider: string;
  storageKey: string;
  publicUrl: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  bitrateKbps?: number | null;
  durationMs?: number | null;
  sizeBytes?: number | null;
  manifestType?: "hls" | "dash" | null;
  metadata?: Record<string, unknown>;
}) {
  const [rendition] = await db.insert(mediaRenditions).values({
    assetId: asset.id,
    ownerUserId: asset.ownerUserId,
    ...input,
    metadata: input.metadata ?? {},
  }).onConflictDoUpdate({
    target: [mediaRenditions.assetId, mediaRenditions.renditionKey],
    set: { ...input, metadata: input.metadata ?? {}, status: "ready", updatedAt: new Date() },
  }).returning();
  return rendition;
}

async function materialize(asset: Asset, directory: string) {
  const inputPath = path.join(directory, `source${extension(asset.originalFilename, ".bin")}`);
  await materializeStoredAsset(asset.storageKey, asset.visibility === "private" ? "private" : "public", inputPath);
  return inputPath;
}

async function processProbe(asset: Asset, inputPath: string, jobId?: string) {
  const [probe, sha256] = await Promise.all([probeFile(inputPath, jobId), asset.sha256 ? Promise.resolve(asset.sha256) : sha256File(inputPath)]);
  await db.update(assets).set({ sha256, metadata: { ...asset.metadata, mediaProbe: probe, mediaProbedAt: new Date().toISOString() } }).where(eq(assets.id, asset.id));
  const role = probe.hasVideo ? "video" : probe.hasAudio ? "audio" : "download";
  await saveRendition(asset, {
    renditionKey: "source-v1",
    role,
    storageProvider: asset.storageProvider,
    storageKey: asset.storageKey,
    publicUrl: asset.publicUrl,
    mimeType: asset.mimeType ?? "application/octet-stream",
    width: probe.width,
    height: probe.height,
    durationMs: probe.durationMs,
    sizeBytes: asset.sizeBytes,
    metadata: { original: true, ...probe },
  });
  return probe;
}

async function knownProbe(asset: Asset, inputPath: string, jobId?: string) {
  const prior = asset.metadata?.mediaProbe;
  if (prior && typeof prior === "object") return prior as Probe;
  return processProbe(asset, inputPath, jobId);
}

async function processThumbnail(asset: Asset, inputPath: string, directory: string, jobId: string) {
  const probe = await knownProbe(asset, inputPath, jobId);
  if (!probe.hasVideo) throw Object.assign(new Error("Thumbnail generation requires video"), { code: "media_kind_mismatch" });
  const outputPath = path.join(directory, "poster.jpg");
  const at = Math.max(0, Math.min(3, probe.durationMs / 2_000));
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(at), "-i", inputPath, "-frames:v", "1", "-vf", "scale=w='min(1280,iw)':h=-2", "-q:v", "3", outputPath], 4 * 60_000, jobId);
  const stored = await persistManagedFile({ sourcePath: outputPath, ownerUserId: asset.ownerUserId, kind: "poster", filename: `${path.parse(asset.originalFilename ?? "media").name}-poster.jpg`, mimeType: "image/jpeg", visibility: asset.visibility === "private" ? "private" : "public" });
  const height = probe.height && probe.width ? Math.round(Math.min(1280, probe.width) * probe.height / probe.width) : null;
  return saveRendition(asset, { renditionKey: "poster-1280-v1", role: "poster", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", ...stored, mimeType: "image/jpeg", width: probe.width ? Math.min(1280, probe.width) : null, height, metadata: { generatedBy: "media-cloud", atMs: Math.round(at * 1_000) } });
}

async function processTranscode(asset: Asset, inputPath: string, directory: string, jobId: string) {
  const probe = await knownProbe(asset, inputPath, jobId);
  if (!probe.hasVideo && !probe.hasAudio) throw Object.assign(new Error("Transcoding requires audio or video"), { code: "media_kind_mismatch" });
  const video = probe.hasVideo;
  const outputName = `${path.parse(asset.originalFilename ?? "media").name}-${video ? "720p.mp4" : "audio.m4a"}`;
  const outputPath = path.join(directory, video ? "preview-720.mp4" : "audio.m4a");
  const args = video
    ? ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vf", "scale=w=-2:h='min(720,ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", ...(probe.hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]), "-movflags", "+faststart", outputPath]
    : ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vn", "-c:a", "aac", "-b:a", "160k", outputPath];
  await run("ffmpeg", args, 30 * 60_000, jobId);
  const stored = await persistManagedFile({ sourcePath: outputPath, ownerUserId: asset.ownerUserId, kind: video ? "video-rendition" : "audio-rendition", filename: outputName, mimeType: video ? "video/mp4" : "audio/mp4", visibility: asset.visibility === "private" ? "private" : "public" });
  const height = video && probe.height ? Math.min(720, probe.height) : null;
  const width = video && height && probe.width && probe.height ? Math.round(height * probe.width / probe.height / 2) * 2 : null;
  return saveRendition(asset, { renditionKey: video ? "video-720p-v1" : "audio-aac-v1", role: video ? "video" : "audio", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", ...stored, mimeType: video ? "video/mp4" : "audio/mp4", width, height, bitrateKbps: video ? 2_800 : 160, durationMs: probe.durationMs, metadata: { generatedBy: "media-cloud", codec: video ? "h264" : "aac" } });
}

async function processWaveform(asset: Asset, inputPath: string, directory: string, jobId: string) {
  const probe = await knownProbe(asset, inputPath, jobId);
  if (!probe.hasAudio) throw Object.assign(new Error("Waveform generation requires audio"), { code: "media_kind_mismatch" });
  const outputPath = path.join(directory, "waveform.png");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=1600x240:colors=0x1d9bf0:scale=sqrt,format=rgba", "-frames:v", "1", outputPath], 5 * 60_000, jobId);
  const stored = await persistManagedFile({ sourcePath: outputPath, ownerUserId: asset.ownerUserId, kind: "waveform", filename: `${path.parse(asset.originalFilename ?? "audio").name}-waveform.png`, mimeType: "image/png", visibility: asset.visibility === "private" ? "private" : "public" });
  return saveRendition(asset, { renditionKey: "waveform-1600-v1", role: "thumbnail", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", ...stored, mimeType: "image/png", width: 1600, height: 240, durationMs: probe.durationMs, metadata: { generatedBy: "media-cloud", waveform: true } });
}

async function processPackage(asset: Asset, inputPath: string, directory: string, jobId: string) {
  if (asset.visibility !== "public") return { skipped: true, reason: "private_media_uses_signed_progressive_delivery" };
  const probe = await knownProbe(asset, inputPath, jobId);
  if (!probe.hasVideo) throw Object.assign(new Error("Adaptive packaging requires video"), { code: "media_kind_mismatch" });
  const heights = [360, 720].filter((height) => !probe.height || height <= probe.height);
  if (!heights.length) heights.push(probe.height ?? 360);
  // A one-picture MPEG-TS segment has no following DTS from which a player
  // can infer its duration. fMP4 stores that duration explicitly. Keep the
  // established TS path for longer content; never add frames to short clips.
  const shortFragmentedMp4 = probe.durationMs > 0 && probe.durationMs <= 1_000;
  const variants: Array<{ height: number; width: number; bitrate: number; playlist: string }> = [];
  for (const height of heights) {
    const width = probe.width && probe.height ? Math.max(2, Math.round(height * probe.width / probe.height / 2) * 2) : Math.round(height * 16 / 9 / 2) * 2;
    const bitrate = height <= 360 ? 900 : 2_800;
    const playlist = `${height}p.m3u8`;
    // FFmpeg's HLS URL directory resolution expects forward slashes, including
    // on Windows. Otherwise the initializer can escape into the worker's cwd.
    const playlistPath = path.join(directory, playlist).replaceAll("\\", "/");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vf", `scale=${width}:${height}`, "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${bitrate}k`, "-maxrate", `${Math.round(bitrate * 1.07)}k`, "-bufsize", `${bitrate * 2}k`, "-g", "60", "-keyint_min", "60", ...(probe.hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]), "-hls_time", "4", "-hls_playlist_type", "vod", ...(shortFragmentedMp4 ? ["-bf", "0", "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", `${height}p-init.mp4`] : []), "-hls_segment_filename", path.join(directory, `${height}p-%05d.${shortFragmentedMp4 ? "m4s" : "ts"}`), playlistPath], 30 * 60_000, jobId);
    variants.push({ height, width, bitrate, playlist });
  }
  const master = ["#EXTM3U", `#EXT-X-VERSION:${shortFragmentedMp4 ? 7 : 3}`, ...variants.flatMap((variant) => [`#EXT-X-STREAM-INF:BANDWIDTH=${(variant.bitrate + (probe.hasAudio ? 128 : 0)) * 1_000},RESOLUTION=${variant.width}x${variant.height}`, variant.playlist]), ""].join("\n");
  await fs.writeFile(path.join(directory, "master.m3u8"), master, "utf8");
  const prefix = `creativesos/${process.env.NODE_ENV ?? "development"}/public/users/${asset.ownerUserId}/adaptive/${asset.id}/${jobId}`;
  const files = await fs.readdir(directory);
  const packaged = files.filter((file) => file.endsWith(".m3u8") || file.endsWith(".ts") || /^[0-9]+p-(?:[0-9]+\.m4s|init\.mp4)$/.test(file));
  let masterStored: Awaited<ReturnType<typeof persistManagedFileAtKey>> | null = null;
  for (const file of packaged) {
    if (file.endsWith(".ts")) await finalizeOwnedHlsSegment(path.join(directory, file));
    if (file.endsWith(".m3u8") && file !== "master.m3u8") await finalizeOwnedHlsMediaPlaylist(path.join(directory, file));
    const stored = await persistManagedFileAtKey({ sourcePath: path.join(directory, file), storageKey: `${prefix}/${file}`, mimeType: file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".ts") ? "video/mp2t" : "video/mp4", visibility: "public", metadata: { owner: String(asset.ownerUserId), asset: asset.id, kind: "adaptive" } });
    if (file === "master.m3u8") masterStored = stored;
  }
  if (!masterStored) throw new Error("Adaptive master manifest was not persisted");
  const rendition = await saveRendition(asset, { renditionKey: "hls-master-v1", role: "adaptive_manifest", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", ...masterStored, mimeType: "application/vnd.apple.mpegurl", width: probe.width, height: probe.height, durationMs: probe.durationMs, manifestType: "hls", metadata: { generatedBy: "media-cloud", variants, files: packaged.length } });
  return { rendition, variants, files: packaged.length };
}

async function executeJob(job: MediaProcessingJob) {
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, job.assetId), eq(assets.status, "ready"))).limit(1);
  if (!asset) throw Object.assign(new Error("Source asset is no longer ready"), { code: "asset_unavailable" });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `creativesos-media-${job.id.slice(0, 8)}-`));
  try {
    const inputPath = await materialize(asset, directory);
    let output: unknown;
    if (job.kind === "probe") output = await processProbe(asset, inputPath, job.id);
    else if (job.kind === "thumbnail") output = await processThumbnail(asset, inputPath, directory, job.id);
    else if (job.kind === "transcode") output = await processTranscode(asset, inputPath, directory, job.id);
    else if (job.kind === "waveform") output = await processWaveform(asset, inputPath, directory, job.id);
    else if (job.kind === "package") output = await processPackage(asset, inputPath, directory, job.id);
    else throw Object.assign(new Error(`${job.kind} requires an approved provider or specialist processor`), { code: "processor_unavailable" });
    return (output ?? {}) as Record<string, unknown>;
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function cancelMediaProcess(jobId: string) {
  const processes = activeProcesses.get(jobId);
  if (!processes?.size) return false;
  processes.forEach((child) => child.kill("SIGKILL"));
  activeProcesses.delete(jobId);
  return true;
}

export async function processMediaJob(jobId: string) {
  if (!reserveWorkerSlot(running, jobId, worker.maxConcurrency, workerStopping)) return false;
  try {
    const now = new Date();
    const leaseToken = randomUUID();
    const claimed = await claimMediaJob(jobId, worker, leaseToken, now);
    if (!claimed) return false;
    await heartbeatWorker();
    const heartbeat = setInterval(() => {
      const heartbeatAt = new Date();
      void db.update(mediaProcessingJobs).set({
        heartbeatAt,
        leaseExpiresAt: new Date(heartbeatAt.getTime() + leaseMs),
        updatedAt: heartbeatAt,
      }).where(and(
        eq(mediaProcessingJobs.id, claimed.id),
        eq(mediaProcessingJobs.state, "running"),
        eq(mediaProcessingJobs.leaseToken, leaseToken),
      )).returning({ id: mediaProcessingJobs.id }).then((rows) => {
        if (!rows.length) cancelMediaProcess(claimed.id);
      }).catch((error) => console.error("Media worker lease heartbeat failed", { jobId: claimed.id, errorType: error instanceof Error ? error.name : typeof error }));
    }, Math.max(10_000, Math.floor(leaseMs / 3)));
    heartbeat.unref();
    try {
      const output = await executeJob(claimed);
      const finishedAt = new Date();
      const [completed] = await db.update(mediaProcessingJobs).set({
        state: "succeeded",
        progress: 1,
        output,
        errorCode: null,
        errorMessage: null,
        leaseExpiresAt: null,
        heartbeatAt: finishedAt,
        finishedAt,
        updatedAt: finishedAt,
      }).where(and(
        eq(mediaProcessingJobs.id, claimed.id),
        eq(mediaProcessingJobs.state, "running"),
        eq(mediaProcessingJobs.leaseToken, leaseToken),
      )).returning({ id: mediaProcessingJobs.id });
      if (completed && claimed.businessId) await recordOperationalServiceEvent({ businessId: claimed.businessId, service: "media_processing", success: true, durationMs: finishedAt.getTime() - now.getTime(), sourceType: "media_job", sourceId: `${claimed.id}:${claimed.attempt}`, quantity: finishedAt.getTime() - now.getTime(), unit: "compute_ms", estimatedCostMicros: estimatedComputeCostMicros(finishedAt.getTime() - now.getTime(), Number(process.env.MEDIA_WORKER_COST_MICROS_PER_MINUTE) || 0) }).catch(() => undefined);
      return Boolean(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1_000) : "Media processing failed";
      const code = typeof error === "object" && error && "code" in error ? String(error.code).slice(0, 120) : "media_processing_failed";
      const finishedAt = new Date();
      const [failed] = await db.update(mediaProcessingJobs).set({ state: "failed", errorCode: code, errorMessage: message, leaseExpiresAt: null, heartbeatAt: finishedAt, finishedAt, updatedAt: finishedAt }).where(and(eq(mediaProcessingJobs.id, claimed.id), eq(mediaProcessingJobs.state, "running"), eq(mediaProcessingJobs.leaseToken, leaseToken))).returning({ id: mediaProcessingJobs.id });
      if (failed && claimed.businessId) await recordOperationalServiceEvent({ businessId: claimed.businessId, service: "media_processing", success: false, durationMs: finishedAt.getTime() - now.getTime(), sourceType: "media_job", sourceId: `${claimed.id}:${claimed.attempt}`, quantity: finishedAt.getTime() - now.getTime(), unit: "compute_ms", estimatedCostMicros: estimatedComputeCostMicros(finishedAt.getTime() - now.getTime(), Number(process.env.MEDIA_WORKER_COST_MICROS_PER_MINUTE) || 0) }).catch(() => undefined);
      return false;
    } finally {
      clearInterval(heartbeat);
    }
  } finally {
    running.delete(jobId);
    void heartbeatWorker().catch((error) => console.error("Media worker node heartbeat failed", { errorType: error instanceof Error ? error.name : typeof error }));
  }
}

export async function processDueMediaJobs(limit = worker.maxConcurrency) {
  const availableSlots = Math.max(0, worker.maxConcurrency - running.size);
  if (!availableSlots) return 0;
  const jobs = await db.select({ id: mediaProcessingJobs.id }).from(mediaProcessingJobs).where(and(eq(mediaProcessingJobs.state, "queued"), inArray(mediaProcessingJobs.kind, worker.capabilities), lt(mediaProcessingJobs.availableAt, new Date(Date.now() + 1_000)))).orderBy(desc(mediaProcessingJobs.priority), asc(mediaProcessingJobs.createdAt)).limit(Math.max(1, Math.min(availableSlots, limit)));
  await Promise.all(jobs.map((job) => processMediaJob(job.id)));
  return jobs.length;
}

export async function recoverInterruptedMediaJobs() {
  const cutoff = new Date(Date.now() - 60 * 60_000);
  const now = new Date();
  const recovered = await db.update(mediaProcessingJobs).set({ state: "queued", progress: 0, workerId: null, workerRegion: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null, startedAt: null, availableAt: now, errorCode: "worker_recovered", errorMessage: "Recovered after an interrupted processing lease", updatedAt: now }).where(and(eq(mediaProcessingJobs.state, "running"), or(and(isNotNull(mediaProcessingJobs.leaseExpiresAt), lt(mediaProcessingJobs.leaseExpiresAt, now)), and(isNull(mediaProcessingJobs.leaseExpiresAt), lt(mediaProcessingJobs.updatedAt, cutoff))))).returning({ id: mediaProcessingJobs.id });
  return recovered.length;
}

export function scheduleMediaCloudProcessing() {
  if (timer) return;
  workerStopping = false;
  void heartbeatWorker().catch((error) => console.error("Media worker registration failed", { errorType: error instanceof Error ? error.name : typeof error }));
  nodeHeartbeatTimer = setInterval(() => void heartbeatWorker().catch((error) => console.error("Media worker node heartbeat failed", { errorType: error instanceof Error ? error.name : typeof error })), 15_000);
  nodeHeartbeatTimer.unref();
  void recoverInterruptedMediaJobs().then(() => processDueMediaJobs()).catch((error) => console.error("Media Cloud recovery failed", { errorType: error instanceof Error ? error.name : typeof error }));
  timer = setInterval(() => void processDueMediaJobs().catch((error) => console.error("Media Cloud processing failed", { errorType: error instanceof Error ? error.name : typeof error })), 10_000);
  timer.unref();
}

export async function stopMediaCloudProcessing() {
  workerStopping = true;
  if (timer) clearInterval(timer);
  if (nodeHeartbeatTimer) clearInterval(nodeHeartbeatTimer);
  timer = null;
  nodeHeartbeatTimer = null;
  if (!workerRegistered) return;
  if (running.size) {
    await heartbeatWorker("draining");
    const deadline = Date.now() + 10_000;
    while (running.size && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await heartbeatWorker(running.size ? "draining" : "offline");
}
