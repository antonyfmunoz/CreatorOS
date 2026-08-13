import type { Express, RequestHandler, Response } from "express";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assets, cutStudioCollaborators, cutStudioJobs, cutStudioProjectMedia, cutStudioProjects, cutStudioReviewComments, cutStudioReviewDecisions, cutStudioReviewLinks, cutStudioVersions, cutStudioWorkspaceNotes, notifications, users } from "@shared/schema";
import {
  buildCmx3600Edl,
  buildKineticAssCaptions,
  buildSrtCaptions,
  applyTranscriptStoryOrder,
  cutDuration,
  cutTrackEffectiveGain,
  cutRenderRequestSchema,
  cutTranscriptSchema,
  detectCutCandidates,
  removeCutRange,
  parseCubeLut,
  parseEbur128Summary,
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
const projectMediaSchema = z.object({
  assetId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  duration: z.number().finite().positive().max(43_200),
  mediaKind: z.enum(["video", "audio"]),
});

function motionPropertyExpression(clip: CutEdl["clips"][number], property: "x" | "y" | "opacity", multiplier: number, timeVariable = "t") {
  const transform = clip.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 };
  const timelineStart = clip.timelineStart ?? 0;
  const points = [{ at: 0, value: transform[property], easing: "linear" as const }, ...(clip.motionKeyframes ?? []).flatMap((keyframe) => typeof keyframe[property] === "number" ? [{ at: keyframe.at, value: keyframe[property]!, easing: keyframe.easing ?? "linear" as const }] : [])]
    .sort((left, right) => left.at - right.at)
    .filter((point, index, all) => index === all.length - 1 || Math.abs(point.at - all[index + 1].at) > 0.0005);
  const output = (value: number) => Number((value * multiplier).toFixed(5));
  if (points.length === 1) return String(output(points[0].value));
  let expression = String(output(points.at(-1)!.value));
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const left = points[index];
    const right = points[index + 1];
    const start = Number((timelineStart + left.at).toFixed(3));
    const end = Number((timelineStart + right.at).toFixed(3));
    const from = output(left.value);
    const delta = Number((output(right.value) - from).toFixed(5));
    const duration = Number((right.at - left.at).toFixed(3));
    const progress = `(${timeVariable}-${start})/${duration}`;
    const easedProgress = right.easing === "ease_in_out" ? `(${progress})*(${progress})*(3-2*(${progress}))` : progress;
    const interpolated = `${from}+${delta}*${easedProgress}`;
    expression = `if(lt(${timeVariable}\\,${end})\\,${interpolated}\\,${expression})`;
  }
  return expression;
}

function motionScaleExpression(clip: CutEdl["clips"][number], divisor = 1, fps = 30) {
  const points = [{ at: 0, value: 1, easing: "linear" as const }, ...(clip.motionKeyframes ?? []).flatMap((keyframe) => typeof keyframe.scale === "number" ? [{ at: keyframe.at, value: keyframe.scale, easing: keyframe.easing ?? "linear" as const }] : [])]
    .sort((left, right) => left.at - right.at)
    .filter((point, index, all) => index === all.length - 1 || Math.abs(point.at - all[index + 1].at) > 0.0005);
  const output = (value: number) => Number((value / divisor).toFixed(5));
  if (points.length === 1) return String(output(points[0].value));
  let expression = String(output(points.at(-1)!.value));
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const left = points[index]; const right = points[index + 1];
    const start = Number(left.at.toFixed(3)); const end = Number(right.at.toFixed(3));
    const from = output(left.value); const delta = Number((output(right.value) - from).toFixed(5)); const duration = Number((right.at - left.at).toFixed(3));
    const progress = `(on/${fps}-${start})/${duration}`;
    const eased = right.easing === "ease_in_out" ? `(${progress})*(${progress})*(3-2*(${progress}))` : progress;
    expression = `if(lt(on/${fps}\\,${end})\\,${from}+${delta}*${eased}\\,${expression})`;
  }
  return expression;
}

function motionOverlayExpression(clip: CutEdl["clips"][number], axis: "x" | "y", canvasSize: number) {
  return motionPropertyExpression(clip, axis, canvasSize);
}

function clipVolumeExpression(clip: CutEdl["clips"][number], multiplier = 1) {
  const points = [{ at: 0, value: clip.volume ?? 1, easing: "linear" as const }, ...(clip.volumeKeyframes ?? []).map((keyframe) => ({ at: keyframe.at, value: keyframe.volume, easing: keyframe.easing ?? "linear" }))]
    .sort((left, right) => left.at - right.at)
    .filter((point, index, all) => index === all.length - 1 || Math.abs(point.at - all[index + 1].at) > 0.0005);
  const gain = (value: number) => Number((value * multiplier).toFixed(5));
  if (points.length === 1) return String(gain(points[0].value));
  let expression = String(gain(points.at(-1)!.value));
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const left = points[index];
    const right = points[index + 1];
    const end = Number(right.at.toFixed(3));
    const from = gain(left.value);
    const delta = Number((gain(right.value) - from).toFixed(5));
    const duration = Number((right.at - left.at).toFixed(3));
    const progress = `t/${duration}`.replace("t", `(t-${Number(left.at.toFixed(3))})`);
    const easedProgress = right.easing === "ease_in_out" ? `(${progress})*(${progress})*(3-2*(${progress}))` : progress;
    expression = `if(lt(t\\,${end})\\,${from}+${delta}*${easedProgress}\\,${expression})`;
  }
  return expression;
}
const projectLutSchema = z.object({ assetId: z.string().uuid(), name: z.string().trim().min(1).max(160) });
const createReviewSchema = z.object({
  jobId: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(120).default("Client review"),
  expiresDays: z.number().int().min(1).max(90).default(14),
});
const reviewCommentSchema = z.object({
  authorName: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(2_000),
  positionMs: z.number().int().min(0).max(43_200_000).default(0),
});
const reviewDecisionSchema = z.object({
  reviewerName: z.string().trim().min(1).max(100),
  decision: z.enum(["approved", "changes_requested"]),
  note: z.string().trim().max(2_000).optional(),
});
const collaboratorSchema = z.object({
  username: z.string().trim().min(1).max(100),
  role: z.enum(["reviewer", "editor"]).default("reviewer"),
});
const workspaceNoteSchema = z.object({
  body: z.string().trim().min(1).max(2_000),
  positionMs: z.number().int().min(0).max(43_200_000).default(0),
});
const idSchema = z.string().uuid();
const running = new Set<string>();
const activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
}

async function privateReadDescriptor(asset: typeof assets.$inferSelect, localUrl: string) {
  if (asset.storageProvider === "local" && process.env.NODE_ENV !== "production") return { url: localUrl, expiresAt: null };
  return createPrivateAssetReadUrl(asset.storageKey);
}

async function streamPrivateAsset(res: Response, asset: typeof assets.$inferSelect) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-private-preview-"));
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

function reviewTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function activeReview(token: string) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const [link] = await db.select().from(cutStudioReviewLinks).where(eq(cutStudioReviewLinks.tokenHash, reviewTokenHash(token))).limit(1);
  if (!link || link.status !== "active" || link.expiresAt.getTime() <= Date.now()) return null;
  const [[version], [project]] = await Promise.all([
    db.select().from(cutStudioVersions).where(eq(cutStudioVersions.id, link.versionId)).limit(1),
    db.select().from(cutStudioProjects).where(eq(cutStudioProjects.id, link.projectId)).limit(1),
  ]);
  if (!version || !project) return null;
  return { link, version, project };
}

async function ownedProject(userId: number, id: string) {
  const [project] = await db.select().from(cutStudioProjects)
    .where(and(eq(cutStudioProjects.id, id), eq(cutStudioProjects.ownerUserId, userId)))
    .limit(1);
  return project;
}

async function workspaceProject(userId: number, id: string) {
  const project = await ownedProject(userId, id);
  if (project) return { project, role: "owner" as const };
  const [collaborator] = await db.select().from(cutStudioCollaborators).where(and(eq(cutStudioCollaborators.projectId, id), eq(cutStudioCollaborators.userId, userId))).limit(1);
  if (!collaborator) return null;
  const [sharedProject] = await db.select().from(cutStudioProjects).where(eq(cutStudioProjects.id, id)).limit(1);
  return sharedProject ? { project: sharedProject, role: collaborator.role as "reviewer" | "editor" } : null;
}

async function cutWorkspaceParticipants(project: typeof cutStudioProjects.$inferSelect) {
  const collaborators = await db.select().from(cutStudioCollaborators).where(eq(cutStudioCollaborators.projectId, project.id)).orderBy(cutStudioCollaborators.createdAt);
  const participantIds = Array.from(new Set([project.ownerUserId, ...collaborators.map((item) => item.userId)]));
  const accounts = await db.select({ id: users.id, username: users.username, displayName: users.displayName, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, participantIds));
  return accounts.map((account) => ({ ...account, role: account.id === project.ownerUserId ? "owner" : collaborators.find((item) => item.userId === account.id)?.role ?? "reviewer" }));
}

