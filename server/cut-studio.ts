import type { Express, RequestHandler, Response } from "express";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assets, cutStudioJobs, cutStudioProjects } from "@shared/schema";
import {
  buildCmx3600Edl,
  cutDuration,
  cutRenderRequestSchema,
  detectCutCandidates,
  removeCutRange,
  validateCutEdl,
  type CutEdl,
  type CutTranscript,
} from "@shared/cut-studio";
import { attachUser } from "./auth";
import { ensureDefaultBusiness } from "./businesses";
import { db } from "./db";
import { emitProjectionEvent } from "./umh";
import {
  createPrivateAssetReadUrl,
  materializePrivateAsset,
  persistPrivateFile,
  promotePrivateAsset,
  removeStoredAsset,
} from "./asset-storage";

const createProjectSchema = z.object({
  sourceAssetId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  duration: z.number().finite().positive().max(43_200),
  mediaKind: z.enum(["video", "audio"]),
});
const promptSchema = z.object({ prompt: z.string().trim().min(1).max(2_000) });
const idSchema = z.string().uuid();
const running = new Set<string>();

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
}

async function ownedProject(userId: number, id: string) {
  const [project] = await db.select().from(cutStudioProjects)
    .where(and(eq(cutStudioProjects.id, id), eq(cutStudioProjects.ownerUserId, userId)))
    .limit(1);
  return project;
}

async function ownedAsset(userId: number, id: string) {
  const [asset] = await db.select().from(assets)
    .where(and(eq(assets.id, id), eq(assets.ownerUserId, userId)))
    .limit(1);
  return asset;
}

async function canStartJob(userId: number) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(cutStudioJobs)
    .where(and(eq(cutStudioJobs.ownerUserId, userId), sql`${cutStudioJobs.state} in ('queued', 'running')`));
  return (row?.count ?? 0) < 2;
}

function runProcess(command: string, args: string[], timeoutMs = 30 * 60_000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-8_000); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out`)); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-1_000)}`));
    });
  });
}

async function probeMedia(url: string) {
  let stdout = "";
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_streams", "-of", "json", url], { windowsHide: true });
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error("ffprobe could not inspect the source media")));
  });
  const streams = (JSON.parse(stdout).streams ?? []) as Array<{ codec_type?: string }>;
  return { hasVideo: streams.some((stream) => stream.codec_type === "video"), hasAudio: streams.some((stream) => stream.codec_type === "audio") };
}

async function transcribeMedia(inputPath: string, tempDirectory: string) {
  const audioPath = path.join(tempDirectory, "transcription.mp3");
  await runProcess("ffmpeg", ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audioPath], 10 * 60_000);
  const audio = await fs.readFile(audioPath);
  if (audio.byteLength > 24 * 1024 * 1024) throw Object.assign(new Error("The extracted audio is too long for one transcription job"), { code: "transcription_too_large" });
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), "transcription.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  let response: globalThis.Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  } catch {
    throw Object.assign(new Error("The transcription provider could not be reached"), { code: "provider_unavailable" });
  }
  const result = await response.json() as any;
  if (!response.ok) {
    const providerCode = String(result?.error?.code ?? `provider_${response.status}`);
    const message = providerCode === "credit_balance_exhausted" ? "Transcription requires available provider credit" : response.status === 401 ? "The transcription credential was rejected" : "The transcription provider rejected this job";
    throw Object.assign(new Error(message), { code: providerCode });
  }
  return result;
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
  for (const clip of edl.clips) {
    const speed = clip.speed ?? 1;
    if (time >= clip.start && time <= clip.end) return cursor + (time - clip.start) / speed;
    cursor += (clip.end - clip.start) / speed;
  }
  return null;
}

