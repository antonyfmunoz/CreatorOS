import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { assets, mediaProcessingJobs, mediaRenditions, type Asset, type MediaProcessingJob } from "@shared/schema";
import { materializeStoredAsset, persistManagedFile, persistManagedFileAtKey } from "./asset-storage";
import { db } from "./db";

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

async function run(command: string, args: string[], timeoutMs: number, jobId?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    if (jobId) {
      const processes = activeProcesses.get(jobId) ?? new Set<ReturnType<typeof spawn>>();
      processes.add(child);
      activeProcesses.set(jobId, processes);
    }
    const release = () => {
      if (!jobId) return;
      const processes = activeProcesses.get(jobId);
      processes?.delete(child);
      if (!processes?.size) activeProcesses.delete(jobId);
    };
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Object.assign(new Error(`${command} exceeded its processing deadline`), { code: "media_timeout" }));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk).slice(0, 2_000_000); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(0, 20_000); });
    child.once("error", (error) => { clearTimeout(timeout); release(); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      release();
      if (code === 0) resolve(stdout);
      else reject(Object.assign(new Error(`${command} failed: ${stderr.slice(-1_000) || `exit ${code}`}`), { code: "media_process_failed" }));
    });
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
  const variants: Array<{ height: number; width: number; bitrate: number; playlist: string }> = [];
  for (const height of heights) {
    const width = probe.width && probe.height ? Math.max(2, Math.round(height * probe.width / probe.height / 2) * 2) : Math.round(height * 16 / 9 / 2) * 2;
    const bitrate = height <= 360 ? 900 : 2_800;
    const playlist = `${height}p.m3u8`;
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vf", `scale=${width}:${height}`, "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${bitrate}k`, "-maxrate", `${Math.round(bitrate * 1.07)}k`, "-bufsize", `${bitrate * 2}k`, "-g", "60", "-keyint_min", "60", ...(probe.hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]), "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_segment_filename", path.join(directory, `${height}p-%05d.ts`), path.join(directory, playlist)], 30 * 60_000, jobId);
    variants.push({ height, width, bitrate, playlist });
  }
  const master = ["#EXTM3U", "#EXT-X-VERSION:3", ...variants.flatMap((variant) => [`#EXT-X-STREAM-INF:BANDWIDTH=${(variant.bitrate + (probe.hasAudio ? 128 : 0)) * 1_000},RESOLUTION=${variant.width}x${variant.height}`, variant.playlist]), ""].join("\n");
  await fs.writeFile(path.join(directory, "master.m3u8"), master, "utf8");
  const prefix = `creativesos/${process.env.NODE_ENV ?? "development"}/public/users/${asset.ownerUserId}/adaptive/${asset.id}/${jobId}`;
  const files = await fs.readdir(directory);
  const packaged = files.filter((file) => file.endsWith(".m3u8") || file.endsWith(".ts"));
  let masterStored: Awaited<ReturnType<typeof persistManagedFileAtKey>> | null = null;
  for (const file of packaged) {
    const stored = await persistManagedFileAtKey({ sourcePath: path.join(directory, file), storageKey: `${prefix}/${file}`, mimeType: file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t", visibility: "public", metadata: { owner: String(asset.ownerUserId), asset: asset.id, kind: "adaptive" } });
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
    await db.update(mediaProcessingJobs).set({ state: "succeeded", progress: 1, output: (output ?? {}) as Record<string, unknown>, errorCode: null, errorMessage: null, finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(mediaProcessingJobs.id, job.id), eq(mediaProcessingJobs.state, "running")));
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
  if (running.has(jobId)) return false;
  running.add(jobId);
  try {
    const [claimed] = await db.update(mediaProcessingJobs).set({ state: "running", progress: 0.05, attempt: sql`${mediaProcessingJobs.attempt} + 1`, startedAt: new Date(), updatedAt: new Date() }).where(and(eq(mediaProcessingJobs.id, jobId), eq(mediaProcessingJobs.state, "queued"))).returning();
    if (!claimed) return false;
    try {
      await executeJob(claimed);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1_000) : "Media processing failed";
      const code = typeof error === "object" && error && "code" in error ? String(error.code).slice(0, 120) : "media_processing_failed";
      await db.update(mediaProcessingJobs).set({ state: "failed", errorCode: code, errorMessage: message, finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(mediaProcessingJobs.id, claimed.id), eq(mediaProcessingJobs.state, "running")));
      return false;
    }
  } finally {
    running.delete(jobId);
  }
}

export async function processDueMediaJobs(limit = 2) {
  const jobs = await db.select({ id: mediaProcessingJobs.id }).from(mediaProcessingJobs).where(and(eq(mediaProcessingJobs.state, "queued"), lt(mediaProcessingJobs.availableAt, new Date(Date.now() + 1_000)))).orderBy(desc(mediaProcessingJobs.priority), asc(mediaProcessingJobs.createdAt)).limit(Math.max(1, Math.min(10, limit)));
  await Promise.all(jobs.map((job) => processMediaJob(job.id)));
  return jobs.length;
}

export async function recoverInterruptedMediaJobs() {
  const cutoff = new Date(Date.now() - 60 * 60_000);
  const recovered = await db.update(mediaProcessingJobs).set({ state: "queued", progress: 0, startedAt: null, availableAt: new Date(), errorCode: "worker_recovered", errorMessage: "Recovered after an interrupted processing lease", updatedAt: new Date() }).where(and(eq(mediaProcessingJobs.state, "running"), lt(mediaProcessingJobs.updatedAt, cutoff))).returning({ id: mediaProcessingJobs.id });
  return recovered.length;
}

export function scheduleMediaCloudProcessing() {
  if (timer) return;
  void recoverInterruptedMediaJobs().then(() => processDueMediaJobs()).catch((error) => console.error("Media Cloud recovery failed", { errorType: error instanceof Error ? error.name : typeof error }));
  timer = setInterval(() => void processDueMediaJobs().catch((error) => console.error("Media Cloud processing failed", { errorType: error instanceof Error ? error.name : typeof error })), 10_000);
  timer.unref();
}
