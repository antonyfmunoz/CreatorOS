import type { RequestHandler } from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import {
  assets,
  cutStudioCollaborators,
  cutStudioCompositions,
  cutStudioGenerationJobs,
  cutStudioGenerativeWorkflows,
  cutStudioJobs,
  cutStudioProjectMedia,
  cutStudioProductionElements,
  cutStudioProductionPlans,
  cutStudioProjects,
  cutStudioShots,
  cutStudioShotVariants,
} from "@shared/schema";
import {
  compileCompositionToEdl,
  cutCodeCapsuleSchema,
  cutCompositionManifestSchema,
  cutCompositionVariantBatchSchema,
  cutGenerationProviderRegistry,
  cutGenerationRequestSchema,
  cutGenerativeWorkflowSchema,
  cutProductionBriefSchema,
  cutProductionElementSpecSchema,
  cutShotSpecSchema,
  resolveCompositionParameters,
} from "@shared/cut-studio-production";
import { cutRenderSettingsSchema, validateCutEdl } from "@shared/cut-studio";
import { attachUser } from "./auth";
import { db } from "./db";
import { emitProjectionEvent } from "./umh";
import { materializePrivateAsset } from "./asset-storage";
import { validateCutCodeLockfile, validateCutCodeSourceArchive } from "./cut-code-package";

const uuid = z.string().uuid();
const compositionInput = z.object({
  name: z.string().trim().min(1).max(160),
  mode: z.enum(["declarative", "sandboxed_tsx"]).default("declarative"),
  manifest: cutCompositionManifestSchema,
  codeCapsule: cutCodeCapsuleSchema.nullable().default(null),
}).superRefine((value, context) => {
  if (value.mode === "sandboxed_tsx" && !value.codeCapsule) context.addIssue({ code: z.ZodIssueCode.custom, path: ["codeCapsule"], message: "Sandboxed compositions require a code capsule" });
  if (value.mode === "declarative" && value.codeCapsule) context.addIssue({ code: z.ZodIssueCode.custom, path: ["codeCapsule"], message: "Declarative compositions cannot include executable code" });
});
const workflowInput = z.object({ workflow: cutGenerativeWorkflowSchema });
const variantImportInput = z.object({
  assetId: z.string().uuid(),
  label: z.string().trim().min(1).max(160).default("Imported candidate"),
}).strict();
const generationLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
const compositionRenderLimiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });
const compositionRenderBatchInput = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/),
  compositionIds: z.array(z.string().uuid()).min(1).max(20),
  render: cutRenderSettingsSchema,
}).superRefine((value, context) => {
  if (new Set(value.compositionIds).size !== value.compositionIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["compositionIds"], message: "Composition identifiers must be unique" });
});

async function projectAccess(userId: number, projectId: string) {
  if (!uuid.safeParse(projectId).success) return null;
  const [project] = await db.select().from(cutStudioProjects).where(eq(cutStudioProjects.id, projectId)).limit(1);
  if (!project) return null;
  if (project.ownerUserId === userId) return { project, role: "owner" as const };
  const [collaborator] = await db.select().from(cutStudioCollaborators).where(and(eq(cutStudioCollaborators.projectId, projectId), eq(cutStudioCollaborators.userId, userId))).limit(1);
  if (!collaborator) return null;
  return { project, role: collaborator.role as "editor" | "reviewer" };
}

function mayEdit(role: "owner" | "editor" | "reviewer") {
  return role === "owner" || role === "editor";
}

function requireExpectedRevision(value: string | undefined) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision > 0 ? revision : null;
}

function defaultBrief(project: typeof cutStudioProjects.$inferSelect) {
  return cutProductionBriefSchema.parse({ version: 1, title: project.name });
}

function defaultComposition(project: typeof cutStudioProjects.$inferSelect) {
  const fps = 30 as const;
  const durationInFrames = Math.max(1, Math.round(project.duration * fps));
  return cutCompositionManifestSchema.parse({
    version: 1,
    name: `${project.name} composition`,
    width: 1920,
    height: 1080,
    fps,
    durationInFrames,
    background: "#000000",
    layers: [{ id: "source", kind: project.mediaKind, name: "Source", from: 0, durationInFrames, assetId: project.sourceAssetId }],
  });
}

async function productionPlan(project: typeof cutStudioProjects.$inferSelect, create = false) {
  const [existing] = await db.select().from(cutStudioProductionPlans).where(eq(cutStudioProductionPlans.projectId, project.id)).limit(1);
  if (existing || !create) return existing;
  const [created] = await db.insert(cutStudioProductionPlans).values({ projectId: project.id, businessId: project.businessId, ownerUserId: project.ownerUserId, brief: defaultBrief(project) }).onConflictDoNothing().returning();
  if (created) return created;
  const [concurrent] = await db.select().from(cutStudioProductionPlans).where(eq(cutStudioProductionPlans.projectId, project.id)).limit(1);
  return concurrent;
}

async function assertProjectAssets(project: typeof cutStudioProjects.$inferSelect, assetIds: string[]) {
  const uniqueIds = Array.from(new Set(assetIds));
  if (!uniqueIds.length) return;
  const rows = await db.select({ id: assets.id }).from(assets).where(and(inArray(assets.id, uniqueIds), eq(assets.ownerUserId, project.ownerUserId), eq(assets.businessId, project.businessId), eq(assets.visibility, "private"), eq(assets.status, "ready")));
  if (rows.length !== uniqueIds.length) throw new Error("Every referenced asset must be a ready private asset in this business");
}

async function assertShotReferences(project: typeof cutStudioProjects.$inferSelect, planId: string, spec: z.infer<typeof cutShotSpecSchema>) {
  const elementIds = Array.from(new Set(spec.elementIds));
  const elements = elementIds.length ? await db.select({ id: cutStudioProductionElements.id }).from(cutStudioProductionElements).where(and(eq(cutStudioProductionElements.planId, planId), inArray(cutStudioProductionElements.id, elementIds))) : [];
  if (elements.length !== elementIds.length) throw new Error("Every shot element must belong to this production");
  const assetIds = [spec.firstFrameAssetId, spec.lastFrameAssetId, spec.motionReferenceAssetId, spec.audioReferenceAssetId, ...spec.visualReferenceAssetIds].filter((value): value is string => Boolean(value));
  await assertProjectAssets(project, assetIds);
}