function transcriptToSrt(transcript: CutTranscript, edl: CutEdl) {
  let sequence = 0;
  const blocks: string[] = [];
  for (const segment of transcript.segments) {
    const start = sourceToOutput(edl, segment.start);
    const end = sourceToOutput(edl, Math.max(segment.start, segment.end - 0.001));
    if (start === null || end === null || end <= start) continue;
    sequence += 1;
    blocks.push(`${sequence}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${segment.text.trim()}\n`);
  }
  return blocks.join("\n");
}

function highlightCandidates(transcript: CutTranscript) {
  return transcript.segments.map((segment) => {
    const text = segment.text.trim();
    const length = segment.end - segment.start;
    let score = 50;
    if (/[?!]/.test(text)) score += 12;
    if (/\b(how|why|secret|mistake|best|never|always|important)\b/i.test(text)) score += 14;
    if (/\d/.test(text)) score += 8;
    if (length >= 8 && length <= 45) score += 10;
    return { id: segment.id, start: segment.start, end: segment.end, title: text.slice(0, 80) || "Highlight", score: Math.min(100, score) };
  }).sort((a, b) => b.score - a.score).slice(0, 12);
}

function deterministicProposal(prompt: string, edl: CutEdl, duration: number, transcript: CutTranscript | null): { edl: CutEdl; summary: string } | null {
  const range = prompt.match(/(?:remove|cut)\s+(?:from\s+)?(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?\s*(?:to|through|-)\s*(\d+(?:\.\d+)?)/i);
  if (range) return { edl: removeCutRange(edl, Number(range[1]), Number(range[2]), duration), summary: `Remove ${range[1]}s–${range[2]}s` };
  const intro = prompt.match(/(?:remove|cut)\s+(?:the\s+)?(?:first|intro)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)/i);
  if (intro) return { edl: removeCutRange(edl, 0, Number(intro[1]), duration), summary: `Remove the first ${intro[1]} seconds` };
  const outro = prompt.match(/(?:remove|cut)\s+(?:the\s+)?(?:last|outro)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)/i);
  if (outro) return { edl: removeCutRange(edl, Math.max(0, duration - Number(outro[1])), duration, duration), summary: `Remove the last ${outro[1]} seconds` };
  if (transcript && /(?:remove|cut).*(?:filler|ums?|uhs?)/i.test(prompt)) {
    const { fillerWords } = detectCutCandidates(transcript);
    const next = fillerWords.reduce((value, word) => removeCutRange(value, Math.max(0, word.start - 0.05), Math.min(duration, word.end + 0.05), duration), edl);
    return { edl: next, summary: `Remove ${fillerWords.length} filler word${fillerWords.length === 1 ? "" : "s"}` };
  }
  return null;
}