async function ownedAsset(userId: number, id: string) {
  const [asset] = await db.select().from(assets)
    .where(and(eq(assets.id, id), eq(assets.ownerUserId, userId)))
    .limit(1);
  return asset;
}

async function projectMedia(projectId: string, userId: number) {
  return db.select().from(cutStudioProjectMedia).where(and(eq(cutStudioProjectMedia.projectId, projectId), eq(cutStudioProjectMedia.ownerUserId, userId))).orderBy(cutStudioProjectMedia.createdAt);
}

async function projectLuts(project: typeof cutStudioProjects.$inferSelect) {
  return db.select({ id: assets.id, name: assets.originalFilename, sizeBytes: assets.sizeBytes, metadata: assets.metadata, createdAt: assets.createdAt }).from(assets).where(and(eq(assets.ownerUserId, project.ownerUserId), eq(assets.businessId, project.businessId), eq(assets.kind, "cut-lut"), eq(assets.visibility, "private"), eq(assets.status, "ready"))).orderBy(desc(assets.createdAt));
}

function escapeFfmpegFilterPath(value: string) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function materializeCutLuts(project: typeof cutStudioProjects.$inferSelect, clips: CutEdl["clips"], temp: string) {
  const lutIds = Array.from(new Set(clips.flatMap((clip) => clip.lutAssetId ? [clip.lutAssetId] : [])));
  const result = new Map<string, string>();
  if (!lutIds.length) return result;
  const rows = await db.select().from(assets).where(and(inArray(assets.id, lutIds), eq(assets.ownerUserId, project.ownerUserId), eq(assets.businessId, project.businessId), eq(assets.kind, "cut-lut"), eq(assets.visibility, "private"), eq(assets.status, "ready")));
  if (rows.length !== lutIds.length) throw new Error("One or more private LUTs are unavailable");
  for (const asset of rows) {
    const lutPath = path.join(temp, `lut-${asset.id}.cube`);
    await materializePrivateAsset(asset.storageKey, lutPath);
    parseCubeLut(await fs.readFile(lutPath, "utf8"));
    result.set(asset.id, lutPath);
  }
  return result;
}

async function canStartJob(userId: number) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(cutStudioJobs)
    .where(and(eq(cutStudioJobs.ownerUserId, userId), sql`${cutStudioJobs.state} in ('queued', 'running')`));
  return (row?.count ?? 0) < 2;
}

