import type { Express, RequestHandler, Response } from "express";
import { cutGraphicCurveExpression } from "./cut-curve-expression";
import rateLimit from "express-rate-limit";
import { CutStillError, cutStillAdmission, cutStillRequestSchema, renderCutStill } from "./cut-still";
import { cutCompositionRenditionSize } from "@shared/cut-studio-player";
import { cutPrimaryTimeline } from "@shared/cut-primary-timeline";
import { cutFitVideoFilters, cutSourceVideoFilters, cutSourceRenditionSize } from "./cut-video-geometry";
import { cutTextRasterFilter, cutTextRasterSource } from "./cut-text-raster";
import { createCutTextRasterizer } from "./cut-text-layout-renderer";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import sharp from "sharp";
import { sanitizeCutStudioSvg } from "@shared/cut-studio-svg";
import { renderCutThreePrimitiveSvg } from "@shared/cut-studio-three";
import { validateCutStudioLottie } from "@shared/cut-studio-lottie";
import { CUT_STUDIO_RIVE_MAX_BYTES, validateCutStudioRiveBytes } from "@shared/cut-studio-rive";
import { compileCompositionToEdl, cutCompositionManifestSchema } from "@shared/cut-studio-production";
import { z } from "zod";
import { assets, cutStudioAudioTemplates, cutStudioCollaborators, cutStudioJobs, cutStudioProjectMedia, cutStudioProjects, cutStudioReviewComments, cutStudioReviewDecisions, cutStudioReviewLinks, cutStudioVersions, cutStudioWorkspaceNotes, mediaWorkerNodes, notifications, users } from "@shared/schema";
import { normalizeMediaWorkerConfiguration } from "@shared/media-workers";
import {
  buildCmx3600Edl,
  buildKineticAssCaptions,
  buildSrtCaptions,
  applyTranscriptStoryOrder,
  cutDuration,
  cutTrackEffectiveGain,
  cutClipVolumePoints,
  cutAudioRoutingTemplatePayloadSchema,
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
import { businessRoleCanAdminister, businessRoleCanManage, ensureDefaultBusiness, userBusinessRole } from "./businesses";
import { db } from "./db";
import { recordOperationalServiceEvent } from "./operations";
import { estimatedComputeCostMicros } from "@shared/operations";
import { emitProjectionEvent } from "./umh";
import { assetRightsAllowUse, queueMediaIngestJobs, recordAssetUsage, registerAssetLineage } from "./media-cloud";
import {
  createPrivateAssetReadUrl,
  materializePrivateAsset,
  persistPrivateFile,
  promotePrivateAsset,
  removeStoredAsset,
} from "./asset-storage";
import { registerCutStudioProductionRoutes } from "./cut-studio-production";
import { cutCloudDispatchLeaseMs, dispatchCutStudioCloudJob } from "./cut-cloud-client";
import { cutJobErrorDetail, cutRenderWorkspacePaths } from "./cut-render-paths";
import { createCutProcessProgressParser, cutProcessProgressArgs, cutProcessProgressDisplay, type CutProcessProgress } from "./cut-process-progress";
import { cutMaskAlpha } from "@shared/cut-mask";
import { planCutGraphicRasters } from "./cut-graphic-geometry";
import { cutGraphicOpacityFilters } from "./cut-graphic-opacity";
import { cutGraphicColorFilters } from "./cut-graphic-color";
import { cutColorMatrixControls } from "../shared/cut-color-effects";
import { cutFilterGraphArgs } from "./cut-filter-graph";
import { renderCutAnimationFrames } from "./cut-animation-renderer";
import { cutRenderDurationArgs, cutRasterInputArgs } from "./cut-render-duration";
import { captureCutRenderTimeline, resolveCutRenderTimeline } from "./cut-render-snapshot";

const createProjectSchema = z.object({
  sourceAssetId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  duration: z.number().finite().positive().max(43_200),
  mediaKind: z.enum(["video", "audio"]),
});
const promptSchema = z.object({ prompt: z.string().trim().min(1).max(2_000) });
const admitStill = cutStillAdmission();
const stillLimiter = rateLimit({ windowMs: 60_000, limit: 12, keyGenerator: (req) => String(req.dbUser!.id), standardHeaders: "draft-8", legacyHeaders: false });
const projectMediaSchema = z.object({
  assetId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  duration: z.number().finite().positive().max(43_200),
  mediaKind: z.enum(["video", "audio", "image", "font", "lottie", "rive", "code_source", "code_lockfile"]),
});

const cutStudioFontMime = /^(font\/(ttf|otf|sfnt)|application\/(font-sfnt|x-font-ttf|x-font-opentype|octet-stream))$/i;
const cutStudioLottieMime = /^(application\/(json|lottie\+json)|text\/json)$/i;
const cutStudioRiveMime = /^application\/(octet-stream|x-rive|vnd\.rive)$/i;
const cutStudioCodeSourceMime = /^(application\/(zip|x-zip-compressed)|multipart\/x-zip)$/i;
const cutStudioCodeLockfileMime = /^(application\/(json|octet-stream)|text\/(plain|yaml|x-yaml))$/i;

async function validatePrivateLottieAsset(asset: typeof assets.$inferSelect) {
  if (asset.kind !== "cut-lottie" || !asset.mimeType || !cutStudioLottieMime.test(asset.mimeType) || asset.sizeBytes === null || asset.sizeBytes > 5 * 1024 * 1024) throw new Error("The private Lottie asset is invalid");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-lottie-"));
  const file = path.join(temp, "animation.json");
  try {
    await materializePrivateAsset(asset.storageKey, file);
    const source = await fs.readFile(file, "utf8");
    if (Buffer.byteLength(source, "utf8") > 5 * 1024 * 1024) throw new Error("The Lottie document exceeds the safe limit");
    return validateCutStudioLottie(JSON.parse(source) as unknown);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

async function validatePrivateRiveAsset(asset: typeof assets.$inferSelect) {
  if (asset.kind !== "cut-rive" || !asset.mimeType || !cutStudioRiveMime.test(asset.mimeType) || asset.sizeBytes === null || asset.sizeBytes > CUT_STUDIO_RIVE_MAX_BYTES) throw new Error("The private Rive asset is invalid");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-rive-"));
  const file = path.join(temp, "animation.riv");
  try {
    await materializePrivateAsset(asset.storageKey, file);
    return validateCutStudioRiveBytes(await fs.readFile(file));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
const audioRoutingTemplateInputSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  payload: cutAudioRoutingTemplatePayloadSchema,
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

function graphicMotionExpression(graphic: NonNullable<CutEdl["graphics"]>[number], property: "x" | "y" | "scale" | "rotation" | "opacity" | "blur" | "brightness" | "saturation", multiplier: number, timeVariable = "t", offset = 0) {
  if (graphic.compositionCurves && property !== "blur") {
    if (timeVariable !== "t" && timeVariable !== "T") throw new Error("Unsupported graphic time variable");
    const exact = cutGraphicCurveExpression(graphic.compositionCurves, property, graphic.timelineStart, timeVariable, multiplier, offset);
    if (exact !== undefined) return exact;
  }
  const fallback = property === "x" ? graphic.x : property === "y" ? graphic.y : property === "rotation" ? graphic.rotation : property === "blur" ? graphic.blur : property === "brightness" ? graphic.brightness : property === "saturation" ? graphic.saturation : 1;
  const points = [{ at: 0, value: fallback }, ...(graphic.motionKeyframes ?? []).map((keyframe) => ({ at: keyframe.at, value: keyframe[property] }))]
    .sort((left, right) => left.at - right.at)
    .filter((point, index, all) => index === all.length - 1 || Math.abs(point.at - all[index + 1].at) > 0.0005);
  const output = (value: number) => Number((value * multiplier + offset).toFixed(5));
  if (points.every((point) => point.value === points[0].value)) return String(output(points[0].value));
  let expression = String(output(points.at(-1)!.value));
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const left = points[index]; const right = points[index + 1];
    const start = Number((graphic.timelineStart + left.at).toFixed(6));
    const end = Number((graphic.timelineStart + right.at).toFixed(6));
    const duration = Number((right.at - left.at).toFixed(6));
    const from = output(left.value); const delta = Number((output(right.value) - from).toFixed(5));
    const progress = `(${timeVariable}-${start})/${duration}`;
    expression = `if(lt(${timeVariable}\\,${end})\\,${from}+${delta}*(${progress})\\,${expression})`;
  }
  return expression;
}

function graphicScaleExpression(graphic: NonNullable<CutEdl["graphics"]>[number], divisor = 1, fps = 30) {
  const points = [{ at: 0, value: 1, easing: "linear" as const }, ...(graphic.motionKeyframes ?? []).map((keyframe) => ({ at: keyframe.at, value: keyframe.scale, easing: keyframe.easing ?? "linear" }))]
    .sort((left, right) => left.at - right.at)
    .filter((point, index, all) => index === all.length - 1 || Math.abs(point.at - all[index + 1].at) > 0.0005);
  const output = (value: number) => Number((value / divisor).toFixed(5));
  if (points.length === 1) return String(output(points[0].value));
  let expression = String(output(points.at(-1)!.value));
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const left = points[index]; const right = points[index + 1];
    const end = Number(right.at.toFixed(3)); const duration = Number((right.at - left.at).toFixed(3));
    const from = output(left.value); const delta = Number((output(right.value) - from).toFixed(5)); const progress = `(on/${fps}-${Number(left.at.toFixed(3))})/${duration}`;
    const eased = right.easing === "ease_in_out" ? `(${progress})*(${progress})*(3-2*(${progress}))` : progress;
    expression = `if(lt(on/${fps}\\,${end})\\,${from}+${delta}*${eased}\\,${expression})`;
  }
  return expression;
}

function projectedGraphicCorners(width: number, height: number, rotationX: number, rotationY: number, perspective: number) {
  const radiansX = rotationX * Math.PI / 180;
  const radiansY = rotationY * Math.PI / 180;
  const focalLength = perspective > 0 ? perspective : 1_000_000_000;
  const centerX = width / 2; const centerY = height / 2;
  const project = (x: number, y: number) => {
    const rotatedY = y * Math.cos(radiansX);
    const depthAfterX = y * Math.sin(radiansX);
    const rotatedX = x * Math.cos(radiansY) + depthAfterX * Math.sin(radiansY);
    const depth = -x * Math.sin(radiansY) + depthAfterX * Math.cos(radiansY);
    const divisor = Math.max(1, focalLength + depth);
    const factor = focalLength / divisor;
    return [Number((centerX + rotatedX * factor).toFixed(3)), Number((centerY + rotatedY * factor).toFixed(3))] as const;
  };
  return [project(-centerX, -centerY), project(centerX, -centerY), project(-centerX, centerY), project(centerX, centerY)] as const;
}

function geometricRevealAlpha(kind: "wipe" | "clock_wipe" | "iris", direction: "left" | "right" | "up" | "down" | "clockwise" | "counterclockwise" | null, progressInput: number) {
  const progress = Number(Math.max(0, Math.min(1, progressInput)).toFixed(5));
  if (kind === "iris") return `if(lte((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2),${progress * progress}*(W*W+H*H)/4),alpha(X,Y),0)`;
  if (kind === "clock_wipe") {
    const angle = "mod(atan2(X-W/2,H/2-Y)+2*PI,2*PI)";
    const threshold = Number((progress * Math.PI * 2).toFixed(5));
    return direction === "counterclockwise" ? `if(gte(${angle},${Number((Math.PI * 2 - threshold).toFixed(5))}),alpha(X,Y),0)` : `if(lte(${angle},${threshold}),alpha(X,Y),0)`;
  }
  if (direction === "right") return `if(gte(X,W*${Number((1 - progress).toFixed(5))}),alpha(X,Y),0)`;
  if (direction === "up") return `if(gte(Y,H*${Number((1 - progress).toFixed(5))}),alpha(X,Y),0)`;
  if (direction === "down") return `if(lt(Y,H*${progress}),alpha(X,Y),0)`;
  return `if(lt(X,W*${progress}),alpha(X,Y),0)`;
}

type RenderGraphic = NonNullable<CutEdl["graphics"]>[number];

function graphicEffect(graphic: RenderGraphic, kind: RenderGraphic["effects"][number]["kind"]) {
  return graphic.effects.find((effect) => effect.kind === kind);
}

function effectNumber(effect: ReturnType<typeof graphicEffect>, key: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(effect?.parameters[key]);
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function effectColor(effect: ReturnType<typeof graphicEffect>, key: string, fallback: string) {
  const value = effect?.parameters[key];
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

async function bakeGraphicGlowAndShadow(graphic: RenderGraphic, inputPath: string, outputPath: string, width: number, height: number) {
  const shadow = graphicEffect(graphic, "drop_shadow");
  const glow = graphicEffect(graphic, "glow");
  if (!shadow && !glow) return inputPath;
  const shadowBlur = effectNumber(shadow, "blur", 10, 0, 40);
  const shadowX = effectNumber(shadow, "x", 4, -40, 40);
  const shadowY = effectNumber(shadow, "y", 6, -40, 40);
  const shadowColor = effectColor(shadow, "color", "#000000");
  const glowBlur = effectNumber(glow, "radius", 16, 0, 60);
  const glowColor = effectColor(glow, "color", "#1d9bf0");
  const source = (await fs.readFile(inputPath)).toString("base64");
  const nodes = [
    shadow ? `<feOffset in="SourceAlpha" dx="${shadowX}" dy="${shadowY}" result="shadowOffset"/><feGaussianBlur in="shadowOffset" stdDeviation="${shadowBlur}" result="shadowBlur"/><feFlood flood-color="${shadowColor}" flood-opacity="0.8" result="shadowColor"/><feComposite in="shadowColor" in2="shadowBlur" operator="in" result="shadow"/>` : "",
    glow ? `<feGaussianBlur in="SourceAlpha" stdDeviation="${glowBlur}" result="glowBlur"/><feFlood flood-color="${glowColor}" flood-opacity="0.9" result="glowColor"/><feComposite in="glowColor" in2="glowBlur" operator="in" result="glow"/>` : "",
  ].join("");
  const merge = `${shadow ? '<feMergeNode in="shadow"/>' : ""}${glow ? '<feMergeNode in="glow"/>' : ""}<feMergeNode in="SourceGraphic"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="fx" x="0" y="0" width="100%" height="100%">${nodes}<feMerge>${merge}</feMerge></filter></defs><image width="${width}" height="${height}" href="data:image/png;base64,${source}" filter="url(#fx)"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return outputPath;
}

function clipVolumeExpression(clip: CutEdl["clips"][number], multiplier = 1) {
  const points = cutClipVolumePoints(clip);
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
const proxyRequestSchema = z.object({ mediaId: z.string().uuid() });
const running = new Set<string>();
const activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();
let cutWorkerTimer: NodeJS.Timeout | null = null;
let cutNodeHeartbeatTimer: NodeJS.Timeout | null = null;
let cutWorkerRegistered = false;
let lastCutWorkerPruneAt = 0;
let cutWorkerStopping = false;
const cutLeaseMs = Math.max(30_000, Math.min(30 * 60_000, Number(process.env.CUT_WORKER_LEASE_MS) || 5 * 60_000));
const cutKinds = ["render", "proxy", "highlights", "transcribe"] as const;

export function cutWorkerIdentity(environment: NodeJS.ProcessEnv = process.env) {
  return normalizeMediaWorkerConfiguration({
    id: environment.CUT_WORKER_ID || `${os.hostname()}:${process.pid}:cut`,
    region: environment.CUT_WORKER_REGION || environment.FLY_REGION || "local",
    capabilities: environment.CUT_WORKER_CAPABILITIES,
    maxConcurrency: environment.CUT_WORKER_CONCURRENCY,
    version: environment.RELEASE_COMMIT || environment.FLY_IMAGE_REF || null,
    allowedCapabilities: cutKinds.map((kind) => `cut_${kind}`),
  });
}

const cutWorker = cutWorkerIdentity();
function supportedKinds(identity: ReturnType<typeof cutWorkerIdentity>) {
  return identity.capabilities.map((capability) => capability.replace(/^cut_/, ""));
}
const supportedCutKinds = supportedKinds(cutWorker);

export async function claimCutStudioJob(jobId: string, identity: ReturnType<typeof cutWorkerIdentity>, leaseToken: string, now = new Date()) {
  const [claimed] = await db.update(cutStudioJobs).set({ state: "running", detail: "Starting", progress: 0.05, workerId: identity.id, workerRegion: identity.region, leaseToken, leaseExpiresAt: new Date(now.getTime() + cutLeaseMs), heartbeatAt: now, cancellationRequestedAt: null, startedAt: now })
    .where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "queued"), inArray(cutStudioJobs.kind, supportedKinds(identity)))).returning();
  return claimed;
}

async function heartbeatCutWorker(requestedStatus?: "active" | "draining" | "offline") {
  const now = new Date();
  const status = requestedStatus ?? (cutWorkerStopping ? "draining" : "active");
  await db.insert(mediaWorkerNodes).values({ ...cutWorker, status, activeJobs: Math.min(running.size, cutWorker.maxConcurrency), heartbeatAt: now, drainStartedAt: status === "draining" ? now : null, updatedAt: now }).onConflictDoUpdate({
    target: mediaWorkerNodes.id,
    set: { region: cutWorker.region, capabilities: cutWorker.capabilities, maxConcurrency: cutWorker.maxConcurrency, activeJobs: Math.min(running.size, cutWorker.maxConcurrency), version: cutWorker.version, status, heartbeatAt: now, drainStartedAt: status === "draining" ? sql`coalesce(${mediaWorkerNodes.drainStartedAt}, ${now})` : null, updatedAt: now },
  });
  cutWorkerRegistered = status !== "offline";
  if (now.getTime() - lastCutWorkerPruneAt >= 6 * 60 * 60_000) {
    lastCutWorkerPruneAt = now.getTime();
    await db.delete(mediaWorkerNodes).where(lt(mediaWorkerNodes.heartbeatAt, new Date(now.getTime() - 7 * 24 * 60 * 60_000)));
  }
}

async function updateCutJobProgress(jobId: string, leaseToken: string, progress: number, detail: string) {
  await db.update(cutStudioJobs).set({ progress, detail }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"), eq(cutStudioJobs.leaseToken, leaseToken)));
}

function reportCutEncodingProgress(jobId: string, leaseToken: string, duration: number) {
  let updatedAt = 0;
  let highWater = .35;
  let writing = false;
  return (progress: CutProcessProgress) => {
    if (!progress.complete && Date.now() - updatedAt < 5_000) return;
    updatedAt = Date.now();
    // Numeric allowlist only: no FFmpeg stderr, private paths or signed URLs.
    console.info("CutStudio encode progress", { jobId, ...progress });
    if (writing) return;
    const display = cutProcessProgressDisplay(progress, duration);
    highWater = Math.max(highWater, display.progress);
    writing = true;
    void updateCutJobProgress(jobId, leaseToken, highWater, display.detail).catch(() => {
      console.warn("CutStudio encode progress could not be persisted", { jobId });
    }).finally(() => { writing = false; });
  };
}

async function registerCutArtifact(parentAssetId: string, artifact: typeof assets.$inferSelect, relationship: "rendered_from" | "derived_from") {
  await Promise.all([
    queueMediaIngestJobs(artifact),
    registerAssetLineage({
      parentAssetId,
      childAssetId: artifact.id,
      relationship,
      createdByUserId: artifact.ownerUserId,
      metadata: { instrument: "cutstudio" },
    }),
  ]);
}

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
  if (!idSchema.safeParse(id).success) return undefined;
  const [project] = await db.select().from(cutStudioProjects)
    .where(and(eq(cutStudioProjects.id, id), eq(cutStudioProjects.ownerUserId, userId)))
    .limit(1);
  return project;
}

async function workspaceProject(userId: number, id: string) {
  if (!idSchema.safeParse(id).success) return null;
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

async function readableCutJob(userId: number, id: string) {
  if (!idSchema.safeParse(id).success) return undefined;
  const [job] = await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, id)).limit(1);
  if (!job) return undefined;
  if (job.ownerUserId === userId) return job;
  const access = await workspaceProject(userId, job.projectId);
  return access ? job : undefined;
}

async function ownedAsset(userId: number, id: string) {
  if (!idSchema.safeParse(id).success) return undefined;
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
  // FFmpeg's filter parser treats a Windows drive colon as syntax even when
  // Node passes the filter as a single process argument. Forward slashes keep
  // the path portable and escaping the colon once is the form accepted by
  // drawtext, subtitles and lut3d on Windows as well as Linux.
  const normalized = path.resolve(value).split(path.sep).join("/");
  if (!/^[A-Za-z0-9_./: ()-]+$/.test(normalized)) throw new Error("A CutStudio renderer path contains unsupported characters");
  return Array.from(normalized, (character) => character === ":" ? "\\:" : character).join("");
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

function runProcess(command: string, args: string[], timeoutMs = 30 * 60_000, jobId?: string, progress?: (progress: CutProcessProgress) => void) {
  return new Promise<string>((resolve, reject) => {
    const withProgress = command === "ffmpeg" && progress;
    const child = spawn(command, withProgress ? cutProcessProgressArgs(args) : args, { windowsHide: true });
    if (withProgress) {
      const parse = createCutProcessProgressParser(withProgress);
      child.stdout.on("data", (chunk) => parse(String(chunk)));
    } else child.stdout.resume();
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
  const streams = (JSON.parse(stdout).streams ?? []) as Array<{ codec_type?: string; width?: number; height?: number; sample_aspect_ratio?: string; side_data_list?: Array<{ rotation?: number }>; tags?: { rotate?: string } }>;
  const video = streams.find((stream) => stream.codec_type === "video");
  return { hasVideo: Boolean(video), hasAudio: streams.some((stream) => stream.codec_type === "audio"), videoGeometry: video ? { width: video.width, height: video.height, sampleAspectRatio: video.sample_aspect_ratio, rotation: video.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? Number(video.tags?.rotate ?? 0) } : null };
}

async function cutStudioFontFilter(customFontPath?: string) {
  if (customFontPath) {
    const font = await fs.open(customFontPath, "r");
    const signature = Buffer.alloc(4);
    let signatureLength = 0;
    try { signatureLength = (await font.read(signature, 0, 4, 0)).bytesRead; } finally { await font.close(); }
    const tag = signature.toString("ascii");
    const isSfnt = signatureLength === 4 && ((signature[0] === 0 && signature[1] === 1 && signature[2] === 0 && signature[3] === 0) || ["OTTO", "true", "typ1"].includes(tag));
    if (!isSfnt) throw new Error("A custom CutStudio font must be a valid TTF or OTF file");
    return `fontfile='${escapeFfmpegFilterPath(customFontPath)}':`;
  }
  const candidates = [
    process.env.CUT_STUDIO_FONT_FILE,
    process.platform === "win32" ? "C:/Windows/Fonts/arialbd.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    process.platform === "win32" ? "C:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (await fs.access(candidate).then(() => true).catch(() => false)) {
      const escaped = escapeFfmpegFilterPath(candidate);
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
    const escaped = escapeFfmpegFilterPath(assPath);
    filters.push(`[${videoLabel}]ass='${escaped}'[captioned]`);
    return "captioned";
  }
  const srtPath = path.join(temp, "captions.srt");
  await fs.writeFile(srtPath, buildSrtCaptions(transcript, edl), "utf8");
  const escaped = escapeFfmpegFilterPath(srtPath);
  const style = request.captionStyle === 2 ? "FontSize=18,PrimaryColour=&H0000FFFF,Outline=2" : request.captionStyle === 3 ? "FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3" : "FontSize=18,PrimaryColour=&H00FFFFFF,Outline=2";
  filters.push(`[${videoLabel}]subtitles='${escaped}':force_style='${style}'[captioned]`);
  return "captioned";
}

async function renderMultitrack(
  jobId: string,
  leaseToken: string,
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
  const requestedAssetIds = Array.from(new Set([source.id, ...clips.flatMap((clip) => clip.assetId ? [clip.assetId] : []), ...graphics.flatMap((graphic) => [graphic.assetId, graphic.fontAssetId, graphic.revealMaskAssetId, ...(graphic.motionKeyframes ?? []).map((keyframe) => keyframe.revealMaskAssetId), ...graphic.effects.flatMap((effect) => effect.kind === "mask" && typeof effect.parameters.maskAssetId === "string" ? [effect.parameters.maskAssetId] : [])].filter((value): value is string => Boolean(value)))]));
  const assetRows = await db.select().from(assets).where(and(eq(assets.ownerUserId, project.ownerUserId), eq(assets.visibility, "private"), eq(assets.status, "ready"), inArray(assets.id, requestedAssetIds)));
  if (assetRows.length !== requestedAssetIds.length) throw new Error("One or more multitrack sources are unavailable");
  const inputs = await Promise.all(assetRows.map(async (asset, index) => {
    const extension = path.extname(asset.originalFilename ?? "") || (asset.mimeType?.startsWith("audio/") ? ".m4a" : ".mp4");
    const inputPath = path.join(temp, `source-${index}${extension}`);
    await materializePrivateAsset(asset.storageKey, inputPath);
    const rendererResource = ["cut-font", "cut-lottie", "cut-rive", "cut-code-source", "cut-code-lockfile"].includes(asset.kind);
    return { asset, url: inputPath, media: rendererResource ? { hasVideo: false, hasAudio: false, videoGeometry: null } : await probeMedia(inputPath) };
  }));
  // Fonts and validated animation documents are renderer resources rather
  // than audiovisual demuxer inputs. Keep them addressable while excluding
  // them from the FFmpeg input list so generated-raster indexes remain stable.
  const mediaInputs = inputs.filter((input) => !["cut-font", "cut-lottie", "cut-rive", "cut-code-source", "cut-code-lockfile"].includes(input.asset.kind));
  const inputIndex = new Map(mediaInputs.map((input, index) => [input.asset.id, index]));
  const inputById = new Map(inputs.map((input) => [input.asset.id, input]));
  const settings = new Map(trackSettings.map((track) => [track.track, track]));
  const audioTracks = Array.from(new Set(clips.filter((clip) => (clip.track ?? "v1").startsWith("a")).map((clip) => clip.track ?? "a1")));
  const soloAudioTracks = new Set(audioTracks.filter((track) => settings.get(track)?.solo));
  const audioTrackEnabled = (track: string) => !settings.get(track)?.muted && (!soloAudioTracks.size || soloAudioTracks.has(track));
  const trackGain = (track: string) => cutTrackEffectiveGain(track, trackSettings, audioBuses);
  const primaryPlan = cutPrimaryTimeline({ version: 3, clips, graphics });
  const primaryClips = primaryPlan.segments.flatMap((segment) => segment.clip ? [segment.clip] : []);
  if (!primaryClips.length) throw new Error("A multitrack edit requires a primary video track");
  const primaryHasAudio = audioTrackEnabled("v1") && primaryClips.some((clip) => inputById.get(clip.assetId ?? source.id)?.media.hasAudio);
  const duckingClips = primaryHasAudio ? clips.filter((clip) => (clip.track ?? "").startsWith("a") && audioTrackEnabled(clip.track ?? "a1") && clip.duckUnderVoice && inputById.get(clip.assetId ?? "")?.media.hasAudio) : [];
  const filters: string[] = [];
  const primaryDurations: number[] = [];
  const height = request.resolution === "720p" ? 720 : request.resolution === "2160p" ? 2160 : 1080;
  const composition = request.composition && request.aspect === "source" ? cutCompositionManifestSchema.parse(request.composition.manifest) : null;
  const size = composition ? cutCompositionRenditionSize(composition.width, composition.height, request.resolution) : request.aspect === "source" ? cutSourceRenditionSize(inputById.get(source.id)?.media.videoGeometry ?? {}, height) : request.aspect === "16:9" ? [Math.round(height * 16 / 9 / 2) * 2, height] : request.aspect === "9:16" ? [Math.round(height * 9 / 16 / 2) * 2, height] : [height, height];
  const graphicPlans = planCutGraphicRasters(graphics, size[0], size[1]);
  for (let index = 0; index < primaryPlan.segments.length; index += 1) {
    const { clip, duration: outputDuration } = primaryPlan.segments[index];
    primaryDurations.push(outputDuration);
    if (!clip) {
      filters.push(`color=c=black:s=${size[0]}x${size[1]}:r=${request.fps}:d=${outputDuration},format=yuv420p,settb=AVTB[basev${index}]`);
      if (primaryHasAudio) filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${outputDuration},asetpts=PTS-STARTPTS[basea${index}]`);
      continue;
    }
    const assetId = clip.assetId ?? source.id;
    const media = inputById.get(assetId)?.media;
    const sourceIndex = inputIndex.get(assetId);
    if (!media?.hasVideo || sourceIndex === undefined) throw new Error("Primary multitrack clips must contain video");
    const speed = clip.speed ?? 1;
    const transitionFade = clip.transition === "fade_black" ? Math.min(0.35, outputDuration / 2) : 0;
    const fadeIn = Math.min(Math.max(clip.fadeIn ?? 0, index > 0 ? transitionFade : 0), outputDuration / 2);
    const fadeOut = Math.min(Math.max(clip.fadeOut ?? 0, index < primaryPlan.segments.length - 1 ? transitionFade : 0), outputDuration / 2);
    const videoFilters = [`trim=start=${clip.start}:end=${clip.end}`, `setpts=(PTS-STARTPTS)/${speed}`, ...clipColorFilters(clip, lutPaths), ...cutFitVideoFilters(size[0], size[1]), `fps=${request.fps}`, "format=yuv420p", "settb=AVTB"];
    if (fadeIn > 0) videoFilters.push(`fade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut > 0) videoFilters.push(`fade=t=out:st=${Math.max(0, outputDuration - fadeOut)}:d=${fadeOut}`);
    filters.push(`[${sourceIndex}:v]${videoFilters.join(",")}[basev${index}]`);
    if (primaryHasAudio && media.hasAudio) {
      const audioFilters = [`atrim=start=${clip.start}:end=${clip.end}`, "asetpts=PTS-STARTPTS", ...atempoFilters(speed), `volume='${clipVolumeExpression(clip, trackGain("v1"))}':eval=frame`, "aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo", "apad", `atrim=duration=${outputDuration}`];
      if (fadeIn > 0) audioFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
      if (fadeOut > 0) audioFilters.push(`afade=t=out:st=${Math.max(0, outputDuration - fadeOut)}:d=${fadeOut}`);
      filters.push(`[${sourceIndex}:a]${audioFilters.join(",")}[basea${index}]`);
    } else if (primaryHasAudio) {
      // A silent camera angle must not erase sound from all the other clips or
      // collapse their timeline offsets when the primary soundtrack is joined.
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${outputDuration},asetpts=PTS-STARTPTS[basea${index}]`);
    }
  }
  let primaryVideoLabel = "basev0";
  let primaryAudioLabel = primaryHasAudio ? "basea0" : null;
  let primaryDuration = primaryDurations[0];
  for (let index = 1; index < primaryPlan.segments.length; index += 1) {
    const dissolve = primaryPlan.segments[index].clip?.transition === "cross_dissolve";
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
  const rasterGraphicInputIndexes = new Map<string, number>();
  const rasterGraphicInputs: Array<{ path: string; animated: boolean }> = [];
  const textRasterizer = createCutTextRasterizer();
  try {
  for (const graphic of graphics) {
    const rasterPath = path.join(temp, `graphic-raster-${rasterGraphicInputs.length}.png`);
    const staticMaskEffect = graphicEffect(graphic, "mask");
    const staticMaskAssetId = typeof staticMaskEffect?.parameters.maskAssetId === "string" ? staticMaskEffect.parameters.maskAssetId : null;
    if (graphic.revealMaskAssetId && staticMaskAssetId && graphic.revealMaskAssetId !== staticMaskAssetId) {
      throw new Error("A graphic may not combine different transition and static masks");
    }
    const maskAssetId = graphic.revealMaskAssetId ?? staticMaskAssetId;
    const needsBakedEffects = Boolean(graphicEffect(graphic, "drop_shadow") || graphicEffect(graphic, "glow"));
    const baseRasterPath = maskAssetId || needsBakedEffects ? path.join(temp, `graphic-raster-base-${rasterGraphicInputs.length}.png`) : rasterPath;
    const width = Math.max(2, Math.round(graphic.width * size[0] / 2) * 2);
    const height = Math.max(2, Math.round(graphic.height * size[1] / 2) * 2);
    if (graphic.kind === "lottie" || graphic.kind === "rive") {
      if (maskAssetId || needsBakedEffects) throw new Error("Animation layers cannot use baked masks, shadows, or glows; use realtime effects instead");
      const privateAnimation = graphic.assetId ? inputById.get(graphic.assetId) : undefined;
      const expectedKind = graphic.kind === "lottie" ? "cut-lottie" : "cut-rive";
      if (!privateAnimation || privateAnimation.asset.kind !== expectedKind) throw new Error(`A composition ${graphic.kind} layer must reference ready private validated media`);
      const frames = await renderCutAnimationFrames({ kind: graphic.kind, sourcePath: privateAnimation.url, outputDirectory: path.join(temp, `graphic-animation-${rasterGraphicInputs.length}`), width, height, fps: request.fps, duration: graphic.duration });
      rasterGraphicInputIndexes.set(graphic.id, mediaInputs.length + rasterGraphicInputs.length);
      rasterGraphicInputs.push({ path: frames.pattern, animated: true });
      continue;
    } else if (graphic.kind === "image") {
      const privateImage = graphic.assetId ? inputById.get(graphic.assetId) : undefined;
      if (!privateImage?.asset.mimeType?.startsWith("image/")) throw new Error("A composition image must reference ready private image media");
      // Match CSS framing, respect EXIF orientation and preserve transparent
      // letterboxing instead of painting an opaque black box behind the image.
      await sharp(privateImage.url).rotate().resize(width, height, { fit: graphic.imageFit ?? "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(baseRasterPath);
    } else if (graphic.kind === "svg") {
      await sharp(Buffer.from(sanitizeCutStudioSvg(graphic.text)), { density: 300 }).resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(baseRasterPath);
    } else if (graphic.kind === "three") {
      await sharp(Buffer.from(renderCutThreePrimitiveSvg({ primitive: graphic.primitive, color: graphic.backgroundColor, secondaryColor: graphic.secondaryColor, edgeColor: graphic.edgeColor, wireframe: graphic.wireframe, depth: graphic.depth })), { density: 300 }).resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(baseRasterPath);
    } else if (graphic.kind === "shape" || graphic.kind === "path") {
      const element = graphic.kind === "path"
        ? `<path d="${graphic.text}" fill="${graphic.fillColor ?? "none"}" stroke="${graphic.textColor}" stroke-width="${graphic.strokeWidth}"/>`
        : `<rect width="100" height="100" rx="${graphic.borderRadius}" fill="${graphic.backgroundColor}"/>`;
      await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${element}</svg>`)).resize(width, height, { fit: "fill" }).png().toFile(baseRasterPath);
    } else {
      const privateFont = graphic.fontAssetId ? inputById.get(graphic.fontAssetId) : undefined;
      if (graphic.fontAssetId && (!privateFont || privateFont.asset.kind !== "cut-font" || !privateFont.asset.mimeType || !cutStudioFontMime.test(privateFont.asset.mimeType))) throw new Error("A composition font must reference ready private TTF or OTF media");
      if (graphic.textLayout && graphic.fontReferenceWidth) {
        if (privateFont) await cutStudioFontFilter(privateFont.url); // Validate its SFNT signature before the native font loader.
        await textRasterizer.render({ text: graphic.text, layout: graphic.textLayout, width, height, canvasWidth: size[0], referenceWidth: graphic.fontReferenceWidth, textColor: graphic.textColor, backgroundColor: graphic.backgroundColor, backgroundOpacity: graphic.backgroundOpacity, fontPath: privateFont?.url, outputPath: baseRasterPath });
      } else {
        const textPath = path.join(temp, `graphic-text-${rasterGraphicInputs.length}.txt`);
        await fs.writeFile(textPath, graphic.text.replace(/[\r\n]+/g, " "), { mode: 0o600 });
        const titleFontFilter = await cutStudioFontFilter(privateFont?.url);
        await runProcess("ffmpeg", ["-y", "-f", "lavfi", "-i", cutTextRasterSource(width, height), "-vf", cutTextRasterFilter(graphic, size[0], titleFontFilter, escapeFfmpegFilterPath(textPath)), "-frames:v", "1", baseRasterPath], 30_000, jobId);
      }
    }
    const styledRasterPath = maskAssetId ? path.join(temp, `graphic-raster-styled-${rasterGraphicInputs.length}.png`) : rasterPath;
    const styledInputPath = needsBakedEffects ? await bakeGraphicGlowAndShadow(graphic, baseRasterPath, styledRasterPath, width, height) : baseRasterPath;
    if (maskAssetId) {
      const privateMask = inputById.get(maskAssetId);
      if (!privateMask?.asset.mimeType?.startsWith("image/")) throw new Error("A custom reveal mask must reference ready private image media");
      const rgba = await sharp(privateMask.url).resize(width, height, { fit: "fill" }).toColourspace("srgb").ensureAlpha().raw().toBuffer();
      const alpha = Buffer.from(cutMaskAlpha(rgba));
      const mask = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
      await sharp(styledInputPath).composite([{ input: mask, blend: "dest-in" }]).png().toFile(rasterPath);
    }
    rasterGraphicInputIndexes.set(graphic.id, mediaInputs.length + rasterGraphicInputs.length);
    rasterGraphicInputs.push({ path: rasterPath, animated: false });
  }
  } finally { await textRasterizer.close(); }
  for (let index = 0; index < graphics.length; index += 1) {
    const graphic = graphics[index];
    const nextLabel = `graphic${index}`;
    const input = rasterGraphicInputIndexes.get(graphic.id);
    if (input === undefined) throw new Error("A raster graphic input could not be prepared");
    const plan = graphicPlans[index];
    const { width, height, minimumScale, maximumScale } = plan;
    const animatedScale = Math.abs(maximumScale - minimumScale) > .0001 || Math.abs(maximumScale - 1) > .0001;
    const maximumAnimatedWidth = plan.maximumWidth; const maximumAnimatedHeight = plan.maximumHeight;
    const { virtualWidth, virtualHeight } = plan;
    const rasterFilters = plan.has3d && animatedScale
      ? [`scale=${maximumAnimatedWidth}:${maximumAnimatedHeight}`, `pad=${virtualWidth}:${virtualHeight}:0:0:color=black@0`, "format=rgba", `zoompan=z='${graphicScaleExpression(graphic, minimumScale, request.fps)}':x=0:y=0:d=1:s=${maximumAnimatedWidth}x${maximumAnimatedHeight}:fps=${request.fps}`, `setpts=PTS+${graphic.timelineStart}/TB`]
      : ["format=rgba", `scale=${width}:${height}`, `setpts=PTS+${graphic.timelineStart}/TB`];
    const blurEffect = graphicEffect(graphic, "blur");
    if (blurEffect) rasterFilters.push(`gblur=sigma=${Number((effectNumber(blurEffect, "radius", 6, 0, 60) / 3).toFixed(3))}:steps=2:planes=15`);
    const grainEffect = graphicEffect(graphic, "grain");
    const noiseEffect = graphicEffect(graphic, "noise");
    if (grainEffect || noiseEffect) {
      const strength = Math.round(effectNumber(grainEffect ?? noiseEffect, "amount", .5, 0, 80) <= 1 ? effectNumber(grainEffect ?? noiseEffect, "amount", .5, 0, 1) * 24 : effectNumber(grainEffect ?? noiseEffect, "amount", 12, 0, 80));
      rasterFilters.push(`noise=alls=${strength}:allf=${grainEffect ? "a+p" : "t+u"}`);
    }
    const vignetteEffect = graphicEffect(graphic, "vignette");
    if (vignetteEffect) rasterFilters.push(`vignette=angle=PI/${Number((10 - effectNumber(vignetteEffect, "amount", .5, 0, 1) * 6).toFixed(3))}:eval=frame`);
    const chromaEffect = graphicEffect(graphic, "chroma_key");
    if (chromaEffect) rasterFilters.push(`chromakey=0x${effectColor(chromaEffect, "color", "#00ff00").slice(1)}:${effectNumber(chromaEffect, "similarity", effectNumber(chromaEffect, "amount", .3, .01, 1), .01, 1)}:${effectNumber(chromaEffect, "blend", .08, 0, 1)}`);
    const displacementEffect = graphicEffect(graphic, "displacement");
    if (displacementEffect) {
      const amount = effectNumber(displacementEffect, "amount", .2, 0, 1);
      rasterFilters.push(`lenscorrection=k1=${Number((amount * .35).toFixed(3))}:k2=${Number((amount * -.12).toFixed(3))}:i=bilinear:fc=black@0`);
    }
    const motionBlurEffect = graphicEffect(graphic, "motion_blur");
    if (motionBlurEffect) {
      const radius = effectNumber(motionBlurEffect, "radius", effectNumber(motionBlurEffect, "amount", 2, 0, 20), 0, 20);
      rasterFilters.push(`gblur=sigma=${Number((radius * 1.8).toFixed(3))}:sigmaV=${Number((radius * .3).toFixed(3))}:steps=2:planes=15`);
    }
    const lightLeakEffect = graphicEffect(graphic, "light_leak");
    if (lightLeakEffect) {
      const amount = effectNumber(lightLeakEffect, "amount", .5, 0, 1);
      rasterFilters.push(`colorbalance=rs=${Number((amount * .28).toFixed(3))}:gs=${Number((amount * .08).toFixed(3))}:bs=${Number((amount * -.08).toFixed(3))}:rh=${Number((amount * .18).toFixed(3))}:pl=1`);
    }
    const transformWidth = animatedScale ? maximumAnimatedWidth : width;
    const transformHeight = animatedScale ? maximumAnimatedHeight : height;
    const transform3dPoints = [{ at: 0, rotationX: graphic.rotationX, rotationY: graphic.rotationY, perspective: graphic.perspective }, ...(graphic.motionKeyframes ?? []).map((keyframe) => ({ at: keyframe.at, rotationX: keyframe.rotationX, rotationY: keyframe.rotationY, perspective: keyframe.perspective }))]
      .sort((left, right) => left.at - right.at)
      .filter((point, pointIndex, all) => pointIndex === all.length - 1 || Math.abs(point.at - all[pointIndex + 1].at) > .0005);
    const has3dTransform = transform3dPoints.some((point) => Math.abs(point.rotationX) > .0001 || Math.abs(point.rotationY) > .0001);
    if (has3dTransform) {
      for (let pointIndex = 0; pointIndex < transform3dPoints.length; pointIndex += 1) {
        const point = transform3dPoints[pointIndex];
        const [topLeft, topRight, bottomLeft, bottomRight] = projectedGraphicCorners(transformWidth, transformHeight, point.rotationX, point.rotationY, point.perspective);
        const nextPoint = transform3dPoints[pointIndex + 1];
        const intervalEnd = nextPoint ? Math.max(point.at, nextPoint.at - (1 / request.fps)) : graphic.duration;
        const timeline = transform3dPoints.length > 1
          ? `:enable='between(t,${Number((graphic.timelineStart + point.at).toFixed(3))},${Number((graphic.timelineStart + intervalEnd).toFixed(3))})'`
          : "";
        rasterFilters.push(`perspective=x0=${topLeft[0]}:y0=${topLeft[1]}:x1=${topRight[0]}:y1=${topRight[1]}:x2=${bottomLeft[0]}:y2=${bottomLeft[1]}:x3=${bottomRight[0]}:y3=${bottomRight[1]}:sense=destination:interpolation=cubic${timeline}`);
      }
    }
    const filterPoints = [{ at: 0, blur: graphic.blur }, ...(graphic.motionKeyframes ?? []).map((keyframe) => ({ at: keyframe.at, blur: keyframe.blur }))]
      .sort((left, right) => left.at - right.at)
      .filter((point, pointIndex, all) => pointIndex === all.length - 1 || Math.abs(point.at - all[pointIndex + 1].at) > .0005);
    for (let pointIndex = 0; pointIndex < filterPoints.length; pointIndex += 1) {
      const sigma = Math.min(20, filterPoints[pointIndex].blur);
      if (sigma <= .01) continue;
      const start = Number((graphic.timelineStart + filterPoints[pointIndex].at).toFixed(3));
      const end = Number((graphic.timelineStart + (filterPoints[pointIndex + 1]?.at ?? graphic.duration)).toFixed(3));
      rasterFilters.push(`gblur=sigma=${Number(sigma.toFixed(3))}:steps=2:planes=15:enable='between(t,${start},${end})'`);
    }
    const brightness = graphicMotionExpression(graphic, "brightness", 1, "T");
    const saturation = graphicMotionExpression(graphic, "saturation", 1, "T");
    rasterFilters.push(...cutGraphicColorFilters(brightness, saturation, `graphiccolor${index}`));
    // Color-only stacks follow the preview: base controls, then every authored
    // color effect in order. Other spatial/compositing effects retain their
    // separate pipeline and require their own ordering/fidelity qualification.
    for (const [effectIndex, effect] of graphic.effects.entries()) {
      if (effect.kind !== "color_matrix") continue;
      const color = cutColorMatrixControls(effect.parameters);
      rasterFilters.push(...cutGraphicColorFilters(String(color.brightness), String(color.saturation), `graphiccolor${index}effect${effectIndex}`, color.contrast));
    }
    const revealPoints = [{ at: 0, kind: graphic.revealKind, direction: graphic.revealDirection, progress: graphic.revealProgress }, ...(graphic.motionKeyframes ?? []).map((keyframe) => ({ at: keyframe.at, kind: keyframe.revealKind, direction: keyframe.revealDirection, progress: keyframe.revealProgress }))]
      .sort((left, right) => left.at - right.at)
      .filter((point, pointIndex, all) => pointIndex === all.length - 1 || Math.abs(point.at - all[pointIndex + 1].at) > .0005);
    for (let pointIndex = 0; pointIndex < revealPoints.length; pointIndex += 1) {
      const point = revealPoints[pointIndex];
      if (!point.kind || point.kind === "custom_mask" || point.progress >= .99999) continue;
      const nextPoint = revealPoints[pointIndex + 1];
      const intervalEnd = nextPoint ? Math.max(point.at, nextPoint.at - (1 / request.fps)) : graphic.duration;
      const start = Number((graphic.timelineStart + point.at).toFixed(3));
      const end = Number((graphic.timelineStart + intervalEnd).toFixed(3));
      const alpha = geometricRevealAlpha(point.kind, point.direction, point.progress);
      rasterFilters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alpha}':enable='between(t,${start},${end})'`);
    }
    const rotated = plan.rotated;
    let rasterWidth = animatedScale ? maximumAnimatedWidth : width;
    let rasterHeight = animatedScale ? maximumAnimatedHeight : height;
    const scaleExpression = graphicMotionExpression(graphic, "scale", 1);
    const rotationExpression = graphicMotionExpression(graphic, "rotation", Math.PI / 180);
    if (!plan.has3d) {
      // Reveal/effects operate on the authored layer before its CSS-like 2D
      // transform. Scale the real content, center it in a bounded fixed canvas,
      // then rotate that canvas; do not simulate scaling by cropping zoompan.
      if (animatedScale) rasterFilters.push(`scale=w='max(2\\,round(${width}*(${scaleExpression})/2)*2)':h='max(2\\,round(${height}*(${scaleExpression})/2)*2)':eval=frame`);
      rasterWidth = plan.canvasWidth; rasterHeight = plan.canvasHeight;
      if (rotated || animatedScale) rasterFilters.push(`pad=${rasterWidth}:${rasterHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0:eval=frame`);
      if (rotated) rasterFilters.push(`rotate=angle='${rotationExpression}':ow=iw:oh=ih:c=none`);
    } else if (rotated) {
      const diagonal = Math.max(2, Math.ceil(Math.hypot(rasterWidth, rasterHeight) / 2) * 2);
      rasterFilters.push(`pad=${diagonal}:${diagonal}:(ow-iw)/2:(oh-ih)/2:color=black@0`, `rotate=angle='${graphicMotionExpression(graphic, "rotation", Math.PI / 180)}':ow=iw:oh=ih:c=none`);
      rasterWidth = diagonal; rasterHeight = diagonal;
    }
    const anchorX = graphic.anchorX ?? .5; const anchorY = graphic.anchorY ?? .5;
    const pivotX = Number(((anchorX - .5) * width).toFixed(5)); const pivotY = Number(((anchorY - .5) * height).toFixed(5));
    const pivotShiftX = pivotX || pivotY ? `-(${scaleExpression})*(${pivotX}*cos(${rotationExpression})-${pivotY}*sin(${rotationExpression}))` : "";
    const pivotShiftY = pivotX || pivotY ? `-(${scaleExpression})*(${pivotX}*sin(${rotationExpression})+${pivotY}*cos(${rotationExpression}))` : "";
    const x = `(${graphicMotionExpression(graphic, "x", size[0])})+${Number((anchorX * width - rasterWidth / 2).toFixed(5))}${pivotShiftX}`;
    const y = `(${graphicMotionExpression(graphic, "y", size[1])})+${Number((anchorY * height - rasterHeight / 2).toFixed(5))}${pivotShiftY}`;
    const opacity = graphicMotionExpression(graphic, "opacity", 1, "T");
    filters.push(`[${input}:v]${rasterFilters.join(",")}[preparedgraphic${index}]`);
    filters.push(...cutGraphicOpacityFilters(`preparedgraphic${index}`, `rastergraphic${index}`, opacity));
    filters.push(`[${videoLabel}][rastergraphic${index}]overlay=x='${x}':y='${y}':eval=frame:eof_action=repeat:shortest=0:enable='between(t,${graphic.timelineStart},${graphic.timelineStart + graphic.duration})'[${nextLabel}]`);
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
  // Authored curves can exceed OS argument-length limits. This is generated
  // filter data in the job's private temporary directory, not executable input.
  const filterGraphArgs = await cutFilterGraphArgs(temp, filters);
  const args = ["-y", ...mediaInputs.flatMap((input) => ["-i", input.url]), ...rasterGraphicInputs.flatMap((input) => cutRasterInputArgs(input, request.fps, primaryDuration)), ...filterGraphArgs, "-map", `[${videoLabel}]`, "-c:v", "libx264", "-preset", encoding.preset, "-crf", encoding.crf, ...(audioLabel ? ["-map", `[${audioLabel}]`, "-c:a", "aac", "-b:a", encoding.audio] : []), "-movflags", "+faststart", ...cutRenderDurationArgs(primaryDuration), "-shortest", outputPath];
  await updateCutJobProgress(jobId, leaseToken, 0.35, "Rendering multitrack edit");
  await runProcess("ffmpeg", args, 30 * 60_000, jobId, reportCutEncodingProgress(jobId, leaseToken, primaryDuration));
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

function projectForCutRender(baseProject: typeof cutStudioProjects.$inferSelect, request: z.infer<typeof cutRenderRequestSchema>) {
  const compositionManifest = request.composition ? cutCompositionManifestSchema.parse(request.composition.manifest) : null;
  return compositionManifest ? {
    ...baseProject,
    name: request.composition!.name,
    duration: compositionManifest.durationInFrames / compositionManifest.fps,
    transcript: null,
    edl: validateCutEdl(
      compileCompositionToEdl(compositionManifest, { version: 3, clips: [] }),
      compositionManifest.durationInFrames / compositionManifest.fps,
    ),
  } : request.timeline ? resolveCutRenderTimeline(baseProject, request.timeline) : baseProject;
}

async function renderJob(jobId: string, leaseToken: string, baseProject: typeof cutStudioProjects.$inferSelect, source: typeof assets.$inferSelect, request: z.infer<typeof cutRenderRequestSchema>) {
  const compositionManifest = request.composition ? cutCompositionManifestSchema.parse(request.composition.manifest) : null;
  const project = projectForCutRender(baseProject, request);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-cut-"));
  const { outputName, outputPath, sourcePath } = cutRenderWorkspacePaths(temp, project.name, source.originalFilename);
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
    if (project.edl.version === 3 && project.mediaKind === "video" && (cutPrimaryTimeline({ ...project.edl, clips }).requiresTimeline || clips.some((clip) => (clip.track ?? "v1") !== "v1" || clip.transition === "cross_dissolve" || (clip.assetId && clip.assetId !== source.id)) || (project.edl.graphics?.length ?? 0) > 0)) {
      if (project.mediaKind !== "video") throw new Error("Multitrack rendering currently requires a primary video project");
      await renderMultitrack(jobId, leaseToken, project, source, request, clips, project.edl.graphics ?? [], project.edl.tracks ?? [], project.edl.audioBuses ?? [], lutPaths, temp, outputPath);
      const duration = cutDuration({ version: 3, clips, graphics: project.edl.graphics, tracks: project.edl.tracks, audioBuses: project.edl.audioBuses });
      const stored = await persistPrivateFile({ sourcePath: outputPath, ownerUserId: project.ownerUserId, kind: "cut-render", filename: outputName, mimeType: "video/mp4" });
      const compositionMetadata = request.composition ? { cutStudioCompositionId: request.composition.id, cutStudioCompositionRevision: request.composition.revision, cutStudioRenderBatchId: request.composition.renderBatchId, cutStudioVariantIndex: request.composition.variantIndex } : {};
      const [artifact] = await db.insert(assets).values({ ownerUserId: project.ownerUserId, businessId: project.businessId, kind: "video", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", storageKey: stored.storageKey, publicUrl: null, mimeType: "video/mp4", sizeBytes: stored.sizeBytes, visibility: "private", status: "ready", originalFilename: outputName, metadata: { cutStudioProjectId: project.id, cutStudioJobId: jobId, multitrack: true, ...compositionMetadata } }).returning();
      await registerCutArtifact(source.id, artifact, "rendered_from");
      return { artifact, output: { filename: outputName, duration, aspect: request.aspect, quality: request.quality, resolution: request.resolution, fps: request.fps, audioPreset: request.audioPreset, masterGainDb: request.masterGainDb, multitrack: true, ...(request.composition ? { compositionId: request.composition.id, compositionRevision: request.composition.revision, renderBatchId: request.composition.renderBatchId, variantIndex: request.composition.variantIndex } : {}) } };
    }
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
        const primaryTrack = project.edl.tracks?.find((track) => track.track === "v1");
        const gain = primaryTrack?.muted ? 0 : cutTrackEffectiveGain("v1", project.edl.tracks ?? [], project.edl.audioBuses ?? []);
        audioFilters.push(`volume='${clipVolumeExpression(clip, gain)}':eval=frame`);
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
      if (request.aspect === "source" && compositionManifest) {
        const size = cutCompositionRenditionSize(compositionManifest.width, compositionManifest.height, request.resolution);
        filters.push(`[${videoLabel}]${cutFitVideoFilters(size[0], size[1]).join(",")},fps=${request.fps}[framed]`);
      } else if (request.aspect === "source") {
        filters.push(`[${videoLabel}]${cutSourceVideoFilters(height).join(",")},fps=${request.fps}[framed]`);
      } else {
        const size = request.aspect === "9:16" ? [Math.round(height * 9 / 16 / 2) * 2, height] : request.aspect === "1:1" ? [height, height] : [Math.round(height * 16 / 9 / 2) * 2, height];
        filters.push(`[${videoLabel}]${cutFitVideoFilters(size[0], size[1]).join(",")},fps=${request.fps}[framed]`);
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
    await updateCutJobProgress(jobId, leaseToken, 0.35, "Rendering edit");
    await runProcess("ffmpeg", args, 30 * 60_000, jobId, reportCutEncodingProgress(jobId, leaseToken, duration));
    const stored = await persistPrivateFile({ sourcePath: outputPath, ownerUserId: project.ownerUserId, kind: "cut-render", filename: outputName, mimeType: "video/mp4" });
    const compositionMetadata = request.composition ? { cutStudioCompositionId: request.composition.id, cutStudioCompositionRevision: request.composition.revision, cutStudioRenderBatchId: request.composition.renderBatchId, cutStudioVariantIndex: request.composition.variantIndex } : {};
    const [artifact] = await db.insert(assets).values({ ownerUserId: project.ownerUserId, businessId: project.businessId, kind: "video", storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local", storageKey: stored.storageKey, publicUrl: null, mimeType: "video/mp4", sizeBytes: stored.sizeBytes, visibility: "private", status: "ready", originalFilename: outputName, metadata: { cutStudioProjectId: project.id, cutStudioJobId: jobId, ...compositionMetadata } }).returning();
    await registerCutArtifact(source.id, artifact, "rendered_from");
    return { artifact, output: { filename: outputName, duration, aspect: request.aspect, quality: request.quality, resolution: request.resolution, fps: request.fps, audioPreset: request.audioPreset, masterGainDb: request.masterGainDb, ...(request.composition ? { compositionId: request.composition.id, compositionRevision: request.composition.revision, renderBatchId: request.composition.renderBatchId, variantIndex: request.composition.variantIndex } : {}) } };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

async function createProxyJob(jobId: string, leaseToken: string, project: typeof cutStudioProjects.$inferSelect, requestInput: unknown) {
  const request = proxyRequestSchema.parse(requestInput);
  const [media] = await db.select().from(cutStudioProjectMedia).where(and(
    eq(cutStudioProjectMedia.id, request.mediaId),
    eq(cutStudioProjectMedia.projectId, project.id),
    eq(cutStudioProjectMedia.ownerUserId, project.ownerUserId),
  )).limit(1);
  if (!media || media.mediaKind !== "video") throw Object.assign(new Error("Only project video can create an editing proxy"), { code: "proxy_source_required" });
  const original = await ownedAsset(project.ownerUserId, media.assetId);
  if (!original || original.visibility !== "private" || original.status !== "ready") throw new Error("The original private media is unavailable");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-proxy-"));
  const inputPath = path.join(temp, original.originalFilename?.replace(/[^A-Za-z0-9._-]/g, "-") || "original-media");
  const outputName = `${path.parse(original.originalFilename ?? media.name).name.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80) || "media"}-proxy.mp4`;
  const outputPath = path.join(temp, outputName);
  try {
    await materializePrivateAsset(original.storageKey, inputPath);
    const probed = await probeMedia(inputPath);
    if (!probed.hasVideo) throw Object.assign(new Error("The selected media does not contain video"), { code: "proxy_source_required" });
    await updateCutJobProgress(jobId, leaseToken, 0.25, "Creating lightweight editing media");
    await runProcess("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vf", "scale=w='min(1280,iw)':h=-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", ...(probed.hasAudio ? ["-c:a", "aac", "-b:a", "96k"] : ["-an"]), "-movflags", "+faststart", outputPath], 20 * 60_000, jobId);
    const stored = await persistPrivateFile({ sourcePath: outputPath, ownerUserId: project.ownerUserId, kind: "cut-proxy", filename: outputName, mimeType: "video/mp4" });
    const [artifact] = await db.insert(assets).values({
      ownerUserId: project.ownerUserId,
      businessId: project.businessId,
      kind: "video",
      storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local",
      storageKey: stored.storageKey,
      publicUrl: null,
      mimeType: "video/mp4",
      sizeBytes: stored.sizeBytes,
      visibility: "private",
      status: "ready",
      originalFilename: outputName,
      metadata: { cutStudioProjectId: project.id, cutStudioJobId: jobId, proxyForAssetId: original.id, projectMediaId: media.id, maxWidth: 1280 },
    }).returning();
    await registerCutArtifact(original.id, artifact, "derived_from");
    return { artifact, output: { filename: outputName, mediaId: media.id, originalAssetId: original.id, maxWidth: 1280, codec: "h264", container: "mp4" } };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

export async function processCutStudioJob(jobId: string) {
  if (running.has(jobId)) return;
  running.add(jobId);
  const leaseToken = randomUUID();
  let leaseHeartbeat: NodeJS.Timeout | null = null;
  const processingStartedAt = Date.now();
  let processingBusinessId: string | null = null;
  let processingOutcome: boolean | null = null;
  try {
    const now = new Date();
    const claimed = await claimCutStudioJob(jobId, cutWorker, leaseToken, now);
    if (!claimed) return;
    await heartbeatCutWorker();
    leaseHeartbeat = setInterval(() => {
      const heartbeatAt = new Date();
      void db.update(cutStudioJobs).set({ heartbeatAt, leaseExpiresAt: new Date(heartbeatAt.getTime() + cutLeaseMs) }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"), eq(cutStudioJobs.leaseToken, leaseToken))).returning({ id: cutStudioJobs.id }).then((rows) => {
        if (!rows.length) activeProcesses.get(jobId)?.kill("SIGKILL");
      }).catch((error) => console.error("CutStudio worker lease heartbeat failed", { jobId, errorType: error instanceof Error ? error.name : typeof error }));
    }, Math.max(10_000, Math.floor(cutLeaseMs / 3)));
    leaseHeartbeat.unref();
    const project = await ownedProject(claimed.ownerUserId, claimed.projectId);
    if (!project) throw new Error("CutStudio project no longer exists");
    processingBusinessId = project.businessId;
    const source = await ownedAsset(claimed.ownerUserId, project.sourceAssetId);
    if (!source) throw new Error("Source media no longer exists");
    if (claimed.kind === "transcribe") {
      if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error("Transcription provider is not configured"), { code: "provider_required" });
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-transcript-"));
      const inputPath = path.join(temp, source.originalFilename || "source.mp4");
      try {
        await materializePrivateAsset(source.storageKey, inputPath);
        await updateCutJobProgress(jobId, leaseToken, 0.3, "Transcribing media");
        const result = await transcribeMedia(inputPath, temp, jobId);
        const words = (result.words ?? []).map((word: any) => ({ word: String(word.word ?? "").trim(), start: Number(word.start ?? 0), end: Number(word.end ?? word.start ?? 0) })).filter((word: any) => word.word);
        const segments = (result.segments ?? []).map((segment: any, index: number) => ({ id: String(segment.id ?? index), start: Number(segment.start ?? 0), end: Number(segment.end ?? 0), text: String(segment.text ?? "").trim(), words: words.filter((word: any) => word.start >= Number(segment.start ?? 0) && word.end <= Number(segment.end ?? project.duration) + 0.1) }));
        const transcript: CutTranscript = { duration: Number(result.duration ?? project.duration), language: String(result.language ?? "en"), segments: segments.length ? segments : [{ id: "0", start: 0, end: project.duration, text: String(result.text ?? ""), words }] };
        const completed = await db.transaction(async (transaction) => {
          const [row] = await transaction.update(cutStudioJobs).set({ state: "done", detail: "Transcript ready", progress: 1, output: { wordCount: words.length }, leaseExpiresAt: null, finishedAt: new Date() }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"), eq(cutStudioJobs.leaseToken, leaseToken))).returning({ id: cutStudioJobs.id });
          if (!row) return false;
          await transaction.update(cutStudioProjects).set({ transcript, updatedAt: new Date() }).where(eq(cutStudioProjects.id, project.id));
          return true;
        });
        if (!completed) return;
        processingOutcome = true;
        await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.transcript.ready", actorUserId: project.ownerUserId, payload: { businessId: project.businessId, jobId, wordCount: words.length }, idempotencyKey: `cutstudio:${jobId}:transcript.ready` });
      } finally { await fs.rm(temp, { recursive: true, force: true }); }
    } else if (claimed.kind === "highlights") {
      if (!project.transcript) throw Object.assign(new Error("Transcribe the media before extracting highlights"), { code: "transcript_required" });
      const candidates = highlightCandidates(project.transcript);
      const [completed] = await db.update(cutStudioJobs).set({ state: "done", detail: `${candidates.length} highlights found`, progress: 1, output: { candidates }, leaseExpiresAt: null, finishedAt: new Date() }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"), eq(cutStudioJobs.leaseToken, leaseToken))).returning({ id: cutStudioJobs.id });
      if (!completed) return;
      processingOutcome = true;
    } else if (claimed.kind === "render") {
      const request = cutRenderRequestSchema.parse(claimed.request);
      const result = await renderJob(jobId, leaseToken, project, source, request);
      Object.assign(result.output, request.timeline ? { timelineRevision: request.timeline.revision, timelineSha256: request.timeline.sha256, timelineSnapshot: "captured" } : { timelineSnapshot: request.composition ? "composition" : "legacy_live" });
      const [completed] = await db.update(cutStudioJobs).set({ state: "done", detail: "Render ready", progress: 1, artifactAssetId: result.artifact.id, output: result.output, leaseExpiresAt: null, finishedAt: new Date() })
        .where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"), eq(cutStudioJobs.leaseToken, leaseToken))).returning();
      if (!completed) {
        await removeStoredAsset(result.artifact.storageKey, "private").catch(() => undefined);
        await db.delete(assets).where(eq(assets.id, result.artifact.id)).catch(() => undefined);
        return;
      }
      processingOutcome = true;
      await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.render.ready", actorUserId: project.ownerUserId, payload: { businessId: project.businessId, jobId, artifactAssetId: result.artifact.id, ...result.output }, idempotencyKey: `cutstudio:${jobId}:render.ready` });
    } else if (claimed.kind === "proxy") {
      const result = await createProxyJob(jobId, leaseToken, project, claimed.request);
      const [completed] = await db.update(cutStudioJobs).set({ state: "done", detail: "Editing proxy ready", progress: 1, artifactAssetId: result.artifact.id, output: result.output, leaseExpiresAt: null, finishedAt: new Date() })
        .where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"), eq(cutStudioJobs.leaseToken, leaseToken))).returning();
      if (!completed) {
        await removeStoredAsset(result.artifact.storageKey, "private").catch(() => undefined);
        await db.delete(assets).where(eq(assets.id, result.artifact.id)).catch(() => undefined);
        return;
      }
      processingOutcome = true;
      await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.proxy.ready", actorUserId: project.ownerUserId, payload: { businessId: project.businessId, jobId, artifactAssetId: result.artifact.id, mediaId: result.output.mediaId, originalAssetId: result.output.originalAssetId }, idempotencyKey: `cutstudio:${jobId}:proxy.ready` });
    }
  } catch (error) {
    console.error("CutStudio job failed", { jobId, errorType: error instanceof Error ? error.name : typeof error });
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "processing_failed";
    const failed = await db.update(cutStudioJobs).set({ state: "error", detail: cutJobErrorDetail(error), errorCode: code, leaseExpiresAt: null, finishedAt: new Date() }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"), eq(cutStudioJobs.leaseToken, leaseToken))).returning({ id: cutStudioJobs.id }).catch(() => []);
    if (failed.length) processingOutcome = false;
  } finally {
    if (leaseHeartbeat) clearInterval(leaseHeartbeat);
    running.delete(jobId);
    if (processingBusinessId && processingOutcome !== null) void recordOperationalServiceEvent({ businessId: processingBusinessId, service: "rendering", success: processingOutcome, durationMs: Date.now() - processingStartedAt, sourceType: "cut_studio_job", sourceId: jobId, quantity: Date.now() - processingStartedAt, unit: "compute_ms", estimatedCostMicros: estimatedComputeCostMicros(Date.now() - processingStartedAt, Number(process.env.CUT_WORKER_COST_MICROS_PER_MINUTE) || 0) }).catch(() => undefined);
    void heartbeatCutWorker().catch((error) => console.error("CutStudio worker node heartbeat failed", { errorType: error instanceof Error ? error.name : typeof error }));
  }
}

async function claimCutCloudDispatch(jobId: string) {
  const requestedAt = new Date();
  const retryBefore = new Date(requestedAt.getTime() - cutCloudDispatchLeaseMs);
  const [claimed] = await db.update(cutStudioJobs).set({ detail: "External worker requested", heartbeatAt: requestedAt }).where(and(
    eq(cutStudioJobs.id, jobId),
    eq(cutStudioJobs.state, "queued"),
    or(isNull(cutStudioJobs.heartbeatAt), lt(cutStudioJobs.heartbeatAt, retryBefore)),
  )).returning({ id: cutStudioJobs.id });
  return Boolean(claimed);
}

function queueJob(jobId: string) {
  if (process.env.CUT_STUDIO_PROCESSING_MODE !== "external") {
    setImmediate(() => void processDueCutStudioJobs());
    return;
  }
  void (async () => {
    if (!await claimCutCloudDispatch(jobId)) return;
    try {
      await dispatchCutStudioCloudJob(jobId);
    } catch (error) {
      await db.update(cutStudioJobs).set({ detail: "External dispatch retry pending", heartbeatAt: null }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "queued")));
      console.error("CutStudio cloud dispatch failed", { jobId, errorType: error instanceof Error ? error.name : typeof error });
    }
  })();
}

export async function recoverInterruptedCutStudioJobs() {
  const now = new Date();
  const legacyCutoff = new Date(now.getTime() - 35 * 60_000);
  const recovered = await db.update(cutStudioJobs).set({ state: "queued", detail: "Recovering interrupted worker lease", progress: 0, workerId: null, workerRegion: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null, startedAt: null }).where(and(eq(cutStudioJobs.state, "running"), or(and(isNotNull(cutStudioJobs.leaseExpiresAt), lt(cutStudioJobs.leaseExpiresAt, now)), and(isNull(cutStudioJobs.leaseExpiresAt), isNotNull(cutStudioJobs.startedAt), lt(cutStudioJobs.startedAt, legacyCutoff))))).returning({ id: cutStudioJobs.id });
  return recovered.length;
}

export async function processDueCutStudioJobs(limit = cutWorker.maxConcurrency) {
  const availableSlots = Math.max(0, cutWorker.maxConcurrency - running.size);
  if (!availableSlots) return 0;
  const jobs = await db.select({ id: cutStudioJobs.id }).from(cutStudioJobs).where(and(eq(cutStudioJobs.state, "queued"), inArray(cutStudioJobs.kind, supportedCutKinds))).orderBy(asc(cutStudioJobs.createdAt)).limit(Math.max(1, Math.min(availableSlots, limit)));
  await Promise.all(jobs.map((job) => processCutStudioJob(job.id)));
  return jobs.length;
}

export function scheduleCutStudioProcessing() {
  if (cutWorkerTimer) return;
  cutWorkerStopping = false;
  void heartbeatCutWorker().catch((error) => console.error("CutStudio worker registration failed", { errorType: error instanceof Error ? error.name : typeof error }));
  cutNodeHeartbeatTimer = setInterval(() => void heartbeatCutWorker().catch((error) => console.error("CutStudio worker node heartbeat failed", { errorType: error instanceof Error ? error.name : typeof error })), 15_000);
  cutNodeHeartbeatTimer.unref();
  void recoverInterruptedCutStudioJobs().then(() => processDueCutStudioJobs()).catch((error) => console.error("CutStudio worker recovery failed", { errorType: error instanceof Error ? error.name : typeof error }));
  cutWorkerTimer = setInterval(() => void processDueCutStudioJobs().catch((error) => console.error("CutStudio processing failed", { errorType: error instanceof Error ? error.name : typeof error })), 10_000);
  cutWorkerTimer.unref();
}

export async function stopCutStudioProcessing() {
  cutWorkerStopping = true;
  if (cutWorkerTimer) clearInterval(cutWorkerTimer);
  if (cutNodeHeartbeatTimer) clearInterval(cutNodeHeartbeatTimer);
  cutWorkerTimer = null;
  cutNodeHeartbeatTimer = null;
  if (!cutWorkerRegistered) return;
  if (running.size) {
    await heartbeatCutWorker("draining");
    const deadline = Date.now() + 10_000;
    while (running.size && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await heartbeatCutWorker(running.size ? "draining" : "offline");
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
  registerCutStudioProductionRoutes(cut, { queueRenderJob: queueJob });
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
  cut.get("/api/cut/audio-routing-templates", attachUser, async (req, res) => {
    noStore(res);
    const businessId = z.string().uuid().safeParse(req.query.businessId);
    if (!businessId.success) return res.status(400).json({ message: "A valid business is required" });
    const role = await userBusinessRole(req.dbUser!.id, businessId.data);
    if (!role) return res.status(404).json({ message: "Audio template library not found" });
    const templates = await db.select().from(cutStudioAudioTemplates)
      .where(eq(cutStudioAudioTemplates.businessId, businessId.data))
      .orderBy(desc(cutStudioAudioTemplates.updatedAt));
    res.json(templates.map((template) => ({ ...template, access: { canDelete: template.ownerUserId === req.dbUser!.id || businessRoleCanAdminister(role) } })));
  });
  cut.post("/api/cut/audio-routing-templates", attachUser, async (req, res) => {
    noStore(res);
    const parsed = audioRoutingTemplateInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid audio routing template" });
    const role = await userBusinessRole(req.dbUser!.id, parsed.data.businessId);
    if (!businessRoleCanManage(role)) return res.status(404).json({ message: "Audio template library not found" });
    const [template] = await db.insert(cutStudioAudioTemplates).values({
      businessId: parsed.data.businessId,
      ownerUserId: req.dbUser!.id,
      name: parsed.data.name,
      payload: parsed.data.payload,
    }).onConflictDoUpdate({
      target: [cutStudioAudioTemplates.businessId, cutStudioAudioTemplates.name],
      set: { payload: parsed.data.payload, ownerUserId: req.dbUser!.id, updatedAt: new Date() },
    }).returning();
    await emitProjectionEvent({ aggregateType: "cutstudio_audio_template", aggregateId: template.id, eventType: "cutstudio.audio_template.saved", actorUserId: req.dbUser!.id, payload: { businessId: template.businessId, name: template.name }, idempotencyKey: `cutstudio:audio-template:${template.id}:${template.updatedAt.getTime()}` });
    res.status(201).json({ ...template, access: { canDelete: true } });
  });
  cut.delete("/api/cut/audio-routing-templates/:id", attachUser, async (req, res) => {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) return res.status(400).json({ message: "Invalid audio routing template" });
    const [template] = await db.select().from(cutStudioAudioTemplates).where(eq(cutStudioAudioTemplates.id, parsedId.data)).limit(1);
    if (!template) return res.status(404).json({ message: "Audio routing template not found" });
    const role = await userBusinessRole(req.dbUser!.id, template.businessId);
    if (template.ownerUserId !== req.dbUser!.id && !businessRoleCanAdminister(role)) return res.status(404).json({ message: "Audio routing template not found" });
    await db.delete(cutStudioAudioTemplates).where(eq(cutStudioAudioTemplates.id, template.id));
    await emitProjectionEvent({ aggregateType: "cutstudio_audio_template", aggregateId: template.id, eventType: "cutstudio.audio_template.deleted", actorUserId: req.dbUser!.id, payload: { businessId: template.businessId, name: template.name }, idempotencyKey: `cutstudio:audio-template:${template.id}:deleted` });
    res.status(204).end();
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
    if (!(await assetRightsAllowUse(source.id, "editing"))) return res.status(409).json({ message: "Source rights do not permit editing" });
    if (!source.mimeType?.startsWith(`${parsed.data.mediaKind}/`)) return res.status(400).json({ message: "The source media type does not match the project" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [project] = await db.insert(cutStudioProjects).values({ ...parsed.data, ownerUserId: req.dbUser!.id, businessId: business.id, edl: { version: 2, clips: [{ id: "clip_00", start: 0, end: parsed.data.duration, label: "clip00", speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] } }).returning();
    await db.insert(cutStudioProjectMedia).values({ projectId: project.id, assetId: source.id, ownerUserId: req.dbUser!.id, name: source.originalFilename ?? project.name, mediaKind: parsed.data.mediaKind, duration: parsed.data.duration });
    await recordAssetUsage({ assetId: source.id, actorUserId: req.dbUser!.id, surfaceType: "cutstudio", surfaceId: project.id, useType: "editing" });
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
    const reviewProject = projectForCutRender(project, cutRenderRequestSchema.parse(render.request));
    const [version] = await db.insert(cutStudioVersions).values({ projectId: project.id, ownerUserId: req.dbUser!.id, revision: reviewProject.revision, label: `Version ${(versionNumber[0]?.count ?? 0) + 1}`, edl: reviewProject.edl, transcript: reviewProject.transcript, artifactAssetId: artifact.id }).returning();
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
    if (!parsed.success) return res.status(400).json({ message: "Valid private media or code-capsule metadata is required" });
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const asset = await ownedAsset(req.dbUser!.id, parsed.data.assetId);
    const kindMatches = Boolean(asset && (parsed.data.mediaKind === "font" ? asset.kind === "cut-font" && asset.mimeType && cutStudioFontMime.test(asset.mimeType) : parsed.data.mediaKind === "lottie" ? asset.kind === "cut-lottie" && asset.mimeType && cutStudioLottieMime.test(asset.mimeType) : parsed.data.mediaKind === "rive" ? asset.kind === "cut-rive" && asset.mimeType && cutStudioRiveMime.test(asset.mimeType) : parsed.data.mediaKind === "code_source" ? asset.kind === "cut-code-source" && asset.mimeType && cutStudioCodeSourceMime.test(asset.mimeType) : parsed.data.mediaKind === "code_lockfile" ? asset.kind === "cut-code-lockfile" && asset.mimeType && cutStudioCodeLockfileMime.test(asset.mimeType) : asset.mimeType?.startsWith(`${parsed.data.mediaKind}/`)));
    if (!asset || asset.businessId !== project.businessId || asset.visibility !== "private" || asset.status !== "ready" || !kindMatches) return res.status(400).json({ message: "The private media asset is not ready" });
    let canonicalDuration = parsed.data.duration;
    if (parsed.data.mediaKind === "lottie") {
      try { canonicalDuration = (await validatePrivateLottieAsset(asset)).durationSeconds; } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "The private Lottie asset is invalid" }); }
    }
    if (parsed.data.mediaKind === "rive") {
      try { await validatePrivateRiveAsset(asset); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "The private Rive asset is invalid" }); }
    }
    const [row] = await db.insert(cutStudioProjectMedia).values({ projectId: project.id, assetId: asset.id, ownerUserId: req.dbUser!.id, name: parsed.data.name, mediaKind: parsed.data.mediaKind, duration: canonicalDuration }).onConflictDoUpdate({ target: [cutStudioProjectMedia.projectId, cutStudioProjectMedia.assetId], set: { name: parsed.data.name, mediaKind: parsed.data.mediaKind, duration: canonicalDuration } }).returning();
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: project.id, eventType: "cutstudio.media.added", actorUserId: req.dbUser!.id, payload: { businessId: project.businessId, assetId: asset.id, mediaKind: parsed.data.mediaKind }, idempotencyKey: `cutstudio:${project.id}:media:${asset.id}` });
    res.status(201).json(row);
  });
  cut.get("/api/cut/projects/:id/media-library/:mediaId/media", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const [media] = await db.select().from(cutStudioProjectMedia).where(and(eq(cutStudioProjectMedia.id, req.params.mediaId), eq(cutStudioProjectMedia.projectId, project.id), eq(cutStudioProjectMedia.ownerUserId, req.dbUser!.id))).limit(1);
    if (!media) return res.status(404).json({ message: "Project media not found" });
    const asset = await ownedAsset(req.dbUser!.id, media.assetId);
    if (!asset || asset.visibility !== "private" || asset.status !== "ready") return res.status(404).json({ message: "Project media not found" });
    res.json(await privateReadDescriptor(asset, `/api/cut/projects/${encodeURIComponent(project.id)}/media-library/${encodeURIComponent(media.id)}/media-file`));
  });
  cut.post("/api/cut/projects/:id/media-library/:mediaId/proxy", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const [media] = await db.select().from(cutStudioProjectMedia).where(and(eq(cutStudioProjectMedia.id, req.params.mediaId), eq(cutStudioProjectMedia.projectId, project.id), eq(cutStudioProjectMedia.ownerUserId, req.dbUser!.id))).limit(1);
    if (!media) return res.status(404).json({ message: "Project media not found" });
    if (media.mediaKind !== "video") return res.status(409).json({ message: "Only video media needs an editing proxy" });
    const recent = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.projectId, project.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id), eq(cutStudioJobs.kind, "proxy"))).orderBy(desc(cutStudioJobs.createdAt)).limit(50);
    const existing = recent.find((job) => job.request?.mediaId === media.id && ["queued", "running", "done"].includes(job.state));
    if (existing) return res.status(existing.state === "done" ? 200 : 202).json(existing);
    if (!await canStartJob(req.dbUser!.id)) return res.status(429).json({ message: "Wait for an active CutStudio job to finish before creating a proxy" });
    const [job] = await db.insert(cutStudioJobs).values({ projectId: project.id, ownerUserId: req.dbUser!.id, kind: "proxy", request: { mediaId: media.id }, detail: "Editing proxy queued" }).returning();
    queueJob(job.id);
    res.status(202).json(job);
  });
  cut.get("/api/cut/projects/:id/media-library/:mediaId/media-file", attachUser, async (req, res) => {
    noStore(res);
    const project = await ownedProject(req.dbUser!.id, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const [media] = await db.select().from(cutStudioProjectMedia).where(and(eq(cutStudioProjectMedia.id, req.params.mediaId), eq(cutStudioProjectMedia.projectId, project.id), eq(cutStudioProjectMedia.ownerUserId, req.dbUser!.id))).limit(1);
    if (!media) return res.status(404).json({ message: "Project media not found" });
    const asset = await ownedAsset(req.dbUser!.id, media.assetId);
    if (!asset || asset.visibility !== "private" || asset.status !== "ready") return res.status(404).json({ message: "Project media not found" });
    await streamPrivateAsset(res, asset);
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
    if (req.body?.composition !== undefined || req.body?.timeline !== undefined) return res.status(400).json({ message: "Render snapshots are server-owned; use composition-render-batches for compositions" });
    noStore(res); const parsed = cutRenderRequestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "Render settings are invalid" });
    const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    const expectedHeader = req.get("if-match");
    const expected = expectedHeader === undefined ? undefined : Number(expectedHeader.replace(/\"/g, ""));
    if (expected !== undefined && (!Number.isInteger(expected) || expected < 1)) return res.status(400).json({ message: "The requested edit revision is invalid" });
    const admitted = await db.transaction(async (transaction) => {
      // Share the owner's batch-admission lock so ordinary exports and batches
      // cannot independently pass the same active-job cap.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`cutstudio.render-batch.owner.${project.ownerUserId}`}))`);
      const [current] = await transaction.select().from(cutStudioProjects).where(and(eq(cutStudioProjects.id, project.id), eq(cutStudioProjects.ownerUserId, req.dbUser!.id))).for("share");
      if (!current) return { status: 404, message: "Project not found" } as const;
      if (expected !== undefined && current.revision !== expected) return { status: 409, message: "The edit changed before rendering. Reload or finish saving, then try again." } as const;
      if (current.edl.version === 3 && current.mediaKind === "video") {
        try { cutPrimaryTimeline(current.edl); }
        catch (error) { return { status: 400, message: error instanceof Error ? error.message : "Invalid primary timeline" } as const; }
      }
      const [active] = await transaction.select({ count: sql<number>`count(*)::int` }).from(cutStudioJobs).where(and(eq(cutStudioJobs.ownerUserId, current.ownerUserId), sql`${cutStudioJobs.state} in ('queued', 'running')`));
      if ((active?.count ?? 0) >= 2) return { status: 429, message: "Wait for an active CutStudio job to finish before starting another" } as const;
      const requestedDuration = parsed.data.clip ? Math.max(0, parsed.data.clip.end - parsed.data.clip.start) : cutDuration(current.edl);
      if (requestedDuration > 7_200) return { status: 413, message: "A single render can be up to two hours" } as const;
      const timeline = captureCutRenderTimeline(current);
      const [job] = await transaction.insert(cutStudioJobs).values({ projectId: current.id, ownerUserId: current.ownerUserId, kind: "render", request: { ...parsed.data, timeline } }).returning();
      return { job };
    });
    if (!admitted.job) return res.status(admitted.status).json({ message: admitted.message });
    queueJob(admitted.job.id); res.status(202).json(admitted.job);
  });
  cut.get("/api/cut/jobs/:id", attachUser, async (req, res) => {
    noStore(res); const job = await readableCutJob(req.dbUser!.id, req.params.id); if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.state === "queued") queueJob(job.id);
    else if (job.state === "running" && job.leaseExpiresAt && job.leaseExpiresAt < new Date()) {
      await db.update(cutStudioJobs).set({ state: "queued", detail: "Recovering interrupted job", progress: 0, workerId: null, workerRegion: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null, startedAt: null }).where(and(eq(cutStudioJobs.id, job.id), eq(cutStudioJobs.state, "running"), lt(cutStudioJobs.leaseExpiresAt, new Date())));
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
    const cancelledAt = new Date();
    const [cancelled] = await db.update(cutStudioJobs).set({ state: "cancelled", detail: "Cancelled by user", errorCode: null, cancellationRequestedAt: cancelledAt, leaseExpiresAt: null, finishedAt: cancelledAt })
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
    noStore(res); const job = await readableCutJob(req.dbUser!.id, req.params.id); if (!job?.artifactAssetId) return res.status(404).json({ message: "Render not found" });
    const artifact = await ownedAsset(job.ownerUserId, job.artifactAssetId); if (!artifact) return res.status(404).json({ message: "Render not found" }); res.json(await privateReadDescriptor(artifact, `/api/cut/jobs/${encodeURIComponent(job.id)}/media-file`));
  });
  cut.get("/api/cut/jobs/:id/media-file", attachUser, async (req, res) => {
    noStore(res); const job = await readableCutJob(req.dbUser!.id, req.params.id); if (!job?.artifactAssetId) return res.status(404).json({ message: "Render not found" });
    const artifact = await ownedAsset(job.ownerUserId, job.artifactAssetId); if (!artifact || artifact.visibility !== "private" || artifact.status !== "ready") return res.status(404).json({ message: "Render not found" });
    await streamPrivateAsset(res, artifact);
  });
  cut.get("/api/cut/jobs/:id/still", attachUser, stillLimiter, async (req, res) => {
    noStore(res);
    const job = await readableCutJob(req.dbUser!.id, req.params.id);
    if (!job?.artifactAssetId || job.kind !== "render" || job.state !== "done") return res.status(404).json({ message: "A completed video render is required." });
    const parsed = cutStillRequestSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Choose an integral frame number and PNG, JPEG or WebP format." });
    const artifact = await ownedAsset(job.ownerUserId, job.artifactAssetId);
    const access = await workspaceProject(req.dbUser!.id, job.projectId);
    if (!artifact || !access || artifact.businessId !== access.project.businessId || artifact.visibility !== "private" || artifact.status !== "ready" || artifact.mimeType !== "video/mp4") return res.status(404).json({ message: "Private video render not found." });
    if (artifact.sizeBytes === null || artifact.sizeBytes > 250 * 1024 * 1024) return res.status(413).json({ message: "Interactive frame export supports renders up to 250 MB. Download larger renders for local extraction." });
    const release = admitStill();
    if (!release) return res.status(429).setHeader("Retry-After", "10").json({ message: "Frame export is busy. Please try again shortly." });
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.once("close", abort);
    let temp: string | undefined;
    try {
      temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-cut-still-"));
      const inputPath = path.join(temp, "source.mp4");
      const outputPath = path.join(temp, `frame.${parsed.data.format}`);
      await materializePrivateAsset(artifact.storageKey, inputPath);
      if ((await fs.stat(inputPath)).size > 250 * 1024 * 1024) throw new CutStillError(413, "The render exceeds the interactive frame-export limit.");
      const metadata = await renderCutStill(inputPath, outputPath, parsed.data.frame, controller.signal);
      // Revocation during decoding must not disclose the resulting pixels.
      const currentAsset = await ownedAsset(job.ownerUserId, artifact.id);
      if (!await readableCutJob(req.dbUser!.id, job.id) || currentAsset?.status !== "ready" || currentAsset.visibility !== "private") return res.status(404).json({ message: "Render access is no longer available." });
      const bytes = await fs.readFile(outputPath);
      res.type(`image/${parsed.data.format}`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `attachment; filename="cut-${job.id.slice(0, 8)}-frame-${parsed.data.frame}.${parsed.data.format}"`);
      res.setHeader("X-Cut-Frame", String(parsed.data.frame));
      res.setHeader("X-Cut-Frame-Count", String(metadata.frameCount));
      res.setHeader("X-Cut-Source-Asset", artifact.id);
      res.send(bytes);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) res.status(error instanceof CutStillError ? error.status : 503).json({ message: error instanceof CutStillError ? error.message : "Frame export is temporarily unavailable." });
    } finally {
      res.off("close", abort);
      if (temp) await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined);
      release();
    }
  });
  cut.post("/api/cut/jobs/:id/distribute", attachUser, async (req, res) => {
    noStore(res); const [job] = await db.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.id, req.params.id), eq(cutStudioJobs.ownerUserId, req.dbUser!.id), eq(cutStudioJobs.state, "done"))).limit(1); if (!job?.artifactAssetId) return res.status(409).json({ message: "A completed render is required" });
    const artifact = await ownedAsset(req.dbUser!.id, job.artifactAssetId); if (!artifact) return res.status(404).json({ message: "Render not found" });
    const existingId = typeof artifact.metadata?.distributionAssetId === "string" ? artifact.metadata.distributionAssetId : null; if (existingId) { const existing = await ownedAsset(req.dbUser!.id, existingId); if (existing) return res.json(existing); }
    const promoted = await promotePrivateAsset({ storageKey: artifact.storageKey, ownerUserId: req.dbUser!.id, kind: "video", filename: artifact.originalFilename ?? "cutstudio-render.mp4", mimeType: artifact.mimeType ?? "video/mp4" });
    const [publicAsset] = await db.insert(assets).values({ ownerUserId: req.dbUser!.id, businessId: artifact.businessId, kind: "video", storageProvider: "r2", storageKey: promoted.storageKey, publicUrl: promoted.publicUrl, mimeType: artifact.mimeType, sizeBytes: promoted.sizeBytes, visibility: "public", status: "ready", originalFilename: artifact.originalFilename, metadata: { cutStudioProjectId: job.projectId, cutStudioJobId: job.id, sourcePrivateAssetId: artifact.id } }).returning();
    await Promise.all([
      queueMediaIngestJobs(publicAsset),
      registerAssetLineage({ parentAssetId: artifact.id, childAssetId: publicAsset.id, relationship: "published_from", createdByUserId: req.dbUser!.id, metadata: { instrument: "cutstudio", jobId: job.id } }),
    ]);
    await db.update(assets).set({ metadata: { ...artifact.metadata, distributionAssetId: publicAsset.id } }).where(eq(assets.id, artifact.id));
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: job.projectId, eventType: "cutstudio.asset.promoted", actorUserId: req.dbUser!.id, payload: { businessId: artifact.businessId, jobId: job.id, privateAssetId: artifact.id, distributionAssetId: publicAsset.id }, idempotencyKey: `cutstudio:${job.id}:asset.promoted` });
    res.status(201).json(publicAsset);
  });
  cut.get("/api/cut/projects/:id/export.edl", attachUser, async (req, res) => {
    noStore(res); const project = await ownedProject(req.dbUser!.id, req.params.id); if (!project) return res.status(404).json({ message: "Project not found" });
    res.type("text/plain").setHeader("Content-Disposition", `attachment; filename=\"${project.name.replace(/[^a-z0-9_-]+/gi, "-") || "cut"}.edl\"`); res.send(buildCmx3600Edl(project.name, project.edl));
  });
}