async function renderJob(jobId: string, project: typeof cutStudioProjects.$inferSelect, source: typeof assets.$inferSelect, request: z.infer<typeof cutRenderRequestSchema>) {
  const secure = await createPrivateAssetReadUrl(source.storageKey);
  const media = await probeMedia(secure.url);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-cut-"));
  const outputName = `${project.name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "cut"}.mp4`;
  const outputPath = path.join(temp, outputName);
  try {
    let clips = project.edl.clips;
    if (request.clip) {
      clips = clips.flatMap((clip) => {
        const start = Math.max(clip.start, request.clip!.start);
        const end = Math.min(clip.end, request.clip!.end);
        return end > start ? [{ ...clip, start, end }] : [];
      });
    }
    if (!clips.length) throw new Error("The requested render does not contain playable media");
    const filters: string[] = [];
    const concatInputs: string[] = [];
    clips.forEach((clip, index) => {
      const speed = clip.speed ?? 1;
      const outputDuration = (clip.end - clip.start) / speed;
      const fadeIn = Math.min(clip.fadeIn ?? 0, outputDuration / 2);
      const fadeOut = Math.min(clip.fadeOut ?? 0, outputDuration / 2);
      if (media.hasVideo) {
        const videoFilters = [`trim=start=${clip.start}:end=${clip.end}`, `setpts=(PTS-STARTPTS)/${speed}`];
        if (fadeIn > 0) videoFilters.push(`fade=t=in:st=0:d=${fadeIn}`);
        if (fadeOut > 0) videoFilters.push(`fade=t=out:st=${Math.max(0, outputDuration - fadeOut)}:d=${fadeOut}`);
        filters.push(`[0:v]${videoFilters.join(",")}[v${index}]`);
        concatInputs.push(`[v${index}]`);
      }
      if (media.hasAudio) {
        const audioFilters = [`atrim=start=${clip.start}:end=${clip.end}`, "asetpts=PTS-STARTPTS"];
        let remaining = speed;
        while (remaining > 2.0001) { audioFilters.push("atempo=2"); remaining /= 2; }
        while (remaining < 0.4999) { audioFilters.push("atempo=0.5"); remaining /= 0.5; }
        if (Math.abs(remaining - 1) > 0.0001) audioFilters.push(`atempo=${remaining}`);
        audioFilters.push(`volume=${clip.volume ?? 1}`);
        if (fadeIn > 0) audioFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
        if (fadeOut > 0) audioFilters.push(`afade=t=out:st=${Math.max(0, outputDuration - fadeOut)}:d=${fadeOut}`);
        filters.push(`[0:a]${audioFilters.join(",")}[a${index}]`);
        concatInputs.push(`[a${index}]`);
      }
    });
    filters.push(`${concatInputs.join("")}concat=n=${clips.length}:v=${media.hasVideo ? 1 : 0}:a=${media.hasAudio ? 1 : 0}${media.hasVideo ? "[video]" : ""}${media.hasAudio ? "[audio]" : ""}`);
    let videoLabel = "video";
    let audioLabel = "audio";
    if (media.hasVideo) {
      const height = request.resolution === "720p" ? 720 : request.resolution === "2160p" ? 2160 : 1080;
      if (request.aspect === "source") {
        filters.push(`[${videoLabel}]scale=-2:${height},fps=${request.fps}[framed]`);
      } else {
        const size = request.aspect === "9:16" ? [Math.round(height * 9 / 16 / 2) * 2, height] : request.aspect === "1:1" ? [height, height] : [Math.round(height * 16 / 9 / 2) * 2, height];
        filters.push(`[${videoLabel}]scale=${size[0]}:${size[1]}:force_original_aspect_ratio=decrease,pad=${size[0]}:${size[1]}:(ow-iw)/2:(oh-ih)/2:black,fps=${request.fps}[framed]`);
      }
      videoLabel = "framed";
    }
    if (media.hasVideo && request.captions && project.transcript) {
      const srtPath = path.join(temp, "captions.srt");
      await fs.writeFile(srtPath, transcriptToSrt(project.transcript, { version: 2, clips }), "utf8");
      const escaped = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      const style = request.captionStyle === 2 ? "FontSize=18,PrimaryColour=&H0000FFFF,Outline=2" : request.captionStyle === 3 ? "FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3" : "FontSize=18,PrimaryColour=&H00FFFFFF,Outline=2";
      filters.push(`[${videoLabel}]subtitles='${escaped}':force_style='${style}'[captioned]`);
      videoLabel = "captioned";
    }
    if (media.hasAudio && request.cleanAudio) { filters.push(`[${audioLabel}]afftdn=nf=-25[clean]`); audioLabel = "clean"; }
    const encoding = request.quality === "draft" ? { preset: "ultrafast", crf: "28", audio: "128k" } : request.quality === "master" ? { preset: "medium", crf: "16", audio: "256k" } : { preset: "veryfast", crf: "20", audio: "192k" };
    const duration = cutDuration({ version: 2, clips });
    const inputArgs = ["-y", "-i", secure.url];
    if (!media.hasVideo) inputArgs.push("-f", "lavfi", "-i", `color=c=black:s=1920x1080:d=${duration}`);
    const args = [...inputArgs, "-filter_complex", filters.join(";"), ...(media.hasVideo ? ["-map", `[${videoLabel}]`, "-c:v", "libx264", "-preset", encoding.preset, "-crf", encoding.crf] : ["-map", "1:v", "-c:v", "libx264"]), ...(media.hasAudio ? ["-map", `[${audioLabel}]`, "-c:a", "aac", "-b:a", encoding.audio] : []), "-movflags", "+faststart", "-shortest", outputPath];
    await db.update(cutStudioJobs).set({ progress: 0.35, detail: "Rendering edit" }).where(eq(cutStudioJobs.id, jobId));
    await runProcess("ffmpeg", args);
    const stored = await persistPrivateFile({ sourcePath: outputPath, ownerUserId: project.ownerUserId, kind: "cut-render", filename: outputName, mimeType: "video/mp4" });
    const [artifact] = await db.insert(assets).values({ ownerUserId: project.ownerUserId, businessId: project.businessId, kind: "video", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", storageKey: stored.storageKey, publicUrl: null, mimeType: "video/mp4", sizeBytes: stored.sizeBytes, visibility: "private", status: "ready", originalFilename: outputName, metadata: { cutStudioProjectId: project.id, cutStudioJobId: jobId } }).returning();
    return { artifact, output: { filename: outputName, duration, aspect: request.aspect, quality: request.quality, resolution: request.resolution, fps: request.fps } };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

async function processJob(jobId: string) {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const [claimed] = await db.update(cutStudioJobs).set({ state: "running", detail: "Starting", progress: 0.05, startedAt: new Date() })
      .where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "queued"))).returning();
    if (!claimed) return;
    const project = await ownedProject(claimed.ownerUserId, claimed.projectId);
    if (!project) throw new Error("CutStudio project no longer exists");
    const source = await ownedAsset(claimed.ownerUserId, project.sourceAssetId);
    if (!source) throw new Error("Source media no longer exists");
    if (claimed.kind === "transcribe") {
      if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error("Transcription provider is not configured"), { code: "provider_required" });
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-transcript-"));
      const inputPath = path.join(temp, source.originalFilename || "source.mp4");
      try {
        await materializePrivateAsset(source.storageKey, inputPath);
        await db.update(cutStudioJobs).set({ progress: 0.3, detail: "Transcribing media" }).where(eq(cutStudioJobs.id, jobId));
        const result = await transcribeMedia(inputPath, temp);
        const words = (result.words ?? []).map((word: any) => ({ word: String(word.word ?? "").trim(), start: Number(word.start ?? 0), end: Number(word.end ?? word.start ?? 0) })).filter((word: any) => word.word);
        const segments = (result.segments ?? []).map((segment: any, index: number) => ({ id: String(segment.id ?? index), start: Number(segment.start ?? 0), end: Number(segment.end ?? 0), text: String(segment.text ?? "").trim(), words: words.filter((word: any) => word.start >= Number(segment.start ?? 0) && word.end <= Number(segment.end ?? project.duration) + 0.1) }));
        const transcript: CutTranscript = { duration: Number(result.duration ?? project.duration), language: String(result.language ?? "en"), segments: segments.length ? segments : [{ id: "0", start: 0, end: project.duration, text: String(result.text ?? ""), words }] };
        await db.update(cutStudioProjects).set({ transcript, updatedAt: new Date() }).where(eq(cutStudioProjects.id, project.id));
        await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.transcript.ready", actorUserId: project.ownerUserId, payload: { businessId: project.businessId, jobId, wordCount: words.length }, idempotencyKey: `cutstudio:${jobId}:transcript.ready` });
        await db.update(cutStudioJobs).set({ state: "done", detail: "Transcript ready", progress: 1, output: { wordCount: words.length }, finishedAt: new Date() }).where(eq(cutStudioJobs.id, jobId));
      } finally { await fs.rm(temp, { recursive: true, force: true }); }
    } else if (claimed.kind === "highlights") {
      if (!project.transcript) throw Object.assign(new Error("Transcribe the media before extracting highlights"), { code: "transcript_required" });
      const candidates = highlightCandidates(project.transcript);
      await db.update(cutStudioJobs).set({ state: "done", detail: `${candidates.length} highlights found`, progress: 1, output: { candidates }, finishedAt: new Date() }).where(eq(cutStudioJobs.id, jobId));
    } else if (claimed.kind === "render") {
      const request = cutRenderRequestSchema.parse(claimed.request);
      const result = await renderJob(jobId, project, source, request);
      await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.render.ready", actorUserId: project.ownerUserId, payload: { businessId: project.businessId, jobId, artifactAssetId: result.artifact.id, ...result.output }, idempotencyKey: `cutstudio:${jobId}:render.ready` });
      await db.update(cutStudioJobs).set({ state: "done", detail: "Render ready", progress: 1, artifactAssetId: result.artifact.id, output: result.output, finishedAt: new Date() }).where(eq(cutStudioJobs.id, jobId));
    }
  } catch (error) {
    console.error("CutStudio job failed", { jobId, errorType: error instanceof Error ? error.name : typeof error });
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "processing_failed";
    await db.update(cutStudioJobs).set({ state: "error", detail: error instanceof Error ? error.message.slice(0, 240) : "Processing failed", errorCode: code, finishedAt: new Date() }).where(eq(cutStudioJobs.id, jobId)).catch(() => undefined);
  } finally { running.delete(jobId); }
}