function runProcess(command: string, args: string[], timeoutMs = 30 * 60_000, jobId?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    if (jobId) activeProcesses.set(jobId, child);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-8_000); });
    let settled = false;
    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (jobId && activeProcesses.get(jobId) === child) activeProcesses.delete(jobId);
      handler();
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(() => reject(new Error(`${command} timed out`))); }, timeoutMs);
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      finish(() => code === 0 ? resolve(stderr) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1_000)}`)));
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

async function cutStudioFontFilter() {
  const candidates = [
    process.env.CUT_STUDIO_FONT_FILE,
    process.platform === "win32" ? "C:/Windows/Fonts/arialbd.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    process.platform === "win32" ? "C:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (await fs.access(candidate).then(() => true).catch(() => false)) {
      const escaped = candidate.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      return `fontfile='${escaped}':`;
    }
  }
  throw new Error("CutStudio title rendering requires an installed production font");
}

async function transcribeMedia(inputPath: string, tempDirectory: string, jobId: string) {
  const audioPath = path.join(tempDirectory, "transcription.mp3");
  await runProcess("ffmpeg", ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audioPath], 10 * 60_000, jobId);
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

async function appendCaptionFilter(filters: string[], videoLabel: string, request: z.infer<typeof cutRenderRequestSchema>, transcript: CutTranscript, edl: CutEdl, temp: string) {
  if (request.captionStyle === 4) {
    const assPath = path.join(temp, "captions.ass");
    await fs.writeFile(assPath, buildKineticAssCaptions(transcript, edl), "utf8");
    const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
    filters.push(`[${videoLabel}]ass='${escaped}'[captioned]`);
    return "captioned";
  }
  const srtPath = path.join(temp, "captions.srt");
  await fs.writeFile(srtPath, buildSrtCaptions(transcript, edl), "utf8");
  const escaped = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const style = request.captionStyle === 2 ? "FontSize=18,PrimaryColour=&H0000FFFF,Outline=2" : request.captionStyle === 3 ? "FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3" : "FontSize=18,PrimaryColour=&H00FFFFFF,Outline=2";
  filters.push(`[${videoLabel}]subtitles='${escaped}':force_style='${style}'[captioned]`);
  return "captioned";
}

async function renderMultitrack(
  jobId: string,
  project: typeof cutStudioProjects.$inferSelect,
  source: typeof assets.$inferSelect,
  request: z.infer<typeof cutRenderRequestSchema>,
  clips: CutEdl["clips"],
  graphics: NonNullable<CutEdl["graphics"]>,
  trackSettings: NonNullable<CutEdl["tracks"]>,
  audioBuses: NonNullable<CutEdl["audioBuses"]>,
  lutPaths: Map<string, string>,
  temp: string,
  outputPath: string,
) {
  const requestedAssetIds = Array.from(new Set([source.id, ...clips.flatMap((clip) => clip.assetId ? [clip.assetId] : [])]));
  const assetRows = await db.select().from(assets).where(and(eq(assets.ownerUserId, project.ownerUserId), inArray(assets.id, requestedAssetIds)));
  if (assetRows.length !== requestedAssetIds.length) throw new Error("One or more multitrack sources are unavailable");
  const inputs = await Promise.all(assetRows.map(async (asset, index) => {
    const extension = path.extname(asset.originalFilename ?? "") || (asset.mimeType?.startsWith("audio/") ? ".m4a" : ".mp4");
    const inputPath = path.join(temp, `source-${index}${extension}`);
    await materializePrivateAsset(asset.storageKey, inputPath);
    return { asset, url: inputPath, media: await probeMedia(inputPath) };
  }));
  const inputIndex = new Map(inputs.map((input, index) => [input.asset.id, index]));
  const inputById = new Map(inputs.map((input) => [input.asset.id, input]));
  const settings = new Map(trackSettings.map((track) => [track.track, track]));
  const audioTracks = Array.from(new Set(clips.filter((clip) => (clip.track ?? "v1").startsWith("a")).map((clip) => clip.track ?? "a1")));
  const soloAudioTracks = new Set(audioTracks.filter((track) => settings.get(track)?.solo));
  const audioTrackEnabled = (track: string) => !settings.get(track)?.muted && (!soloAudioTracks.size || soloAudioTracks.has(track));
  const trackGain = (track: string) => cutTrackEffectiveGain(track, trackSettings, audioBuses);
  const primaryClips = clips.filter((clip) => (clip.track ?? "v1") === "v1");
  if (!primaryClips.length) throw new Error("A multitrack edit requires a primary video track");
  const primaryHasAudio = audioTrackEnabled("v1") && primaryClips.every((clip) => inputById.get(clip.assetId ?? source.id)?.media.hasAudio);
  const duckingClips = primaryHasAudio ? clips.filter((clip) => (clip.track ?? "").startsWith("a") && audioTrackEnabled(clip.track ?? "a1") && clip.duckUnderVoice && inputById.get(clip.assetId ?? "")?.media.hasAudio) : [];
  const filters: string[] = [];
  const primaryDurations: number[] = [];
  const height = request.resolution === "720p" ? 720 : request.resolution === "2160p" ? 2160 : 1080;
  const size = request.aspect === "source" || request.aspect === "16:9" ? [Math.round(height * 16 / 9 / 2) * 2, height] : request.aspect === "9:16" ? [Math.round(height * 9 / 16 / 2) * 2, height] : [height, height];
  for (let index = 0; index < primaryClips.length; index += 1) {
    const clip = primaryClips[index];
    const assetId = clip.assetId ?? source.id;
    const media = inputById.get(assetId)?.media;
    const sourceIndex = inputIndex.get(assetId);
    if (!media?.hasVideo || sourceIndex === undefined) throw new Error("Primary multitrack clips must contain video");
    const speed = clip.speed ?? 1;
    const outputDuration = (clip.end - clip.start) / speed;
    primaryDurations.push(outputDuration);
    const transitionFade = clip.transition === "fade_black" ? Math.min(0.35, outputDuration / 2) : 0;
    const fadeIn = Math.min(Math.max(clip.fadeIn ?? 0, index > 0 ? transitionFade : 0), outputDuration / 2);
    const fadeOut = Math.min(Math.max(clip.fadeOut ?? 0, index < primaryClips.length - 1 ? transitionFade : 0), outputDuration / 2);
    const videoFilters = [`trim=start=${clip.start}:end=${clip.end}`, `setpts=(PTS-STARTPTS)/${speed}`, ...clipColorFilters(clip, lutPaths), `scale=${size[0]}:${size[1]}:force_original_aspect_ratio=decrease`, `pad=${size[0]}:${size[1]}:(ow-iw)/2:(oh-ih)/2:black`, `fps=${request.fps}`, "format=yuv420p", "settb=AVTB"];
    if (fadeIn > 0) videoFilters.push(`fade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut > 0) videoFilters.push(`fade=t=out:st=${Math.max(0, outputDuration - fadeOut)}:d=${fadeOut}`);
    filters.push(`[${sourceIndex}:v]${videoFilters.join(",")}[basev${index}]`);
    if (primaryHasAudio) {
      const audioFilters = [`atrim=start=${clip.start}:end=${clip.end}`, "asetpts=PTS-STARTPTS", ...atempoFilters(speed), `volume='${clipVolumeExpression(clip, trackGain("v1"))}':eval=frame`, "aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo"];
      if (fadeIn > 0) audioFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
      if (fadeOut > 0) audioFilters.push(`afade=t=out:st=${Math.max(0, outputDuration - fadeOut)}:d=${fadeOut}`);
      filters.push(`[${sourceIndex}:a]${audioFilters.join(",")}[basea${index}]`);
    }
  }
  let primaryVideoLabel = "basev0";
  let primaryAudioLabel = primaryHasAudio ? "basea0" : null;
  let primaryDuration = primaryDurations[0];
  for (let index = 1; index < primaryClips.length; index += 1) {
    const dissolve = primaryClips[index].transition === "cross_dissolve";
    if (dissolve) {
      const duration = Math.min(0.35, primaryDurations[index - 1] / 2, primaryDurations[index] / 2);
      filters.push(`[${primaryVideoLabel}]tpad=stop_mode=clone:stop_duration=${duration}[dissolvepadv${index}]`);
      filters.push(`[dissolvepadv${index}][basev${index}]xfade=transition=fade:duration=${duration}:offset=${primaryDuration}[primaryv${index}]`);
      if (primaryAudioLabel) {
        filters.push(`[${primaryAudioLabel}]apad=pad_dur=${duration}[dissolvepada${index}]`);
        filters.push(`[dissolvepada${index}][basea${index}]acrossfade=d=${duration}:c1=tri:c2=tri[primarya${index}]`);
      }
    } else {
      filters.push(`[${primaryVideoLabel}][basev${index}]concat=n=2:v=1:a=0[primaryv${index}]`);
      if (primaryAudioLabel) filters.push(`[${primaryAudioLabel}][basea${index}]concat=n=2:v=0:a=1[primarya${index}]`);
    }
    primaryVideoLabel = `primaryv${index}`;
    if (primaryAudioLabel) primaryAudioLabel = `primarya${index}`;
    primaryDuration += primaryDurations[index];
  }
  filters.push(`[${primaryVideoLabel}]null[basevideo]`);
  if (primaryAudioLabel) filters.push(`[${primaryAudioLabel}]anull[${duckingClips.length ? "baseaudioraw" : "baseaudio"}]`);
  if (duckingClips.length) filters.push(`[baseaudioraw]asplit=${duckingClips.length + 1}[baseaudio]${duckingClips.map((_, index) => `[voicekey${index}]`).join("")}`);
  filters.push("[basevideo]null[framed0]");
  let videoLabel = "framed0";
  let overlayIndex = 0;
  let duckingIndex = 0;
  const audioLabels = primaryHasAudio ? ["[baseaudio]"] : [];
  for (const clip of clips.filter((item) => (item.track ?? "v1") !== "v1")) {
    const assetId = clip.assetId;
    if (!assetId) continue;
    const input = inputById.get(assetId);
    const sourceIndex = inputIndex.get(assetId);
    if (!input || sourceIndex === undefined) continue;
    const speed = clip.speed ?? 1;
    const clipDuration = (clip.end - clip.start) / speed;
    const timelineStart = clip.timelineStart ?? 0;
    if ((clip.track ?? "").startsWith("v") && !settings.get(clip.track ?? "v2")?.hidden && input.media.hasVideo) {
      const transform = clip.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 };
      const overlayWidth = Math.max(2, Math.round(size[0] * transform.width / 2) * 2);
      const overlayHeight = Math.max(2, Math.round(size[1] * transform.height / 2) * 2);
      const animatedScale = (clip.motionKeyframes ?? []).some((keyframe) => typeof keyframe.scale === "number");
      const scales = [1, ...(clip.motionKeyframes ?? []).flatMap((keyframe) => typeof keyframe.scale === "number" ? [keyframe.scale] : [])];
      const minimumScale = Math.min(...scales); const maximumScale = Math.max(...scales);
      const maximumAnimatedWidth = Math.max(2, Math.round(size[0] * transform.width * maximumScale / 2) * 2);
      const maximumAnimatedHeight = Math.max(2, Math.round(size[1] * transform.height * maximumScale / 2) * 2);
      const virtualWidth = Math.max(maximumAnimatedWidth, Math.round(maximumAnimatedWidth * maximumScale / minimumScale / 2) * 2);
      const virtualHeight = Math.max(maximumAnimatedHeight, Math.round(maximumAnimatedHeight * maximumScale / minimumScale / 2) * 2);
      const overlayFilters = animatedScale
        ? [...clipColorFilters(clip, lutPaths), `scale=${maximumAnimatedWidth}:${maximumAnimatedHeight}`, `pad=${virtualWidth}:${virtualHeight}:0:0:color=black@0`, "format=rgba", `zoompan=z='${motionScaleExpression(clip, minimumScale, request.fps)}':x=0:y=0:d=1:s=${maximumAnimatedWidth}x${maximumAnimatedHeight}:fps=${request.fps}`, `setpts=PTS+${timelineStart}/TB`]
        : [...clipColorFilters(clip, lutPaths), `scale=${overlayWidth}:${overlayHeight}:force_original_aspect_ratio=decrease`, `pad=${overlayWidth}:${overlayHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0`, "format=rgba"];
      if (clip.chromaKey?.enabled) overlayFilters.push(`chromakey=0x${clip.chromaKey.color.slice(1)}:${clip.chromaKey.similarity}:${clip.chromaKey.blend}`);
      const animatedOpacity = (clip.motionKeyframes ?? []).some((keyframe) => typeof keyframe.opacity === "number");
      if (animatedOpacity) {
        const opacityExpression = motionPropertyExpression(clip, "opacity", 1, "T");
        overlayFilters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${opacityExpression})'`);
      } else overlayFilters.push(`colorchannelmixer=aa=${transform.opacity}`);
      filters.push(`[${sourceIndex}:v]trim=start=${clip.start}:end=${clip.end},setpts=(PTS-STARTPTS)/${speed}+${timelineStart}/TB,${overlayFilters.join(",")}[overlay${overlayIndex}]`);
      const overlayX = motionOverlayExpression(clip, "x", size[0]);
      const overlayY = motionOverlayExpression(clip, "y", size[1]);
      filters.push(`[${videoLabel}][overlay${overlayIndex}]overlay=x='${overlayX}':y='${overlayY}':eval=frame:eof_action=pass:shortest=0:enable='between(t,${timelineStart},${timelineStart + clipDuration})'[framed${overlayIndex + 1}]`);
      videoLabel = `framed${overlayIndex + 1}`;
      overlayIndex += 1;
    }
    if ((clip.track ?? "").startsWith("a") && audioTrackEnabled(clip.track ?? "a1") && input.media.hasAudio) {
      const delay = Math.max(0, Math.round(timelineStart * 1_000));
      const label = `trackaudio${audioLabels.length}`;
      const audioFilters = [`atrim=start=${clip.start}:end=${clip.end}`, "asetpts=PTS-STARTPTS", ...atempoFilters(speed), `volume='${clipVolumeExpression(clip, trackGain(clip.track ?? "a1"))}':eval=frame`, `adelay=${delay}|${delay}`];
      filters.push(`[${sourceIndex}:a]${audioFilters.join(",")}[${label}]`);
      if (clip.duckUnderVoice && primaryHasAudio) {
        const duckedLabel = `duckedaudio${duckingIndex}`;
        filters.push(`[${label}][voicekey${duckingIndex}]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=500[${duckedLabel}]`);
        audioLabels.push(`[${duckedLabel}]`);
        duckingIndex += 1;
      } else audioLabels.push(`[${label}]`);
    }
  }
  const fontFilter = graphics.some((graphic) => graphic.text.trim()) ? await cutStudioFontFilter() : "";
  for (let index = 0; index < graphics.length; index += 1) {
    const graphic = graphics[index];
    if (!graphic.text.trim()) continue;
    const text = graphic.text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%").replace(/[\r\n]+/g, " ");
    const nextLabel = `graphic${index}`;
    filters.push(`[${videoLabel}]drawtext=${fontFilter}text='${text}':fontsize=${graphic.fontSize}:fontcolor=${graphic.textColor}:x=w*${graphic.x}:y=h*${graphic.y}:box=1:boxcolor=${graphic.backgroundColor}@${graphic.backgroundOpacity}:boxborderw=12:enable='between(t,${graphic.timelineStart},${graphic.timelineStart + graphic.duration})'[${nextLabel}]`);
    videoLabel = nextLabel;
  }
  let audioLabel: string | null = primaryHasAudio ? "baseaudio" : null;
  if (audioLabels.length > 1) {
    filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=2[mixedaudio]`);
    audioLabel = "mixedaudio";
  } else if (audioLabels.length === 1) audioLabel = audioLabels[0].slice(1, -1);
  if (request.captions && project.transcript) {
    videoLabel = await appendCaptionFilter(filters, videoLabel, request, project.transcript, { version: 3, clips, graphics }, temp);
  }
  const finishingFilters = masterAudioFilters(request);
  if (audioLabel && finishingFilters.length) { filters.push(`[${audioLabel}]${finishingFilters.join(",")}[finishedaudio]`); audioLabel = "finishedaudio"; }
  const encoding = request.quality === "draft" ? { preset: "ultrafast", crf: "28", audio: "128k" } : request.quality === "master" ? { preset: "medium", crf: "16", audio: "256k" } : { preset: "veryfast", crf: "20", audio: "192k" };
  const args = ["-y", ...inputs.flatMap((input) => ["-i", input.url]), "-filter_complex", filters.join(";"), "-map", `[${videoLabel}]`, "-c:v", "libx264", "-preset", encoding.preset, "-crf", encoding.crf, ...(audioLabel ? ["-map", `[${audioLabel}]`, "-c:a", "aac", "-b:a", encoding.audio] : []), "-movflags", "+faststart", "-shortest", outputPath];
  await db.update(cutStudioJobs).set({ progress: 0.35, detail: "Rendering multitrack edit" }).where(eq(cutStudioJobs.id, jobId));
  await runProcess("ffmpeg", args, 30 * 60_000, jobId);
}

function atempoFilters(speed: number) {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2.0001) { filters.push("atempo=2"); remaining /= 2; }
  while (remaining < 0.4999) { filters.push("atempo=0.5"); remaining /= 0.5; }
  if (Math.abs(remaining - 1) > 0.0001) filters.push(`atempo=${remaining}`);
  return filters;
}

function clipColorFilters(clip: CutEdl["clips"][number], lutPaths: Map<string, string>) {
  const filters: string[] = [];
  if (clip.colorPreset === "cinematic") filters.push("eq=contrast=1.08:saturation=0.9:brightness=-0.02", "colorbalance=rs=-0.02:bs=0.04");
  else if (clip.colorPreset === "vivid") filters.push("eq=contrast=1.08:saturation=1.25");
  else if (clip.colorPreset === "monochrome") filters.push("hue=s=0");
  if (clip.colorAdjust) {
    filters.push(`eq=brightness=${clip.colorAdjust.brightness}:contrast=${clip.colorAdjust.contrast}:saturation=${clip.colorAdjust.saturation}`);
    if (clip.colorAdjust.temperature !== 0) filters.push(`colorbalance=rs=${clip.colorAdjust.temperature * 0.1}:bs=${clip.colorAdjust.temperature * -0.1}`);
  }
  if (clip.lutAssetId) {
    const lutPath = lutPaths.get(clip.lutAssetId);
    if (!lutPath) throw new Error("The selected private LUT is unavailable");
    filters.push(`lut3d=file='${escapeFfmpegFilterPath(lutPath)}':interp=tetrahedral`);
  }
  return filters;
}

function masterAudioFilters(request: z.infer<typeof cutRenderRequestSchema>) {
  const filters: string[] = [];
  if (request.cleanAudio) filters.push("afftdn=nf=-25");
  if (request.audioPreset === "voice") filters.push("highpass=f=80", "lowpass=f=16000", "acompressor=threshold=0.125:ratio=3:attack=10:release=120", "loudnorm=I=-16:TP=-1.5:LRA=11", "alimiter=limit=0.95");
  else if (request.audioPreset === "broadcast") filters.push("highpass=f=70", "acompressor=threshold=0.1:ratio=4:attack=5:release=100", "loudnorm=I=-14:TP=-1:LRA=9", "alimiter=limit=0.94");
  else if (request.audioPreset === "music") filters.push("loudnorm=I=-14:TP=-1:LRA=12", "alimiter=limit=0.95");
  if (request.masterGainDb !== 0) filters.push(`volume=${request.masterGainDb}dB`);
  return filters;
}

async function renderJob(jobId: string, project: typeof cutStudioProjects.$inferSelect, source: typeof assets.$inferSelect, request: z.infer<typeof cutRenderRequestSchema>) {
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
    const lutPaths = await materializeCutLuts(project, clips, temp);
    if (project.edl.version === 3 && project.mediaKind === "video" && (clips.some((clip) => (clip.track ?? "v1") !== "v1" || clip.transition === "cross_dissolve") || (project.edl.graphics?.length ?? 0) > 0)) {
      if (project.mediaKind !== "video") throw new Error("Multitrack rendering currently requires a primary video project");
      await renderMultitrack(jobId, project, source, request, clips, project.edl.graphics ?? [], project.edl.tracks ?? [], project.edl.audioBuses ?? [], lutPaths, temp, outputPath);
      const duration = cutDuration({ version: 3, clips, graphics: project.edl.graphics, tracks: project.edl.tracks, audioBuses: project.edl.audioBuses });
      const stored = await persistPrivateFile({ sourcePath: outputPath, ownerUserId: project.ownerUserId, kind: "cut-render", filename: outputName, mimeType: "video/mp4" });
      const [artifact] = await db.insert(assets).values({ ownerUserId: project.ownerUserId, businessId: project.businessId, kind: "video", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", storageKey: stored.storageKey, publicUrl: null, mimeType: "video/mp4", sizeBytes: stored.sizeBytes, visibility: "private", status: "ready", originalFilename: outputName, metadata: { cutStudioProjectId: project.id, cutStudioJobId: jobId, multitrack: true } }).returning();
      return { artifact, output: { filename: outputName, duration, aspect: request.aspect, quality: request.quality, resolution: request.resolution, fps: request.fps, audioPreset: request.audioPreset, masterGainDb: request.masterGainDb, multitrack: true } };
    }
    const sourcePath = path.join(temp, source.originalFilename || "source.mp4");
    await materializePrivateAsset(source.storageKey, sourcePath);
    const media = await probeMedia(sourcePath);
    const filters: string[] = [];
    const concatInputs: string[] = [];
    clips.forEach((clip, index) => {
      const speed = clip.speed ?? 1;
      const outputDuration = (clip.end - clip.start) / speed;
      const transitionFade = clip.transition === "fade_black" ? Math.min(0.35, outputDuration / 2) : 0;
      const fadeIn = Math.min(Math.max(clip.fadeIn ?? 0, index > 0 ? transitionFade : 0), outputDuration / 2);
      const fadeOut = Math.min(Math.max(clip.fadeOut ?? 0, index < clips.length - 1 ? transitionFade : 0), outputDuration / 2);
      if (media.hasVideo) {
        const videoFilters = [`trim=start=${clip.start}:end=${clip.end}`, `setpts=(PTS-STARTPTS)/${speed}`, ...clipColorFilters(clip, lutPaths)];
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
      videoLabel = await appendCaptionFilter(filters, videoLabel, request, project.transcript, { version: 2, clips }, temp);
    }
    const finishingFilters = masterAudioFilters(request);
    if (media.hasAudio && finishingFilters.length) { filters.push(`[${audioLabel}]${finishingFilters.join(",")}[finishedaudio]`); audioLabel = "finishedaudio"; }
    const encoding = request.quality === "draft" ? { preset: "ultrafast", crf: "28", audio: "128k" } : request.quality === "master" ? { preset: "medium", crf: "16", audio: "256k" } : { preset: "veryfast", crf: "20", audio: "192k" };
    const duration = cutDuration({ version: 2, clips });
    const inputArgs = ["-y", "-i", sourcePath];
    if (!media.hasVideo) inputArgs.push("-f", "lavfi", "-i", `color=c=black:s=1920x1080:d=${duration}`);
    const args = [...inputArgs, "-filter_complex", filters.join(";"), ...(media.hasVideo ? ["-map", `[${videoLabel}]`, "-c:v", "libx264", "-preset", encoding.preset, "-crf", encoding.crf] : ["-map", "1:v", "-c:v", "libx264"]), ...(media.hasAudio ? ["-map", `[${audioLabel}]`, "-c:a", "aac", "-b:a", encoding.audio] : []), "-movflags", "+faststart", "-shortest", outputPath];
    await db.update(cutStudioJobs).set({ progress: 0.35, detail: "Rendering edit" }).where(eq(cutStudioJobs.id, jobId));
    await runProcess("ffmpeg", args, 30 * 60_000, jobId);
    const stored = await persistPrivateFile({ sourcePath: outputPath, ownerUserId: project.ownerUserId, kind: "cut-render", filename: outputName, mimeType: "video/mp4" });
    const [artifact] = await db.insert(assets).values({ ownerUserId: project.ownerUserId, businessId: project.businessId, kind: "video", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", storageKey: stored.storageKey, publicUrl: null, mimeType: "video/mp4", sizeBytes: stored.sizeBytes, visibility: "private", status: "ready", originalFilename: outputName, metadata: { cutStudioProjectId: project.id, cutStudioJobId: jobId } }).returning();
    return { artifact, output: { filename: outputName, duration, aspect: request.aspect, quality: request.quality, resolution: request.resolution, fps: request.fps, audioPreset: request.audioPreset, masterGainDb: request.masterGainDb } };
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
        const result = await transcribeMedia(inputPath, temp, jobId);
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
      const [completed] = await db.update(cutStudioJobs).set({ state: "done", detail: "Render ready", progress: 1, artifactAssetId: result.artifact.id, output: result.output, finishedAt: new Date() })
        .where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"))).returning();
      if (!completed) {
        await removeStoredAsset(result.artifact.storageKey, "private").catch(() => undefined);
        await db.delete(assets).where(eq(assets.id, result.artifact.id)).catch(() => undefined);
        return;
      }
      await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.render.ready", actorUserId: project.ownerUserId, payload: { businessId: project.businessId, jobId, artifactAssetId: result.artifact.id, ...result.output }, idempotencyKey: `cutstudio:${jobId}:render.ready` });
    }
  } catch (error) {
    console.error("CutStudio job failed", { jobId, errorType: error instanceof Error ? error.name : typeof error });
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "processing_failed";
    await db.update(cutStudioJobs).set({ state: "error", detail: error instanceof Error ? error.message.slice(0, 240) : "Processing failed", errorCode: code, finishedAt: new Date() }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"))).catch(() => undefined);
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
  cut.get("/api/cut/reviews/:token", async (req, res) => {
    noStore(res);
    const review = await activeReview(req.params.token);
    if (!review) return res.status(404).json({ message: "This review link is unavailable or expired" });
    const [comments, decisions, artifact] = await Promise.all([
      db.select().from(cutStudioReviewComments).where(eq(cutStudioReviewComments.versionId, review.version.id)).orderBy(cutStudioReviewComments.positionMs),
      db.select().from(cutStudioReviewDecisions).where(eq(cutStudioReviewDecisions.versionId, review.version.id)).orderBy(cutStudioReviewDecisions.createdAt),
      review.version.artifactAssetId ? db.select().from(assets).where(eq(assets.id, review.version.artifactAssetId)).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
    ]);
    let media: { url: string; expiresAt?: string } | null = null;
    if (artifact?.visibility === "private" && artifact.status === "ready") {
      media = await createPrivateAssetReadUrl(artifact.storageKey).catch(() => ({ url: `/api/cut/reviews/${encodeURIComponent(req.params.token)}/media` }));
    }
    res.json({
      project: { name: review.project.name, duration: cutDuration(review.version.edl), mediaKind: review.project.mediaKind },
      version: { id: review.version.id, label: review.version.label, revision: review.version.revision, reviewStatus: review.version.reviewStatus, createdAt: review.version.createdAt },
      review: { label: review.link.label, expiresAt: review.link.expiresAt },
      media,
      comments,
      decisions,
    });
  });
  cut.get("/api/cut/reviews/:token/media", async (req, res) => {
    noStore(res);
    const review = await activeReview(req.params.token);
    if (!review?.version.artifactAssetId) return res.status(404).json({ message: "Review media not found" });
    const [artifact] = await db.select().from(assets).where(and(eq(assets.id, review.version.artifactAssetId), eq(assets.visibility, "private"), eq(assets.status, "ready"))).limit(1);
    if (!artifact) return res.status(404).json({ message: "Review media not found" });
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-review-"));
    const outputPath = path.join(temp, artifact.originalFilename?.replace(/[^A-Za-z0-9._-]/g, "-") || "review.mp4");
    try {
      await materializePrivateAsset(artifact.storageKey, outputPath);
      res.type(artifact.mimeType ?? "application/octet-stream");
      res.sendFile(outputPath, (error) => {
        void fs.rm(temp, { recursive: true, force: true });
        if (error && !res.headersSent) res.status(500).end();
      });
    } catch (error) {
      await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  });
  cut.post("/api/cut/reviews/:token/comments", async (req, res) => {
    noStore(res);
    const parsed = reviewCommentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A reviewer name, timecode, and note are required" });
    const review = await activeReview(req.params.token);
    if (!review) return res.status(404).json({ message: "This review link is unavailable or expired" });
    if (parsed.data.positionMs > Math.ceil(cutDuration(review.version.edl) * 1_000) + 1_000) return res.status(400).json({ message: "The timecode is outside this version" });
    const [comment] = await db.insert(cutStudioReviewComments).values({ reviewLinkId: review.link.id, versionId: review.version.id, ...parsed.data }).returning();
    res.status(201).json(comment);
  });
  cut.post("/api/cut/reviews/:token/decision", async (req, res) => {
    noStore(res);
    const parsed = reviewDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose approve or request changes and provide your name" });
    const review = await activeReview(req.params.token);
    if (!review) return res.status(404).json({ message: "This review link is unavailable or expired" });
    const [decision] = await db.insert(cutStudioReviewDecisions).values({ reviewLinkId: review.link.id, versionId: review.version.id, ...parsed.data }).returning();
    await db.update(cutStudioVersions).set({ reviewStatus: parsed.data.decision, approvedAt: parsed.data.decision === "approved" ? new Date() : null }).where(eq(cutStudioVersions.id, review.version.id));
    res.status(201).json(decision);
  });
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
    await db.insert(cutStudioProjectMedia).values({ projectId: project.id, assetId: source.id, ownerUserId: req.dbUser!.id, name: source.originalFilename ?? project.name, mediaKind: parsed.data.mediaKind, duration: parsed.data.duration });
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.project.created", actorUserId: req.dbUser!.id, payload: { businessId: business.id, sourceAssetId: project.sourceAssetId, mediaKind: project.mediaKind, duration: project.duration }, idempotencyKey: `cutstudio:${project.id}:project.created` });
    res.status(201).json(project);
  });
  cut.get("/api/cut/projects/:id", attachUser, async (req, res) => {
    noStore(res); const id = idSchema.safeParse(req.params.id); if (!id.success) return res.status(404).json({ message: "Project not found" });
    const project = await ownedProject(req.dbUser!.id, id.data); if (!project) return res.status(404).json({ message: "Project not found" });
    const [jobs, media, luts] = await Promise.all([
      db.select().from(cutStudioJobs).where(eq(cutStudioJobs.projectId, project.id)).orderBy(desc(cutStudioJobs.createdAt)).limit(20),
      projectMedia(project.id, req.dbUser!.id),
      projectLuts(project),
    ]);
    res.json({ ...project, jobs, media, luts });
  });
  cut.post("/api/cut/projects/:id/audio-analysis", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const source = await ownedAsset(req.dbUser!.id, project.sourceAssetId);
    if (!source || source.visibility !== "private" || source.status !== "ready") return res.status(404).json({ message: "Private project media not found" });
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-loudness-"));
    const inputPath = path.join(temp, source.originalFilename || "source-media");
    const analyzedSeconds = Math.min(project.duration, 120);
    try {
      await materializePrivateAsset(source.storageKey, inputPath);
      const media = await probeMedia(inputPath);
      if (!media.hasAudio) return res.status(409).json({ message: "This project source does not contain an audio track" });
      const output = await runProcess("ffmpeg", ["-hide_banner", "-nostats", "-i", inputPath, "-t", String(analyzedSeconds), "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], 3 * 60_000);
      const measurement = parseEbur128Summary(output);
      return res.json({ ...measurement, analyzedSeconds, standard: "EBU R128", measuredAt: new Date().toISOString() });
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
  cut.post("/api/cut/projects/:id/luts", attachUser, async (req, res) => {
    noStore(res);
    const parsed = projectLutSchema.safeParse(req.body);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!parsed.success || !project) return res.status(404).json({ message: "Project or LUT not found" });
    const asset = await ownedAsset(req.dbUser!.id, parsed.data.assetId);
    if (!asset || asset.kind !== "cut-lut" || asset.visibility !== "private" || asset.status !== "ready" || (asset.businessId && asset.businessId !== project.businessId)) return res.status(400).json({ message: "The private LUT asset is not ready" });
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-lut-validate-"));
    const lutPath = path.join(temp, "candidate.cube");
    try {
      await materializePrivateAsset(asset.storageKey, lutPath);
      const descriptor = parseCubeLut(await fs.readFile(lutPath, "utf8"));
      const priorMetadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {};
      const [registered] = await db.update(assets).set({ businessId: project.businessId, originalFilename: parsed.data.name.endsWith(".cube") ? parsed.data.name : `${parsed.data.name}.cube`, metadata: { ...priorMetadata, cubeLut: descriptor, validatedAt: new Date().toISOString() } }).where(and(eq(assets.id, asset.id), eq(assets.ownerUserId, req.dbUser!.id))).returning();
      await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.lut.registered", actorUserId: req.dbUser!.id, payload: { businessId: project.businessId, lutAssetId: registered.id, size: descriptor.size, entryCount: descriptor.entryCount }, idempotencyKey: `cutstudio:${project.id}:lut:${registered.id}` });
      return res.status(201).json({ id: registered.id, name: registered.originalFilename, sizeBytes: registered.sizeBytes, metadata: registered.metadata, createdAt: registered.createdAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The LUT file is invalid";
      await removeStoredAsset(asset.storageKey, "private").catch(() => undefined);
      await db.update(assets).set({ status: "rejected", metadata: { rejectionReason: message } }).where(eq(assets.id, asset.id));
      return res.status(400).json({ message });
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
  cut.get("/api/cut/projects/:id/reviews", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const versions = await db.select().from(cutStudioVersions).where(and(eq(cutStudioVersions.projectId, project.id), eq(cutStudioVersions.ownerUserId, req.dbUser!.id))).orderBy(desc(cutStudioVersions.createdAt));
    if (!versions.length) return res.json([]);
    const versionIds = versions.map((version) => version.id);
    const [links, comments, decisions] = await Promise.all([
      db.select().from(cutStudioReviewLinks).where(and(eq(cutStudioReviewLinks.projectId, project.id), eq(cutStudioReviewLinks.ownerUserId, req.dbUser!.id))).orderBy(desc(cutStudioReviewLinks.createdAt)),
      db.select().from(cutStudioReviewComments).where(inArray(cutStudioReviewComments.versionId, versionIds)).orderBy(cutStudioReviewComments.positionMs),
      db.select().from(cutStudioReviewDecisions).where(inArray(cutStudioReviewDecisions.versionId, versionIds)).orderBy(desc(cutStudioReviewDecisions.createdAt)),
    ]);
    res.json(versions.map((version) => ({
      ...version,
      links: links.filter((link) => link.versionId === version.id).map(({ tokenHash: _tokenHash, ...link }) => link),
      comments: comments.filter((comment) => comment.versionId === version.id),
      decisions: decisions.filter((decision) => decision.versionId === version.id),
    })));
  });
  cut.get("/api/cut/workspace/projects/:id", attachUser, async (req, res) => {
    noStore(res);
    const access = await workspaceProject(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Workspace project not found" });
    const [versions, notes, participants] = await Promise.all([
      db.select().from(cutStudioVersions).where(eq(cutStudioVersions.projectId, access.project.id)).orderBy(desc(cutStudioVersions.createdAt)),
      db.select().from(cutStudioWorkspaceNotes).where(eq(cutStudioWorkspaceNotes.projectId, access.project.id)).orderBy(cutStudioWorkspaceNotes.positionMs, cutStudioWorkspaceNotes.createdAt),
      cutWorkspaceParticipants(access.project),
    ]);
    const latestVersion = versions[0];
    let media: { url: string; expiresAt?: string | null } | null = null;
    if (latestVersion?.artifactAssetId) {
      const artifact = await ownedAsset(access.project.ownerUserId, latestVersion.artifactAssetId);
      if (artifact?.visibility === "private" && artifact.status === "ready") media = await privateReadDescriptor(artifact, `/api/cut/workspace/projects/${encodeURIComponent(access.project.id)}/media-file`);
    }
    const authorIds = Array.from(new Set(notes.map((note) => note.authorUserId)));
    const authors = authorIds.length ? await db.select({ id: users.id, username: users.username, displayName: users.displayName, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, authorIds)) : [];
    res.json({
      project: { id: access.project.id, name: access.project.name, duration: access.project.duration, mediaKind: access.project.mediaKind },
      access: { role: access.role, canManage: access.role === "owner" },
      version: latestVersion ? { id: latestVersion.id, label: latestVersion.label, revision: latestVersion.revision, reviewStatus: latestVersion.reviewStatus, createdAt: latestVersion.createdAt } : null,
      media,
      participants,
      notes: notes.map((note) => ({ ...note, author: authors.find((author) => author.id === note.authorUserId) ?? null })),
    });
  });
  cut.get("/api/cut/workspace/projects/:id/media-file", attachUser, async (req, res) => {
    noStore(res);
    const access = await workspaceProject(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Workspace project not found" });
    const [version] = await db.select().from(cutStudioVersions).where(eq(cutStudioVersions.projectId, access.project.id)).orderBy(desc(cutStudioVersions.createdAt)).limit(1);
    if (!version?.artifactAssetId) return res.status(404).json({ message: "Workspace media not found" });
    const artifact = await ownedAsset(access.project.ownerUserId, version.artifactAssetId);
    if (!artifact || artifact.visibility !== "private" || artifact.status !== "ready") return res.status(404).json({ message: "Workspace media not found" });
    await streamPrivateAsset(res, artifact);
  });
  cut.post("/api/cut/projects/:id/collaborators", attachUser, async (req, res) => {
    noStore(res);
    const parsed = collaboratorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A valid collaborator username and role are required" });
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const [account] = await db.select().from(users).where(eq(users.username, parsed.data.username)).limit(1);
    if (!account || account.status !== "active" || account.deletedAt) return res.status(404).json({ message: "That active CreativesOS account was not found" });
    if (account.id === project.ownerUserId) return res.status(409).json({ message: "The project owner already has workspace access" });
    const [collaborator] = await db.insert(cutStudioCollaborators).values({ projectId: project.id, userId: account.id, invitedByUserId: req.dbUser!.id, role: parsed.data.role }).onConflictDoUpdate({ target: [cutStudioCollaborators.projectId, cutStudioCollaborators.userId], set: { role: parsed.data.role, invitedByUserId: req.dbUser!.id } }).returning();
    await db.insert(notifications).values({ userId: account.id, type: "mention", message: `${req.dbUser!.displayName} invited you to collaborate on ${project.name}`, read: false, linkTo: `/cut-studio/workspace/${project.id}`, relatedUserId: req.dbUser!.id, relatedUserImage: req.dbUser!.profileImageUrl, sourceType: "cutstudio_collaborator", sourceId: collaborator.id }).onConflictDoNothing();
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.collaborator.added", actorUserId: req.dbUser!.id, payload: { collaboratorUserId: account.id, role: collaborator.role }, idempotencyKey: `cutstudio:${project.id}:collaborator:${account.id}:${collaborator.role}` });
    res.status(201).json({ id: collaborator.id, userId: account.id, username: account.username, displayName: account.displayName, profileImageUrl: account.profileImageUrl, role: collaborator.role });
  });
  cut.delete("/api/cut/projects/:id/collaborators/:userId", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    const userId = Number(req.params.userId);
    if (!project || !Number.isInteger(userId)) return res.status(404).json({ message: "Collaborator not found" });
    const [removed] = await db.delete(cutStudioCollaborators).where(and(eq(cutStudioCollaborators.projectId, project.id), eq(cutStudioCollaborators.userId, userId))).returning();
    if (!removed) return res.status(404).json({ message: "Collaborator not found" });
    res.status(204).end();
  });
  cut.post("/api/cut/workspace/projects/:id/notes", attachUser, async (req, res) => {
    noStore(res);
    const parsed = workspaceNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A valid workspace note is required" });
    const access = await workspaceProject(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Workspace project not found" });
    if (parsed.data.positionMs > Math.ceil(access.project.duration * 1_000) + 1_000) return res.status(400).json({ message: "The timecode is outside this project" });
    const [note] = await db.insert(cutStudioWorkspaceNotes).values({ projectId: access.project.id, authorUserId: req.dbUser!.id, body: parsed.data.body, positionMs: parsed.data.positionMs }).returning();
    const participants = await cutWorkspaceParticipants(access.project);
    const mentioned = new Set((parsed.data.body.match(/@[A-Za-z0-9_]+/g) ?? []).map((value) => value.slice(1).toLowerCase()));
    const recipients = participants.filter((participant) => participant.id !== req.dbUser!.id && mentioned.has(participant.username.toLowerCase()));
    if (recipients.length) await db.insert(notifications).values(recipients.map((recipient) => ({ userId: recipient.id, type: "mention", message: `${req.dbUser!.displayName} mentioned you in ${access.project.name}`, read: false, linkTo: `/cut-studio/workspace/${access.project.id}`, relatedUserId: req.dbUser!.id, relatedUserImage: req.dbUser!.profileImageUrl, sourceType: "cutstudio_workspace_note", sourceId: note.id }))).onConflictDoNothing();
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: access.project.id, eventType: "cutstudio.workspace_note.created", actorUserId: req.dbUser!.id, payload: { noteId: note.id, positionMs: note.positionMs, mentionedUserIds: recipients.map((recipient) => recipient.id) }, idempotencyKey: `cutstudio:${note.id}:workspace_note.created` });
    res.status(201).json({ ...note, author: { id: req.dbUser!.id, username: req.dbUser!.username, displayName: req.dbUser!.displayName, profileImageUrl: req.dbUser!.profileImageUrl } });
  });
  cut.get("/api/cut/projects/:id/versions/:versionId/media", attachUser, async (req, res) => {
    noStore(res);
    const [projectId, versionId] = [idSchema.safeParse(req.params.id), idSchema.safeParse(req.params.versionId)];
    if (!projectId.success || !versionId.success) return res.status(404).json({ message: "Review version not found" });
    const project = await ownedProject(req.dbUser!.id, projectId.data);
    if (!project) return res.status(404).json({ message: "Review version not found" });
    const [version] = await db.select().from(cutStudioVersions).where(and(eq(cutStudioVersions.id, versionId.data), eq(cutStudioVersions.projectId, project.id), eq(cutStudioVersions.ownerUserId, req.dbUser!.id))).limit(1);
    if (!version?.artifactAssetId) return res.status(404).json({ message: "Review media not found" });
    const artifact = await ownedAsset(req.dbUser!.id, version.artifactAssetId);
    if (!artifact || artifact.visibility !== "private" || artifact.status !== "ready") return res.status(404).json({ message: "Review media not found" });
    res.json(await privateReadDescriptor(artifact, `/api/cut/projects/${encodeURIComponent(project.id)}/versions/${encodeURIComponent(version.id)}/media-file`));
  });
  cut.get("/api/cut/projects/:id/versions/:versionId/media-file", attachUser, async (req, res) => {
    noStore(res);
    const [projectId, versionId] = [idSchema.safeParse(req.params.id), idSchema.safeParse(req.params.versionId)];
    if (!projectId.success || !versionId.success) return res.status(404).json({ message: "Review version not found" });
    const project = await ownedProject(req.dbUser!.id, projectId.data);
    if (!project) return res.status(404).json({ message: "Review version not found" });
    const [version] = await db.select().from(cutStudioVersions).where(and(eq(cutStudioVersions.id, versionId.data), eq(cutStudioVersions.projectId, project.id), eq(cutStudioVersions.ownerUserId, req.dbUser!.id))).limit(1);
    if (!version?.artifactAssetId) return res.status(404).json({ message: "Review media not found" });
    const artifact = await ownedAsset(req.dbUser!.id, version.artifactAssetId);
    if (!artifact || artifact.visibility !== "private" || artifact.status !== "ready") return res.status(404).json({ message: "Review media not found" });
    await streamPrivateAsset(res, artifact);
  });
  cut.post("/api/cut/projects/:id/reviews", attachUser, async (req, res) => {
    noStore(res);
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Review settings are invalid" });
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const jobs = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.projectId, project.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id), eq(cutStudioJobs.kind, "render"), eq(cutStudioJobs.state, "done"))).orderBy(desc(cutStudioJobs.finishedAt));
    const render = parsed.data.jobId ? jobs.find((job) => job.id === parsed.data.jobId) : jobs[0];
    if (!render?.artifactAssetId) return res.status(409).json({ message: "Complete a render before creating a review link" });
    const [artifact] = await db.select().from(assets).where(and(eq(assets.id, render.artifactAssetId), eq(assets.ownerUserId, req.dbUser!.id), eq(assets.visibility, "private"), eq(assets.status, "ready"))).limit(1);
    if (!artifact) return res.status(409).json({ message: "The private review render is unavailable" });
    const versionNumber = await db.select({ count: sql<number>`count(*)::int` }).from(cutStudioVersions).where(eq(cutStudioVersions.projectId, project.id));
    const [version] = await db.insert(cutStudioVersions).values({ projectId: project.id, ownerUserId: req.dbUser!.id, revision: project.revision, label: `Version ${(versionNumber[0]?.count ?? 0) + 1}`, edl: project.edl, transcript: project.transcript, artifactAssetId: artifact.id }).returning();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + parsed.data.expiresDays * 86_400_000);
    const [link] = await db.insert(cutStudioReviewLinks).values({ versionId: version.id, projectId: project.id, ownerUserId: req.dbUser!.id, tokenHash: reviewTokenHash(token), label: parsed.data.label, expiresAt }).returning();
    const publicBase = (process.env.PUBLIC_APP_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.review.created", actorUserId: req.dbUser!.id, payload: { businessId: project.businessId, versionId: version.id, reviewLinkId: link.id, expiresAt: expiresAt.toISOString() }, idempotencyKey: `cutstudio:${version.id}:review.created` });
    res.status(201).json({ version, link: { ...link, tokenHash: undefined }, reviewUrl: `${publicBase}/review/cut/${token}` });
  });
  cut.post("/api/cut/projects/:id/reviews/:linkId/revoke", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const [link] = await db.update(cutStudioReviewLinks).set({ status: "revoked" }).where(and(eq(cutStudioReviewLinks.id, req.params.linkId), eq(cutStudioReviewLinks.projectId, project.id), eq(cutStudioReviewLinks.ownerUserId, req.dbUser!.id))).returning();
    if (!link) return res.status(404).json({ message: "Review link not found" });
    res.json({ id: link.id, status: link.status });
  });
  cut.post("/api/cut/projects/:id/review-comments/:commentId/resolve", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const versionIds = await db.select({ id: cutStudioVersions.id }).from(cutStudioVersions).where(and(eq(cutStudioVersions.projectId, project.id), eq(cutStudioVersions.ownerUserId, req.dbUser!.id)));
    if (!versionIds.length) return res.status(404).json({ message: "Review comment not found" });
    const [comment] = await db.update(cutStudioReviewComments).set({ status: "resolved", resolvedAt: new Date() }).where(and(eq(cutStudioReviewComments.id, req.params.commentId), inArray(cutStudioReviewComments.versionId, versionIds.map((item) => item.id)))).returning();
    if (!comment) return res.status(404).json({ message: "Review comment not found" });
    res.json(comment);
  });
  cut.delete("/api/cut/projects/:id", attachUser, async (req, res) => {
    noStore(res); const id = idSchema.safeParse(req.params.id); if (!id.success) return res.status(404).json({ message: "Project not found" });
    const project = await ownedProject(req.dbUser!.id, id.data); if (!project) return res.status(404).json({ message: "Project not found" });
    await db.delete(cutStudioProjects).where(eq(cutStudioProjects.id, project.id)); res.status(204).end();
  });
  cut.get("/api/cut/projects/:id/media", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    const source = await ownedAsset(req.dbUser!.id, project.sourceAssetId); if (!source) return res.status(404).json({ message: "Source media not found" });
    res.json(await privateReadDescriptor(source, `/api/cut/projects/${encodeURIComponent(project.id)}/media-file`));
  });
  cut.get("/api/cut/projects/:id/media-file", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    const source = await ownedAsset(req.dbUser!.id, project.sourceAssetId); if (!source || source.visibility !== "private" || source.status !== "ready") return res.status(404).json({ message: "Source media not found" });
    await streamPrivateAsset(res, source);
  });
  cut.post("/api/cut/projects/:id/media-library", attachUser, async (req, res) => {
    noStore(res);
    const parsed = projectMediaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Valid private video or audio metadata is required" });
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const asset = await ownedAsset(req.dbUser!.id, parsed.data.assetId);
    if (!asset || asset.visibility !== "private" || asset.status !== "ready" || !asset.mimeType?.startsWith(`${parsed.data.mediaKind}/`)) return res.status(400).json({ message: "The private media asset is not ready" });
    const [row] = await db.insert(cutStudioProjectMedia).values({ projectId: project.id, assetId: asset.id, ownerUserId: req.dbUser!.id, name: parsed.data.name, mediaKind: parsed.data.mediaKind, duration: parsed.data.duration }).onConflictDoUpdate({ target: [cutStudioProjectMedia.projectId, cutStudioProjectMedia.assetId], set: { name: parsed.data.name, mediaKind: parsed.data.mediaKind, duration: parsed.data.duration } }).returning();
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.media.added", actorUserId: req.dbUser!.id, payload: { businessId: project.businessId, assetId: asset.id, mediaKind: parsed.data.mediaKind }, idempotencyKey: `cutstudio:${project.id}:media:${asset.id}` });
    res.status(201).json(row);
  });
  cut.get("/api/cut/projects/:id/media-library/:mediaId/waveform", attachUser, async (req, res) => {
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const [media] = await db.select().from(cutStudioProjectMedia).where(and(eq(cutStudioProjectMedia.id, req.params.mediaId), eq(cutStudioProjectMedia.projectId, project.id), eq(cutStudioProjectMedia.ownerUserId, req.dbUser!.id))).limit(1);
    if (!media) return res.status(404).json({ message: "Project media not found" });
    const asset = await ownedAsset(req.dbUser!.id, media.assetId);
    if (!asset || asset.visibility !== "private" || asset.status !== "ready") return res.status(404).json({ message: "Project media not found" });
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-waveform-"));
    const inputPath = path.join(temp, asset.originalFilename?.replace(/[^A-Za-z0-9._-]/g, "-") || "source-media");
    const outputPath = path.join(temp, "waveform.png");
    try {
      await materializePrivateAsset(asset.storageKey, inputPath);
      if (!(await probeMedia(inputPath)).hasAudio) return res.status(422).json({ message: "This media does not contain an audio stream" });
      await runProcess("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=1200x96:colors=0x34d399:scale=sqrt,format=rgba", "-frames:v", "1", outputPath], 2 * 60_000);
      const waveform = await fs.readFile(outputPath);
      res.type("image/png");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Content-Length", String(waveform.byteLength));
      res.send(waveform);
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ message: error instanceof Error ? error.message : "The waveform could not be generated" });
    } finally {
      await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined);
    }
  });
  cut.delete("/api/cut/projects/:id/media-library/:mediaId", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const [media] = await db.select().from(cutStudioProjectMedia).where(and(eq(cutStudioProjectMedia.id, req.params.mediaId), eq(cutStudioProjectMedia.projectId, project.id), eq(cutStudioProjectMedia.ownerUserId, req.dbUser!.id))).limit(1);
    if (!media) return res.status(404).json({ message: "Project media not found" });
    if (media.assetId === project.sourceAssetId) return res.status(409).json({ message: "The primary source cannot be removed" });
    if (project.edl.clips.some((clip) => clip.assetId === media.assetId)) return res.status(409).json({ message: "Remove this media from the timeline first" });
    await db.delete(cutStudioProjectMedia).where(eq(cutStudioProjectMedia.id, media.id));
    res.status(204).end();
  });
  cut.get("/api/cut/projects/:id/edl", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    res.setHeader("X-EDL-Rev", String(project.revision)); res.json(project.edl);
  });
  cut.put("/api/cut/projects/:id/edl", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    const expected = Number(req.get("if-match")?.replace(/\"/g, "")); if (!Number.isInteger(expected)) return res.status(428).json({ message: "Edit revision is required" });
    const media = await projectMedia(project.id, req.dbUser!.id);
    const allowedAssets = new Map(media.map((item) => [item.assetId, item]));
    let edl: CutEdl; try { edl = validateCutEdl(req.body, Math.max(project.duration, ...media.map((item) => item.duration))); } catch { return res.status(400).json({ message: "The edit decision list is invalid" }); }
    if (edl.clips.some((clip) => clip.assetId && !allowedAssets.has(clip.assetId))) return res.status(400).json({ message: "Every timeline clip must reference project media you own" });
    if (edl.clips.some((clip) => clip.assetId && clip.end > (allowedAssets.get(clip.assetId)?.duration ?? 0) + 0.01)) return res.status(400).json({ message: "A timeline clip exceeds its source media" });
    const [updated] = await db.update(cutStudioProjects).set({ edl, revision: sql`${cutStudioProjects.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioProjects.id, project.id), eq(cutStudioProjects.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "This edit changed elsewhere. Reload the latest version." });
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: updated.id, eventType: "cutstudio.edl.updated", actorUserId: req.dbUser!.id, payload: { businessId: updated.businessId, revision: updated.revision, clipCount: updated.edl.clips.length }, idempotencyKey: `cutstudio:${updated.id}:edl:${updated.revision}` });
    res.setHeader("X-EDL-Rev", String(updated.revision)); res.json(updated.edl);
  });
  cut.get("/api/cut/projects/:id/transcript", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" }); res.json(project.transcript);
  });
  cut.put("/api/cut/projects/:id/transcript", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const expected = Number(req.get("if-match")?.replace(/\"/g, ""));
    if (!Number.isInteger(expected)) return res.status(428).json({ message: "Transcript revision is required" });
    const parsed = cutTranscriptSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.segments.some((segment) => segment.end < segment.start || segment.end > project.duration + 1)) return res.status(400).json({ message: "The corrected transcript is invalid" });
    const [updated] = await db.update(cutStudioProjects).set({ transcript: parsed.data, revision: sql`${cutStudioProjects.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioProjects.id, project.id), eq(cutStudioProjects.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "This project changed elsewhere. Reload before saving transcript corrections." });
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: updated.id, eventType: "cutstudio.transcript.corrected", actorUserId: req.dbUser!.id, payload: { businessId: updated.businessId, revision: updated.revision, segmentCount: parsed.data.segments.length }, idempotencyKey: `cutstudio:${updated.id}:transcript:${updated.revision}` });
    res.setHeader("X-Cut-Rev", String(updated.revision));
    res.json(updated.transcript);
  });
  cut.put("/api/cut/projects/:id/story-order", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const expected = Number(req.get("if-match")?.replace(/\"/g, ""));
    if (!Number.isInteger(expected)) return res.status(428).json({ message: "Project revision is required" });
    const parsed = cutTranscriptSchema.safeParse(req.body?.transcript);
    if (!parsed.success || parsed.data.segments.some((segment) => segment.end < segment.start || segment.end > project.duration + 1)) return res.status(400).json({ message: "The story transcript is invalid" });
    const edl = applyTranscriptStoryOrder(project.edl, parsed.data);
    if (edl === project.edl) return res.status(409).json({ message: "This project needs a primary multitrack clip before story order can be applied" });
    const [updated] = await db.update(cutStudioProjects).set({ transcript: parsed.data, edl, revision: sql`${cutStudioProjects.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioProjects.id, project.id), eq(cutStudioProjects.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "This project changed elsewhere. Reload before applying story order." });
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: updated.id, eventType: "cutstudio.story.reordered", actorUserId: req.dbUser!.id, payload: { businessId: updated.businessId, revision: updated.revision, segmentCount: parsed.data.segments.length }, idempotencyKey: `cutstudio:${updated.id}:story:${updated.revision}` });
    res.setHeader("X-Cut-Rev", String(updated.revision));
    res.json({ edl: updated.edl, transcript: updated.transcript, revision: updated.revision });
  });
  cut.get("/api/cut/projects/:id/captions.srt", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!project.transcript) return res.status(409).json({ message: "Create a transcript before exporting captions" });
    const filename = `${project.name.replace(/[^a-z0-9_-]+/gi, "-") || "captions"}.srt`;
    res.type("application/x-subrip").setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.send(buildSrtCaptions(project.transcript, project.edl));
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
  cut.post("/api/cut/jobs/:id/cancel", attachUser, async (req, res) => {
    noStore(res);
    const [job] = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.id, req.params.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id))).limit(1);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.kind !== "render") return res.status(409).json({ message: "Only render jobs can be cancelled" });
    if (job.state !== "queued" && job.state !== "running") return res.status(409).json({ message: "Only an active job can be cancelled" });
    const [cancelled] = await db.update(cutStudioJobs).set({ state: "cancelled", detail: "Cancelled by user", errorCode: null, finishedAt: new Date() })
      .where(and(eq(cutStudioJobs.id, job.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id), sql`${cutStudioJobs.state} in ('queued', 'running')`)).returning();
    if (!cancelled) return res.status(409).json({ message: "The job already finished" });
    activeProcesses.get(job.id)?.kill("SIGKILL");
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: job.projectId, eventType: "cutstudio.job.cancelled", actorUserId: req.dbUser!.id, payload: { jobId: job.id, kind: job.kind }, idempotencyKey: `cutstudio:${job.id}:cancelled` });
    res.json(cancelled);
  });
  cut.post("/api/cut/jobs/:id/retry", attachUser, async (req, res) => {
    noStore(res);
    const [job] = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.id, req.params.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id))).limit(1);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.state !== "error") return res.status(409).json({ message: "Only a failed job can be retried" });
    if (!await canStartJob(req.dbUser!.id)) return res.status(429).json({ message: "Wait for an active CutStudio job to finish before retrying" });
    const [retry] = await db.insert(cutStudioJobs).values({ projectId: job.projectId, ownerUserId: req.dbUser!.id, kind: job.kind, request: job.request, detail: "Retry queued" }).returning();
    queueJob(retry.id);
    res.status(202).json(retry);
  });
  cut.get("/api/cut/jobs/:id/media", attachUser, async (req, res) => {
    noStore(res); const [job] = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.id, req.params.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id))).limit(1); if (!job?.artifactAssetId) return res.status(404).json({ message: "Render not found" });
    const artifact = await ownedAsset(req.dbUser!.id, job.artifactAssetId); if (!artifact) return res.status(404).json({ message: "Render not found" }); res.json(await privateReadDescriptor(artifact, `/api/cut/jobs/${encodeURIComponent(job.id)}/media-file`));
  });
  cut.get("/api/cut/jobs/:id/media-file", attachUser, async (req, res) => {
    noStore(res); const [job] = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.id, req.params.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id))).limit(1); if (!job?.artifactAssetId) return res.status(404).json({ message: "Render not found" });
    const artifact = await ownedAsset(req.dbUser!.id, job.artifactAssetId); if (!artifact || artifact.visibility !== "private" || artifact.status !== "ready") return res.status(404).json({ message: "Render not found" });
    await streamPrivateAsset(res, artifact);
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