function manifestAssetIds(manifest: z.infer<typeof cutCompositionManifestSchema>) {
  return [
    ...manifest.layers.flatMap((layer) => layer.assetId ? [layer.assetId] : []),
    ...manifest.fonts.flatMap((font) => font.assetId ? [font.assetId] : []),
    ...manifest.audioReactiveSignals.map((signal) => signal.assetId),
    ...manifest.layers.flatMap((layer) => [layer.enter?.maskAssetId, layer.exit?.maskAssetId].filter((value): value is string => Boolean(value))),
    ...manifest.layers.flatMap((layer) => layer.effects.flatMap((effect) => effect.kind === "mask" && typeof effect.parameters.maskAssetId === "string" ? [effect.parameters.maskAssetId] : [])),
  ];
}

async function assertCompositionAssets(project: typeof cutStudioProjects.$inferSelect, manifest: z.infer<typeof cutCompositionManifestSchema>) {
  const ids = manifestAssetIds(manifest);
  await assertProjectAssets(project, ids);
  const uniqueIds = Array.from(new Set(ids));
  if (!uniqueIds.length) return;
  const rows = await db.select({ id: assets.id, kind: assets.kind, mimeType: assets.mimeType }).from(assets).where(and(inArray(assets.id, uniqueIds), eq(assets.ownerUserId, project.ownerUserId), eq(assets.businessId, project.businessId), eq(assets.visibility, "private"), eq(assets.status, "ready")));
  const byId = new Map(rows.map((asset) => [asset.id, asset]));
  const fontIds = manifest.fonts.flatMap((font) => font.assetId ? [font.assetId] : []);
  if (fontIds.some((assetId) => { const asset = byId.get(assetId); return !asset || asset.kind !== "cut-font" || !asset.mimeType || !/^(font\/(ttf|otf|sfnt)|application\/(font-sfnt|x-font-ttf|x-font-opentype|octet-stream))$/i.test(asset.mimeType); })) throw new Error("Every composition font must be ready private TTF or OTF media");
  const imageIds = manifest.layers.flatMap((layer) => layer.kind === "image" && layer.assetId ? [layer.assetId] : []);
  const lottieIds = manifest.layers.flatMap((layer) => layer.kind === "lottie" && layer.assetId ? [layer.assetId] : []);
  const riveIds = manifest.layers.flatMap((layer) => layer.kind === "rive" && layer.assetId ? [layer.assetId] : []);
  const maskIds = manifest.layers.flatMap((layer) => [layer.enter?.maskAssetId, layer.exit?.maskAssetId, ...layer.effects.flatMap((effect) => effect.kind === "mask" && typeof effect.parameters.maskAssetId === "string" ? [effect.parameters.maskAssetId] : [])].filter((value): value is string => Boolean(value)));
  if ([...imageIds, ...maskIds].some((assetId) => !byId.get(assetId)?.mimeType?.startsWith("image/"))) throw new Error("Every composition image or mask must be ready private image media");
  if (lottieIds.some((assetId) => { const asset = byId.get(assetId); return !asset || asset.kind !== "cut-lottie" || !asset.mimeType || !/^(application\/(json|lottie\+json)|text\/json)$/i.test(asset.mimeType); })) throw new Error("Every Lottie layer must reference ready private validated Lottie JSON");
  if (riveIds.some((assetId) => { const asset = byId.get(assetId); return !asset || asset.kind !== "cut-rive" || !asset.mimeType || !/^application\/(octet-stream|x-rive|vnd\.rive)$/i.test(asset.mimeType); })) throw new Error("Every Rive layer must reference ready private validated Rive media");
}