function queueJob(jobId: string) {
  setImmediate(() => void processJob(jobId));
}

export function registerCutStudioRoutes(app: Express) {
  const wrap = (handler: RequestHandler): RequestHandler => (req, res, next) => {
    try { Promise.resolve(handler(req, res, next)).catch(next); } catch (error) { next(error); }
  };
  const cut = {
    get: (path: string, ...handlers: RequestHandler[]) => app.get(path, ...handlers.map(wrap)),
    post: (path: string, ...handlers: RequestHandler[]) => app.post(path, ...handlers.map(wrap)),
    put: (path: string, ...handlers: RequestHandler[]) => app.put(path, ...handlers.map(wrap)),
    delete: (path: string, ...handlers: RequestHandler[]) => app.delete(path, ...handlers.map(wrap)),
  };
  cut.get("/api/cut/projects", attachUser, async (req, res) => {
    noStore(res);
    const rows = await db.select().from(cutStudioProjects).where(eq(cutStudioProjects.ownerUserId, req.dbUser!.id)).orderBy(desc(cutStudioProjects.updatedAt));
    res.json(rows);
  });
  cut.post("/api/cut/projects", attachUser, async (req, res) => {
    noStore(res);
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Valid source media, name, duration, and media type are required" });
    const source = await ownedAsset(req.dbUser!.id, parsed.data.sourceAssetId);
    if (!source || source.visibility !== "private" || source.status !== "ready") return res.status(400).json({ message: "The private source media is not ready" });
    if (!source.mimeType?.startsWith(`${parsed.data.mediaKind}/`)) return res.status(400).json({ message: "The source media type does not match the project" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [project] = await db.insert(cutStudioProjects).values({ ...parsed.data, ownerUserId: req.dbUser!.id, businessId: business.id, edl: { version: 2, clips: [{ id: "clip_00", start: 0, end: parsed.data.duration, label: "clip00", speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] } }).returning();
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.project.created", actorUserId: req.dbUser!.id, payload: { businessId: business.id, sourceAssetId: project.sourceAssetId, mediaKind: project.mediaKind, duration: project.duration }, idempotencyKey: `cutstudio:${project.id}:project.created` });
    res.status(201).json(project);
  });
  cut.get("/api/cut/projects/:id", attachUser, async (req, res) => {
    noStore(res); const id = idSchema.safeParse(req.params.id); if (!id.success) return res.status(404).json({ message: "Project not found" });
    const project = await ownedProject(req.dbUser!.id, id.data); if (!project) return res.status(404).json({ message: "Project not found" });
    const jobs = await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.projectId, project.id)).orderBy(desc(cutStudioJobs.createdAt)).limit(20);
    res.json({ ...project, jobs });
  });
  cut.delete("/api/cut/projects/:id", attachUser, async (req, res) => {
    noStore(res); const id = idSchema.safeParse(req.params.id); if (!id.success) return res.status(404).json({ message: "Project not found" });
    const project = await ownedProject(req.dbUser!.id, id.data); if (!project) return res.status(404).json({ message: "Project not found" });
    await db.delete(cutStudioProjects).where(eq(cutStudioProjects.id, project.id)); res.status(204).end();
  });
  cut.get("/api/cut/projects/:id/media", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    const source = await ownedAsset(req.dbUser!.id, project.sourceAssetId); if (!source) return res.status(404).json({ message: "Source media not found" });
    res.json(await createPrivateAssetReadUrl(source.storageKey));
  });
  cut.get("/api/cut/projects/:id/edl", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    res.setHeader("X-EDL-Rev", String(project.revision)); res.json(project.edl);
  });
  cut.put("/api/cut/projects/:id/edl", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    const expected = Number(req.get("if-match")?.replace(/\"/g, "")); if (!Number.isInteger(expected)) return res.status(428).json({ message: "Edit revision is required" });
    let edl: CutEdl; try { edl = validateCutEdl(req.body, project.duration); } catch { return res.status(400).json({ message: "The edit decision list is invalid" }); }
    const [updated] = await db.update(cutStudioProjects).set({ edl, revision: sql`${cutStudioProjects.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioProjects.id, project.id), eq(cutStudioProjects.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "This edit changed elsewhere. Reload the latest version." });
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: updated.id, eventType: "cutstudio.edl.updated", actorUserId: req.dbUser!.id, payload: { businessId: updated.businessId, revision: updated.revision, clipCount: updated.edl.clips.length }, idempotencyKey: `cutstudio:${updated.id}:edl:${updated.revision}` });
    res.setHeader("X-EDL-Rev", String(updated.revision)); res.json(updated.edl);
  });
  cut.get("/api/cut/projects/:id/transcript", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" }); res.json(project.transcript);
  });
  cut.post("/api/cut/projects/:id/detect", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    if (!project.transcript) return res.status(409).json({ message: "Transcribe the media first" }); res.json(detectCutCandidates(project.transcript));
  });
  cut.post("/api/cut/projects/:id/ai-edit", attachUser, async (req, res) => {
    noStore(res); const parsed = promptSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "Describe the edit you want" });
    const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    const proposal = deterministicProposal(parsed.data.prompt, project.edl, project.duration, project.transcript);
    if (!proposal) return res.status(422).json({ message: "Try a precise request such as ‘remove 4 to 8 seconds’, ‘remove the first 3 seconds’, or ‘remove filler words’." });
    res.json(proposal);
  });
  for (const [route, kind] of [["transcribe", "transcribe"], ["highlights", "highlights"]] as const) cut.post(`/api/cut/projects/:id/${route}`, attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    if (!await canStartJob(req.dbUser!.id)) return res.status(429).json({ message: "Wait for an active CutStudio job to finish before starting another" });
    const [job] = await db.insert(cutStudioJobs).values({ projectId: project.id, ownerUserId: req.dbUser!.id, kind, request: {} }).returning(); queueJob(job.id); res.status(202).json(job);
  });
  cut.post("/api/cut/projects/:id/render", attachUser, async (req, res) => {
    noStore(res); const parsed = cutRenderRequestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "Render settings are invalid" });
    const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    if (!await canStartJob(req.dbUser!.id)) return res.status(429).json({ message: "Wait for an active CutStudio job to finish before starting another" });
    const requestedDuration = parsed.data.clip ? Math.max(0, parsed.data.clip.end - parsed.data.clip.start) : cutDuration(project.edl);
    if (requestedDuration > 7_200) return res.status(413).json({ message: "A single render can be up to two hours" });
    const [job] = await db.insert(cutStudioJobs).values({ projectId: project.id, ownerUserId: req.dbUser!.id, kind: "render", request: parsed.data }).returning(); queueJob(job.id); res.status(202).json(job);
  });
  cut.get("/api/cut/jobs/:id", attachUser, async (req, res) => {
    noStore(res); const [job] = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.id, req.params.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id))).limit(1); if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.state === "queued") queueJob(job.id);
    else if (job.state === "running" && job.startedAt && Date.now() - job.startedAt.getTime() > 35 * 60_000) {
      await db.update(cutStudioJobs).set({ state: "queued", detail: "Recovering interrupted job", progress: 0, startedAt: null }).where(eq(cutStudioJobs.id, job.id));
      queueJob(job.id);
      return res.json({ ...job, state: "queued", detail: "Recovering interrupted job", progress: 0 });
    }
    res.json(job);
  });
  cut.get("/api/cut/jobs/:id/media", attachUser, async (req, res) => {
    noStore(res); const [job] = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.id, req.params.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id))).limit(1); if (!job?.artifactAssetId) return res.status(404).json({ message: "Render not found" });
    const artifact = await ownedAsset(req.dbUser!.id, job.artifactAssetId); if (!artifact) return res.status(404).json({ message: "Render not found" }); res.json(await createPrivateAssetReadUrl(artifact.storageKey));
  });
  cut.post("/api/cut/jobs/:id/distribute", attachUser, async (req, res) => {
    noStore(res); const [job] = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.id, req.params.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id), eq(cutStudioJobs.state, "done"))).limit(1); if (!job?.artifactAssetId) return res.status(409).json({ message: "A completed render is required" });
    const artifact = await ownedAsset(req.dbUser!.id, job.artifactAssetId); if (!artifact) return res.status(404).json({ message: "Render not found" });
    const existingId = typeof artifact.metadata?.distributionAssetId === "string" ? artifact.metadata.distributionAssetId : null; if (existingId) { const existing = await ownedAsset(req.dbUser!.id, existingId); if (existing) return res.json(existing); }
    const promoted = await promotePrivateAsset({ storageKey: artifact.storageKey, ownerUserId: req.dbUser!.id, kind: "video", filename: artifact.originalFilename ?? "cutstudio-render.mp4", mimeType: artifact.mimeType ?? "video/mp4" });
    const [publicAsset] = await db.insert(assets).values({ ownerUserId: req.dbUser!.id, businessId: artifact.businessId, kind: "video", storageProvider: "r2", storageKey: promoted.storageKey, publicUrl: promoted.publicUrl, mimeType: artifact.mimeType, sizeBytes: promoted.sizeBytes, visibility: "public", status: "ready", originalFilename: artifact.originalFilename, metadata: { cutStudioJobId: job.id, sourcePrivateAssetId: artifact.id } }).returning();
    await db.update(assets).set({ metadata: { ...artifact.metadata, distributionAssetId: publicAsset.id } }).where(eq(assets.id, artifact.id));
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: job.projectId, eventType: "cutstudio.asset.promoted", actorUserId: req.dbUser!.id, payload: { businessId: artifact.businessId, jobId: job.id, privateAssetId: artifact.id, distributionAssetId: publicAsset.id }, idempotencyKey: `cutstudio:${job.id}:asset.promoted` });
    res.status(201).json(publicAsset);
  });
  cut.get("/api/cut/projects/:id/export.edl", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    res.type("text/plain").setHeader("Content-Disposition", `attachment; filename=\"${project.name.replace(/[^a-z0-9_-]+/gi, "-") || "cut"}.edl\"`); res.send(buildCmx3600Edl(project.name, project.edl));
  });
}