async function assertCodeCapsuleAssets(project: typeof cutStudioProjects.$inferSelect, capsule: z.infer<typeof cutCodeCapsuleSchema>) {
  const capsuleIds = [capsule.sourceAssetId, capsule.lockfileAssetId];
  const rows = await db.select({
    assetId: assets.id,
    kind: assets.kind,
    mimeType: assets.mimeType,
    filename: assets.originalFilename,
    storageKey: assets.storageKey,
    mediaKind: cutStudioProjectMedia.mediaKind,
  }).from(cutStudioProjectMedia).innerJoin(assets, eq(assets.id, cutStudioProjectMedia.assetId)).where(and(
    eq(cutStudioProjectMedia.projectId, project.id),
    inArray(cutStudioProjectMedia.assetId, capsuleIds),
    eq(assets.ownerUserId, project.ownerUserId),
    eq(assets.businessId, project.businessId),
    eq(assets.visibility, "private"),
    eq(assets.status, "ready"),
  ));
  if (rows.length !== capsuleIds.length) throw new Error("Code source and lockfile must be ready private assets attached to this project");
  const source = rows.find((row) => row.assetId === capsule.sourceAssetId);
  const lockfile = rows.find((row) => row.assetId === capsule.lockfileAssetId);
  if (!source || source.mediaKind !== "code_source" || source.kind !== "cut-code-source" || !source.mimeType || !/^(application\/(zip|x-zip-compressed)|multipart\/x-zip)$/i.test(source.mimeType) || !source.filename?.toLowerCase().endsWith(".zip")) throw new Error("The code source must be a private ZIP source capsule");
  const lockfileName = lockfile?.filename?.toLowerCase() ?? "";
  if (!lockfile || lockfile.mediaKind !== "code_lockfile" || lockfile.kind !== "cut-code-lockfile" || !lockfile.mimeType || !/^(application\/(json|octet-stream)|text\/(plain|yaml|x-yaml))$/i.test(lockfile.mimeType) || !["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"].includes(lockfileName)) throw new Error("The code capsule requires an npm, pnpm, or Yarn lockfile");
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-code-capsule-"));
  try {
    const sourcePath = path.join(temporaryDirectory, "source.zip");
    const lockfilePath = path.join(temporaryDirectory, lockfileName);
    await Promise.all([materializePrivateAsset(source.storageKey, sourcePath), materializePrivateAsset(lockfile.storageKey, lockfilePath)]);
    validateCutCodeSourceArchive(await fs.readFile(sourcePath), capsule.entrypoint);
    validateCutCodeLockfile(lockfileName, await fs.readFile(lockfilePath));
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function creativeRuntime(project: typeof cutStudioProjects.$inferSelect) {
  const [plan, compositions, workflows] = await Promise.all([
    productionPlan(project),
    db.select().from(cutStudioCompositions).where(and(eq(cutStudioCompositions.projectId, project.id), eq(cutStudioCompositions.status, "active"))).orderBy(desc(cutStudioCompositions.updatedAt)),
    db.select().from(cutStudioGenerativeWorkflows).where(and(eq(cutStudioGenerativeWorkflows.projectId, project.id), eq(cutStudioGenerativeWorkflows.status, "active"))).orderBy(desc(cutStudioGenerativeWorkflows.updatedAt)),
  ]);
  const elements = plan ? await db.select().from(cutStudioProductionElements).where(eq(cutStudioProductionElements.planId, plan.id)).orderBy(asc(cutStudioProductionElements.createdAt)) : [];
  const shots = plan ? await db.select().from(cutStudioShots).where(eq(cutStudioShots.planId, plan.id)).orderBy(asc(cutStudioShots.sequence)) : [];
  const shotIds = shots.map((shot) => shot.id);
  const [jobs, variants] = shotIds.length ? await Promise.all([
    db.select().from(cutStudioGenerationJobs).where(inArray(cutStudioGenerationJobs.shotId, shotIds)).orderBy(desc(cutStudioGenerationJobs.createdAt)),
    db.select().from(cutStudioShotVariants).where(inArray(cutStudioShotVariants.shotId, shotIds)).orderBy(desc(cutStudioShotVariants.createdAt)),
  ]) : [[], []];
  return {
    compositionRuntime: {
      mode: "clean_room",
      declarative: "configured",
      packageAuthoring: "configured",
      isolatedCode: process.env.CUT_COMPOSITION_SANDBOX_URL ? "provider_configured" : "provider_pending",
      networkPolicy: "deny",
    },
    generationRuntime: {
      dispatchEnabled: process.env.CUT_GENERATION_DISPATCH_ENABLED === "true",
      providers: cutGenerationProviderRegistry(),
    },
    compositions,
    workflows,
    plan,
    elements,
    shots,
    jobs,
    variants,
  };
}

type CutRouteRegistry = {
  get(path: string, ...handlers: RequestHandler[]): unknown;
  post(path: string, ...handlers: RequestHandler[]): unknown;
  put(path: string, ...handlers: RequestHandler[]): unknown;
  delete(path: string, ...handlers: RequestHandler[]): unknown;
};

export function registerCutStudioProductionRoutes(cut: CutRouteRegistry, dependencies: { queueRenderJob(jobId: string): void }) {
  cut.get("/api/cut/projects/:id/creative-runtime", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    res.setHeader("Cache-Control", "no-store");
    res.json(await creativeRuntime(access.project));
  });

  cut.post("/api/cut/projects/:id/compositions", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const parsed = compositionInput.safeParse(req.body ?? { name: `${access.project.name} composition`, manifest: defaultComposition(access.project) });
    if (!parsed.success) return res.status(400).json({ message: "The composition is invalid", issues: parsed.error.issues });
    try {
      await assertCompositionAssets(access.project, parsed.data.manifest);
      if (parsed.data.codeCapsule) await assertCodeCapsuleAssets(access.project, parsed.data.codeCapsule);
    } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Composition assets are invalid" }); }
    const [composition] = await db.insert(cutStudioCompositions).values({ projectId: access.project.id, businessId: access.project.businessId, ownerUserId: req.dbUser!.id, name: parsed.data.name, mode: parsed.data.mode, manifest: parsed.data.manifest, codeCapsule: parsed.data.codeCapsule }).returning();
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: access.project.id, eventType: "cutstudio.composition.created", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, compositionId: composition.id, mode: composition.mode }, idempotencyKey: `cutstudio:${composition.id}:composition.created` });
    res.status(201).json(composition);
  });

  cut.get("/api/cut/projects/:id/compositions/:compositionId/player", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    const [composition] = await db.select({
      id: cutStudioCompositions.id,
      name: cutStudioCompositions.name,
      mode: cutStudioCompositions.mode,
      manifest: cutStudioCompositions.manifest,
      revision: cutStudioCompositions.revision,
      updatedAt: cutStudioCompositions.updatedAt,
    }).from(cutStudioCompositions).where(and(
      eq(cutStudioCompositions.id, req.params.compositionId),
      eq(cutStudioCompositions.projectId, access.project.id),
      eq(cutStudioCompositions.status, "active"),
    )).limit(1);
    if (!composition) return res.status(404).json({ message: "Composition not found" });
    if (composition.mode !== "declarative") return res.status(409).json({ message: "Code compositions require the isolated player runtime" });
    const manifest = cutCompositionManifestSchema.parse(composition.manifest);
    const referencedAssetIds = [
      ...manifest.fonts.map((font) => font.assetId),
      ...manifest.audioReactiveSignals.map((signal) => signal.assetId),
      ...manifest.layers.flatMap((layer) => [
        layer.assetId,
        layer.enter?.maskAssetId,
        layer.exit?.maskAssetId,
        ...layer.effects.map((effect) => typeof effect.parameters.maskAssetId === "string" ? effect.parameters.maskAssetId : undefined),
      ]),
    ].filter((assetId): assetId is string => Boolean(assetId));
    const assetIds = Array.from(new Set(referencedAssetIds));
    const etag = `"cut-composition-${composition.id}-${composition.revision}"`;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", composition.updatedAt.toUTCString());
    if (req.header("If-None-Match") === etag) return res.status(304).end();
    res.json({
      playerVersion: "cutstudio-composition-player-v1",
      composition: { id: composition.id, name: composition.name, revision: composition.revision, manifest },
      durationSeconds: manifest.durationInFrames / manifest.fps,
      assetIds,
      assetUrlTemplate: "/api/assets/{assetId}/stream",
    });
  });

  cut.put("/api/cut/projects/:id/compositions/:compositionId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const expected = requireExpectedRevision(req.header("If-Match"));
    if (!expected) return res.status(428).json({ message: "Composition revision is required" });
    const parsed = compositionInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The composition is invalid", issues: parsed.error.issues });
    try {
      await assertCompositionAssets(access.project, parsed.data.manifest);
      if (parsed.data.codeCapsule) await assertCodeCapsuleAssets(access.project, parsed.data.codeCapsule);
    } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Composition assets are invalid" }); }
    const [updated] = await db.update(cutStudioCompositions).set({ name: parsed.data.name, mode: parsed.data.mode, manifest: parsed.data.manifest, codeCapsule: parsed.data.codeCapsule, revision: sql`${cutStudioCompositions.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioCompositions.id, req.params.compositionId), eq(cutStudioCompositions.projectId, access.project.id), eq(cutStudioCompositions.revision, expected), eq(cutStudioCompositions.status, "active"))).returning();
    if (!updated) return res.status(409).json({ message: "The composition changed elsewhere" });
    res.setHeader("ETag", String(updated.revision));
    res.json(updated);
  });

  cut.post("/api/cut/projects/:id/compositions/:compositionId/variants", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const parsed = cutCompositionVariantBatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The composition variant batch is invalid", issues: parsed.error.issues });
    const [source] = await db.select().from(cutStudioCompositions).where(and(eq(cutStudioCompositions.id, req.params.compositionId), eq(cutStudioCompositions.projectId, access.project.id), eq(cutStudioCompositions.status, "active"))).limit(1);
    if (!source) return res.status(404).json({ message: "Composition not found" });
    if (source.mode !== "declarative") return res.status(409).json({ message: "Only declarative compositions support parameter batches" });
    let manifests: Array<{ name: string; manifest: z.infer<typeof cutCompositionManifestSchema> }>;
    try {
      manifests = parsed.data.variants.map((variant, variantIndex) => ({
        name: variant.name,
        manifest: cutCompositionManifestSchema.parse({
          ...resolveCompositionParameters(source.manifest, variant.parameterValues),
          name: variant.name,
          metadata: { ...source.manifest.metadata, sourceCompositionId: source.id, variantBatchId: parsed.data.idempotencyKey, variantIndex },
        }),
      }));
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Composition parameters are invalid" });
    }
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${access.project.id}:${parsed.data.idempotencyKey}`}))`);
      const existing = await tx.select().from(cutStudioCompositions).where(and(eq(cutStudioCompositions.projectId, access.project.id), eq(cutStudioCompositions.status, "active"), sql`${cutStudioCompositions.manifest}->'metadata'->>'variantBatchId' = ${parsed.data.idempotencyKey}`)).orderBy(asc(cutStudioCompositions.createdAt));
      if (existing.length) return existing;
      return tx.insert(cutStudioCompositions).values(manifests.map((variant) => ({ projectId: access.project.id, businessId: access.project.businessId, ownerUserId: req.dbUser!.id, name: variant.name, mode: "declarative" as const, manifest: variant.manifest, codeCapsule: null }))).returning();
    });
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: access.project.id, eventType: "cutstudio.composition.variants_created", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, sourceCompositionId: source.id, compositionIds: created.map((composition) => composition.id), count: created.length }, idempotencyKey: `cutstudio:${access.project.id}:variants:${parsed.data.idempotencyKey}` });
    res.status(201).json({ variants: created, count: created.length, idempotencyKey: parsed.data.idempotencyKey });
  });

  cut.post("/api/cut/projects/:id/composition-render-batches", attachUser, compositionRenderLimiter, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const parsed = compositionRenderBatchInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The composition render batch is invalid", issues: parsed.error.issues });
    const compositions = await db.select().from(cutStudioCompositions).where(and(
      inArray(cutStudioCompositions.id, parsed.data.compositionIds),
      eq(cutStudioCompositions.projectId, access.project.id),
      eq(cutStudioCompositions.status, "active"),
    ));
    if (compositions.length !== parsed.data.compositionIds.length) return res.status(404).json({ message: "One or more compositions are unavailable" });
    if (compositions.some((composition) => composition.mode !== "declarative")) return res.status(409).json({ message: "Code compositions must render through the isolated runtime" });
    try {
      for (const composition of compositions) await assertCompositionAssets(access.project, composition.manifest);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Composition assets are invalid" });
    }
    const ordered = parsed.data.compositionIds.map((compositionId) => compositions.find((composition) => composition.id === compositionId)!);
    const jobs = await db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`cutstudio.render-batch.${access.project.id}.${parsed.data.idempotencyKey}`}))`);
      const existing = await transaction.select().from(cutStudioJobs).where(and(
        eq(cutStudioJobs.projectId, access.project.id),
        eq(cutStudioJobs.ownerUserId, req.dbUser!.id),
        eq(cutStudioJobs.kind, "render"),
        sql`${cutStudioJobs.request}->'composition'->>'renderBatchId' = ${parsed.data.idempotencyKey}`,
      )).orderBy(asc(cutStudioJobs.createdAt));
      if (existing.length) {
        if (existing.length !== ordered.length) throw new Error("An incomplete render batch already uses this idempotency key");
        return existing;
      }
      return transaction.insert(cutStudioJobs).values(ordered.map((composition, variantIndex) => ({
        projectId: access.project.id,
        ownerUserId: req.dbUser!.id,
        kind: "render",
        detail: "Composition batch render queued",
        request: {
          ...parsed.data.render,
          composition: {
            id: composition.id,
            revision: composition.revision,
            name: composition.name,
            renderBatchId: parsed.data.idempotencyKey,
            variantIndex,
            manifest: composition.manifest,
          },
        },
      }))).returning();
    });
    for (const job of jobs) dependencies.queueRenderJob(job.id);
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: access.project.id, eventType: "cutstudio.composition.render_batch_queued", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, renderBatchId: parsed.data.idempotencyKey, compositionIds: ordered.map((composition) => composition.id), jobIds: jobs.map((job) => job.id), count: jobs.length }, idempotencyKey: `cutstudio:${access.project.id}:render-batch:${parsed.data.idempotencyKey}` });
    res.status(202).json({ idempotencyKey: parsed.data.idempotencyKey, count: jobs.length, jobs });
  });

  cut.post("/api/cut/projects/:id/compositions/:compositionId/apply", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const expected = requireExpectedRevision(req.header("If-Match"));
    if (!expected) return res.status(428).json({ message: "Project revision is required" });
    const [composition] = await db.select().from(cutStudioCompositions).where(and(eq(cutStudioCompositions.id, req.params.compositionId), eq(cutStudioCompositions.projectId, access.project.id), eq(cutStudioCompositions.status, "active"))).limit(1);
    if (!composition) return res.status(404).json({ message: "Composition not found" });
    if (composition.mode !== "declarative") return res.status(409).json({ message: "Code compositions must render through the isolated runtime" });
    let edl;
    try { edl = validateCutEdl(compileCompositionToEdl(composition.manifest, access.project.edl), Math.max(access.project.duration, composition.manifest.durationInFrames / composition.manifest.fps)); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Composition could not be compiled" }); }
    const [updated] = await db.update(cutStudioProjects).set({ edl, duration: Math.max(access.project.duration, composition.manifest.durationInFrames / composition.manifest.fps), revision: sql`${cutStudioProjects.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioProjects.id, access.project.id), eq(cutStudioProjects.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "The project changed elsewhere" });
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: updated.id, eventType: "cutstudio.composition.applied", actorUserId: req.dbUser!.id, payload: { businessId: updated.businessId, compositionId: composition.id, revision: updated.revision }, idempotencyKey: `cutstudio:${composition.id}:applied:${updated.revision}` });
    res.setHeader("X-EDL-Rev", String(updated.revision));
    res.json({ edl: updated.edl, duration: updated.duration, revision: updated.revision });
  });

  cut.delete("/api/cut/projects/:id/compositions/:compositionId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const [archived] = await db.update(cutStudioCompositions).set({ status: "archived", updatedAt: new Date() }).where(and(eq(cutStudioCompositions.id, req.params.compositionId), eq(cutStudioCompositions.projectId, access.project.id), eq(cutStudioCompositions.status, "active"))).returning();
    if (!archived) return res.status(404).json({ message: "Composition not found" });
    res.status(204).end();
  });

  cut.put("/api/cut/projects/:id/production-brief", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const parsed = cutProductionBriefSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The production brief is invalid", issues: parsed.error.issues });
    try { await assertProjectAssets(access.project, parsed.data.referenceAssetIds); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Brief assets are invalid" }); }
    const existing = await productionPlan(access.project);
    if (!existing) {
      const [created] = await db.insert(cutStudioProductionPlans).values({ projectId: access.project.id, businessId: access.project.businessId, ownerUserId: req.dbUser!.id, brief: parsed.data }).returning();
      return res.status(201).json(created);
    }
    const expected = requireExpectedRevision(req.header("If-Match"));
    if (!expected) return res.status(428).json({ message: "Brief revision is required" });
    const [updated] = await db.update(cutStudioProductionPlans).set({ brief: parsed.data, revision: sql`${cutStudioProductionPlans.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioProductionPlans.id, existing.id), eq(cutStudioProductionPlans.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "The production brief changed elsewhere" });
    res.setHeader("ETag", String(updated.revision));
    res.json(updated);
  });

  cut.post("/api/cut/projects/:id/production-elements", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const parsed = cutProductionElementSpecSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The production element is invalid", issues: parsed.error.issues });
    try { await assertProjectAssets(access.project, parsed.data.referenceAssetIds); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Element assets are invalid" }); }
    const plan = await productionPlan(access.project, true);
    const [created] = await db.insert(cutStudioProductionElements).values({ planId: plan!.id, businessId: access.project.businessId, ownerUserId: req.dbUser!.id, spec: parsed.data }).returning();
    res.status(201).json(created);
  });

  cut.put("/api/cut/projects/:id/production-elements/:elementId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const expected = requireExpectedRevision(req.header("If-Match"));
    if (!expected) return res.status(428).json({ message: "Element revision is required" });
    const parsed = cutProductionElementSpecSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The production element is invalid", issues: parsed.error.issues });
    try { await assertProjectAssets(access.project, parsed.data.referenceAssetIds); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Element assets are invalid" }); }
    const [updated] = await db.update(cutStudioProductionElements).set({ spec: parsed.data, revision: sql`${cutStudioProductionElements.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioProductionElements.id, req.params.elementId), eq(cutStudioProductionElements.planId, plan.id), eq(cutStudioProductionElements.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "The production element changed elsewhere" });
    res.json(updated);
  });

  cut.delete("/api/cut/projects/:id/production-elements/:elementId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const [removed] = await db.delete(cutStudioProductionElements).where(and(eq(cutStudioProductionElements.id, req.params.elementId), eq(cutStudioProductionElements.planId, plan.id))).returning();
    if (!removed) return res.status(404).json({ message: "Production element not found" });
    res.status(204).end();
  });

  cut.post("/api/cut/projects/:id/shots", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const parsed = cutShotSpecSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The shot is invalid", issues: parsed.error.issues });
    const plan = await productionPlan(access.project, true);
    try { await assertShotReferences(access.project, plan!.id, parsed.data); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Shot references are invalid" }); }
    const [last] = await db.select({ sequence: cutStudioShots.sequence }).from(cutStudioShots).where(eq(cutStudioShots.planId, plan!.id)).orderBy(desc(cutStudioShots.sequence)).limit(1);
    const [created] = await db.insert(cutStudioShots).values({ planId: plan!.id, businessId: access.project.businessId, ownerUserId: req.dbUser!.id, sequence: (last?.sequence ?? 0) + 10, spec: parsed.data }).returning();
    res.status(201).json(created);
  });

  cut.put("/api/cut/projects/:id/shots/:shotId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const expected = requireExpectedRevision(req.header("If-Match"));
    if (!expected) return res.status(428).json({ message: "Shot revision is required" });
    const parsed = cutShotSpecSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The shot is invalid", issues: parsed.error.issues });
    try { await assertShotReferences(access.project, plan.id, parsed.data); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Shot references are invalid" }); }
    const [updated] = await db.update(cutStudioShots).set({ spec: parsed.data, revision: sql`${cutStudioShots.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioShots.id, req.params.shotId), eq(cutStudioShots.planId, plan.id), eq(cutStudioShots.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "The shot changed elsewhere" });
    res.json(updated);
  });

  cut.delete("/api/cut/projects/:id/shots/:shotId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const [removed] = await db.delete(cutStudioShots).where(and(eq(cutStudioShots.id, req.params.shotId), eq(cutStudioShots.planId, plan.id))).returning();
    if (!removed) return res.status(404).json({ message: "Shot not found" });
    res.status(204).end();
  });

  cut.post("/api/cut/projects/:id/shots/:shotId/generations", attachUser, generationLimiter, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const [shot] = await db.select().from(cutStudioShots).where(and(eq(cutStudioShots.id, req.params.shotId), eq(cutStudioShots.planId, plan.id))).limit(1);
    if (!shot) return res.status(404).json({ message: "Shot not found" });
    const parsed = cutGenerationRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The generation request is invalid", issues: parsed.error.issues });
    const inputAssetIds = parsed.data.inputs.flatMap((input) => input.assetIds);
    try { await assertProjectAssets(access.project, inputAssetIds); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Generation assets are invalid" }); }
    if (!shot.spec.safety.rightsConfirmed) return res.status(409).json({ message: "Confirm media and model rights before generation" });
    const selectedElements = shot.spec.elementIds.length ? await db.select().from(cutStudioProductionElements).where(and(eq(cutStudioProductionElements.planId, plan.id), inArray(cutStudioProductionElements.id, shot.spec.elementIds))) : [];
    if (selectedElements.some((element) => element.spec.kind === "cast" && !element.spec.consentConfirmed) || (selectedElements.some((element) => element.spec.kind === "cast") && !shot.spec.safety.likenessConsentConfirmed)) return res.status(409).json({ message: "Confirm likeness consent for every cast element before generation" });
    const registry = cutGenerationProviderRegistry();
    const provider = registry.find((item) => item.id === parsed.data.provider);
    if (!provider) return res.status(400).json({ message: "Unknown generation provider" });
    const capabilities: readonly string[] = provider.capabilities;
    if (!capabilities.includes("model_router") && !capabilities.includes(parsed.data.operation)) return res.status(409).json({ message: `${provider.label} does not advertise ${parsed.data.operation.replaceAll("_", " ")}` });
    const dispatchEnabled = process.env.CUT_GENERATION_DISPATCH_ENABLED === "true";
    const state = provider.configured && dispatchEnabled ? "queued" : "provider_pending";
    const detail = state === "queued" ? "Queued for the activated generation adapter" : "Provider credentials or dispatch infrastructure are not activated";
    const [job] = await db.insert(cutStudioGenerationJobs).values({ shotId: shot.id, businessId: access.project.businessId, ownerUserId: req.dbUser!.id, provider: parsed.data.provider, model: parsed.data.model, request: parsed.data, state, detail, idempotencyKey: parsed.data.idempotencyKey }).onConflictDoNothing().returning();
    if (!job) {
      const [existing] = await db.select().from(cutStudioGenerationJobs).where(and(eq(cutStudioGenerationJobs.businessId, access.project.businessId), eq(cutStudioGenerationJobs.idempotencyKey, parsed.data.idempotencyKey))).limit(1);
      if (!existing || existing.shotId !== shot.id) return res.status(409).json({ message: "That idempotency key is already used by another generation request" });
      return res.status(200).json(existing);
    }
    await emitProjectionEvent({ aggregateType: "cutstudio_shot", aggregateId: shot.id, eventType: "cutstudio.generation.requested", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, projectId: access.project.id, jobId: job.id, provider: job.provider, model: job.model, state: job.state }, idempotencyKey: `cutstudio:generation:${job.id}` });
    res.status(202).json(job);
  });

  cut.post("/api/cut/projects/:id/generations/:jobId/cancel", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const shotIds = db.select({ id: cutStudioShots.id }).from(cutStudioShots).where(eq(cutStudioShots.planId, plan.id));
    const [cancelled] = await db.update(cutStudioGenerationJobs).set({ state: "cancelled", detail: "Cancelled by an editor", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(cutStudioGenerationJobs.id, req.params.jobId), inArray(cutStudioGenerationJobs.shotId, shotIds), inArray(cutStudioGenerationJobs.state, ["provider_pending", "queued"]))).returning();
    if (!cancelled) return res.status(409).json({ message: "Only waiting or queued generation jobs can be cancelled here" });
    res.json(cancelled);
  });

  cut.post("/api/cut/projects/:id/generations/:jobId/retry", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const shotIds = db.select({ id: cutStudioShots.id }).from(cutStudioShots).where(eq(cutStudioShots.planId, plan.id));
    const [current] = await db.select().from(cutStudioGenerationJobs).where(and(eq(cutStudioGenerationJobs.id, req.params.jobId), inArray(cutStudioGenerationJobs.shotId, shotIds))).limit(1);
    if (!current || !["error", "cancelled", "provider_pending"].includes(current.state)) return res.status(409).json({ message: "This generation job cannot be retried" });
    if (current.attempt >= 20) return res.status(409).json({ message: "This generation job reached its retry limit" });
    const provider = cutGenerationProviderRegistry().find((item) => item.id === current.provider);
    const state = provider?.configured && process.env.CUT_GENERATION_DISPATCH_ENABLED === "true" ? "queued" : "provider_pending";
    const [retried] = await db.update(cutStudioGenerationJobs).set({ state, progress: 0, detail: state === "queued" ? "Queued for the activated generation adapter" : "Provider credentials or dispatch infrastructure are not activated", providerJobId: null, attempt: sql`${cutStudioGenerationJobs.attempt} + 1`, startedAt: null, completedAt: null, updatedAt: new Date() }).where(eq(cutStudioGenerationJobs.id, current.id)).returning();
    res.status(202).json(retried);
  });

  cut.post("/api/cut/projects/:id/shots/:shotId/variants/import", attachUser, generationLimiter, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const parsed = variantImportInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A valid project video candidate is required", issues: parsed.error.issues });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const [[shot], [media], [asset]] = await Promise.all([
      db.select().from(cutStudioShots).where(and(eq(cutStudioShots.id, req.params.shotId), eq(cutStudioShots.planId, plan.id))).limit(1),
      db.select().from(cutStudioProjectMedia).where(and(eq(cutStudioProjectMedia.projectId, access.project.id), eq(cutStudioProjectMedia.assetId, parsed.data.assetId), eq(cutStudioProjectMedia.ownerUserId, access.project.ownerUserId), eq(cutStudioProjectMedia.mediaKind, "video"))).limit(1),
      db.select().from(assets).where(and(eq(assets.id, parsed.data.assetId), eq(assets.ownerUserId, access.project.ownerUserId), eq(assets.businessId, access.project.businessId), eq(assets.visibility, "private"), eq(assets.status, "ready"))).limit(1),
    ]);
    if (!shot) return res.status(404).json({ message: "Shot not found" });
    if (!media || !asset?.mimeType?.startsWith("video/")) return res.status(409).json({ message: "Only ready private project video may enter variant review" });
    const variant = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${shot.id}:${asset.id}:variant-import`}))`);
      const [existing] = await tx.select().from(cutStudioShotVariants).where(and(eq(cutStudioShotVariants.shotId, shot.id), eq(cutStudioShotVariants.assetId, asset.id))).limit(1);
      if (existing) return existing;
      const [created] = await tx.insert(cutStudioShotVariants).values({
        shotId: shot.id,
        generationJobId: null,
        assetId: asset.id,
        businessId: access.project.businessId,
        ownerUserId: access.project.ownerUserId,
        provider: "project_media",
        model: "manual_import",
        status: "candidate",
        provenance: { source: "project_media", label: parsed.data.label, importedByUserId: req.dbUser!.id, projectMediaId: media.id, importedAt: new Date().toISOString() },
      }).returning();
      return created;
    });
    await emitProjectionEvent({ aggregateType: "cutstudio_shot", aggregateId: shot.id, eventType: "cutstudio.variant.imported", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, projectId: access.project.id, variantId: variant.id, assetId: asset.id }, idempotencyKey: `cutstudio:variant:${variant.id}:imported` });
    res.status(201).json(variant);
  });

  cut.post("/api/cut/projects/:id/shots/:shotId/variants/:variantId/select", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const [variant] = await db.select().from(cutStudioShotVariants).where(and(eq(cutStudioShotVariants.id, req.params.variantId), eq(cutStudioShotVariants.shotId, req.params.shotId), eq(cutStudioShotVariants.businessId, access.project.businessId))).limit(1);
    if (!variant?.assetId) return res.status(409).json({ message: "A ready generated asset is required" });
    try { await assertProjectAssets(access.project, [variant.assetId]); } catch { return res.status(409).json({ message: "The generated asset is not a ready private asset in this business" }); }
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(cutStudioShots).set({ selectedVariantId: variant.id, status: "selected", revision: sql`${cutStudioShots.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioShots.id, req.params.shotId), eq(cutStudioShots.planId, plan.id))).returning();
      if (!updated) return null;
      await tx.update(cutStudioShotVariants).set({ status: "superseded" }).where(and(eq(cutStudioShotVariants.shotId, updated.id), eq(cutStudioShotVariants.status, "selected"), ne(cutStudioShotVariants.id, variant.id)));
      const [selected] = await tx.update(cutStudioShotVariants).set({ status: "selected" }).where(eq(cutStudioShotVariants.id, variant.id)).returning();
      return { shot: updated, variant: selected };
    });
    if (!result) return res.status(404).json({ message: "Shot not found" });
    await emitProjectionEvent({ aggregateType: "cutstudio_shot", aggregateId: result.shot.id, eventType: "cutstudio.variant.selected", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, projectId: access.project.id, variantId: result.variant.id, assetId: result.variant.assetId }, idempotencyKey: `cutstudio:variant:${result.variant.id}:selected` });
    res.json(result);
  });

  cut.post("/api/cut/projects/:id/shots/:shotId/variants/:variantId/reject", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const [shot] = await db.select().from(cutStudioShots).where(and(eq(cutStudioShots.id, req.params.shotId), eq(cutStudioShots.planId, plan.id))).limit(1);
    if (!shot) return res.status(404).json({ message: "Shot not found" });
    if (shot.selectedVariantId === req.params.variantId) return res.status(409).json({ message: "Select another candidate before rejecting the current timeline choice" });
    const [rejected] = await db.update(cutStudioShotVariants).set({ status: "rejected" }).where(and(eq(cutStudioShotVariants.id, req.params.variantId), eq(cutStudioShotVariants.shotId, shot.id), inArray(cutStudioShotVariants.status, ["candidate", "superseded"]))).returning();
    if (!rejected) return res.status(409).json({ message: "This candidate cannot be rejected" });
    await emitProjectionEvent({ aggregateType: "cutstudio_shot", aggregateId: shot.id, eventType: "cutstudio.variant.rejected", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, projectId: access.project.id, variantId: rejected.id }, idempotencyKey: `cutstudio:variant:${rejected.id}:rejected` });
    res.json(rejected);
  });

  cut.post("/api/cut/projects/:id/shots/:shotId/variants/:variantId/handoff", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const expected = requireExpectedRevision(req.header("If-Match"));
    if (!expected) return res.status(428).json({ message: "Project revision is required" });
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const [[shot], [variant]] = await Promise.all([
      db.select().from(cutStudioShots).where(and(eq(cutStudioShots.id, req.params.shotId), eq(cutStudioShots.planId, plan.id))).limit(1),
      db.select().from(cutStudioShotVariants).where(and(eq(cutStudioShotVariants.id, req.params.variantId), eq(cutStudioShotVariants.shotId, req.params.shotId), eq(cutStudioShotVariants.businessId, access.project.businessId))).limit(1),
    ]);
    if (!shot || !variant?.assetId) return res.status(404).json({ message: "Selected variant not found" });
    if (shot.selectedVariantId !== variant.id || variant.status !== "selected") return res.status(409).json({ message: "Select this candidate before handing it to the timeline" });
    const [[media], [asset]] = await Promise.all([
      db.select().from(cutStudioProjectMedia).where(and(eq(cutStudioProjectMedia.projectId, access.project.id), eq(cutStudioProjectMedia.assetId, variant.assetId), eq(cutStudioProjectMedia.ownerUserId, access.project.ownerUserId), eq(cutStudioProjectMedia.mediaKind, "video"))).limit(1),
      db.select().from(assets).where(and(eq(assets.id, variant.assetId), eq(assets.ownerUserId, access.project.ownerUserId), eq(assets.businessId, access.project.businessId), eq(assets.visibility, "private"), eq(assets.status, "ready"))).limit(1),
    ]);
    if (!media || !asset?.mimeType?.startsWith("video/")) return res.status(409).json({ message: "The selected variant is not ready private project video" });
    const existing = access.project.edl.clips.find((clip) => clip.sourceVariantId === variant.id);
    if (existing) return res.json({ edl: access.project.edl, duration: access.project.duration, revision: access.project.revision, clip: existing, idempotent: true });
    const timelineStart = access.project.edl.clips.filter((clip) => (clip.track ?? "v1") === "v1").reduce((maximum, clip) => Math.max(maximum, (clip.timelineStart ?? 0) + ((clip.end - clip.start) / (clip.speed ?? 1))), 0);
    const duration = Math.min(media.duration, 43_200 - timelineStart);
    if (duration < .05) return res.status(409).json({ message: "The primary timeline has no room for another variant" });
    const clip = { id: `variant_${variant.id.replaceAll("-", "")}`, start: 0, end: duration, label: `${shot.spec.name} · selected`, assetId: variant.assetId, sourceVariantId: variant.id, generationJobId: variant.generationJobId, track: "v1" as const, timelineStart, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, transition: "cut" as const, transform: { x: 0, y: 0, width: 1, height: 1, opacity: 1 } };
    const nextDuration = Math.max(access.project.duration, timelineStart + duration);
    let edl;
    try { edl = validateCutEdl({ ...access.project.edl, version: 3, clips: [...access.project.edl.clips, clip] }, nextDuration); } catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "The selected variant could not enter the timeline" }); }
    const [updated] = await db.update(cutStudioProjects).set({ edl, duration: nextDuration, revision: sql`${cutStudioProjects.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioProjects.id, access.project.id), eq(cutStudioProjects.revision, expected))).returning();
    if (!updated) return res.status(409).json({ message: "The timeline changed elsewhere" });
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: access.project.id, eventType: "cutstudio.variant.handed_off", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, shotId: shot.id, variantId: variant.id, assetId: variant.assetId, clipId: clip.id }, idempotencyKey: `cutstudio:variant:${variant.id}:timeline` });
    res.json({ edl: updated.edl, duration: updated.duration, revision: updated.revision, clip, idempotent: false });
  });

  cut.post("/api/cut/projects/:id/generative-workflows", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const parsed = workflowInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The generative workflow is invalid", issues: parsed.error.issues });
    const assetIds = parsed.data.workflow.nodes.flatMap((node) => node.inputs.flatMap((input) => input.assetIds));
    try { await assertProjectAssets(access.project, assetIds); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Workflow assets are invalid" }); }
    const [created] = await db.insert(cutStudioGenerativeWorkflows).values({ projectId: access.project.id, businessId: access.project.businessId, ownerUserId: req.dbUser!.id, workflow: parsed.data.workflow }).returning();
    res.status(201).json(created);
  });

  cut.put("/api/cut/projects/:id/generative-workflows/:workflowId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const expected = requireExpectedRevision(req.header("If-Match"));
    if (!expected) return res.status(428).json({ message: "Workflow revision is required" });
    const parsed = workflowInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The generative workflow is invalid", issues: parsed.error.issues });
    const assetIds = parsed.data.workflow.nodes.flatMap((node) => node.inputs.flatMap((input) => input.assetIds));
    try { await assertProjectAssets(access.project, assetIds); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Workflow assets are invalid" }); }
    const [updated] = await db.update(cutStudioGenerativeWorkflows).set({ workflow: parsed.data.workflow, revision: sql`${cutStudioGenerativeWorkflows.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioGenerativeWorkflows.id, req.params.workflowId), eq(cutStudioGenerativeWorkflows.projectId, access.project.id), eq(cutStudioGenerativeWorkflows.revision, expected), eq(cutStudioGenerativeWorkflows.status, "active"))).returning();
    if (!updated) return res.status(409).json({ message: "The workflow changed elsewhere" });
    res.json(updated);
  });

  cut.delete("/api/cut/projects/:id/generative-workflows/:workflowId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const [archived] = await db.update(cutStudioGenerativeWorkflows).set({ status: "archived", updatedAt: new Date() }).where(and(eq(cutStudioGenerativeWorkflows.id, req.params.workflowId), eq(cutStudioGenerativeWorkflows.projectId, access.project.id), eq(cutStudioGenerativeWorkflows.status, "active"))).returning();
    if (!archived) return res.status(404).json({ message: "Workflow not found" });
    res.status(204).end();
  });
}
