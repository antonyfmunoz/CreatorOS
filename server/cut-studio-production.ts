import type { RequestHandler } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import {
  assets,
  cutStudioCollaborators,
  cutStudioCompositions,
  cutStudioGenerationJobs,
  cutStudioGenerativeWorkflows,
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
import { validateCutEdl } from "@shared/cut-studio";
import { attachUser } from "./auth";
import { db } from "./db";
import { emitProjectionEvent } from "./umh";

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
const generationLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

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
  const maskIds = manifest.layers.flatMap((layer) => [layer.enter?.maskAssetId, layer.exit?.maskAssetId, ...layer.effects.flatMap((effect) => effect.kind === "mask" && typeof effect.parameters.maskAssetId === "string" ? [effect.parameters.maskAssetId] : [])].filter((value): value is string => Boolean(value)));
  if ([...imageIds, ...maskIds].some((assetId) => !byId.get(assetId)?.mimeType?.startsWith("image/"))) throw new Error("Every composition image or mask must be ready private image media");
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

export function registerCutStudioProductionRoutes(cut: CutRouteRegistry) {
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
    if (parsed.data.mode === "sandboxed_tsx" && !process.env.CUT_COMPOSITION_SANDBOX_URL) return res.status(409).json({ message: "The isolated composition runtime is not activated" });
    try { await assertCompositionAssets(access.project, parsed.data.manifest); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Composition assets are invalid" }); }
    const [composition] = await db.insert(cutStudioCompositions).values({ projectId: access.project.id, businessId: access.project.businessId, ownerUserId: req.dbUser!.id, name: parsed.data.name, mode: parsed.data.mode, manifest: parsed.data.manifest, codeCapsule: parsed.data.codeCapsule }).returning();
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: access.project.id, eventType: "cutstudio.composition.created", actorUserId: req.dbUser!.id, payload: { businessId: access.project.businessId, compositionId: composition.id, mode: composition.mode }, idempotencyKey: `cutstudio:${composition.id}:composition.created` });
    res.status(201).json(composition);
  });

  cut.put("/api/cut/projects/:id/compositions/:compositionId", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const expected = requireExpectedRevision(req.header("If-Match"));
    if (!expected) return res.status(428).json({ message: "Composition revision is required" });
    const parsed = compositionInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "The composition is invalid", issues: parsed.error.issues });
    if (parsed.data.mode === "sandboxed_tsx" && !process.env.CUT_COMPOSITION_SANDBOX_URL) return res.status(409).json({ message: "The isolated composition runtime is not activated" });
    try { await assertCompositionAssets(access.project, parsed.data.manifest); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Composition assets are invalid" }); }
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

  cut.post("/api/cut/projects/:id/shots/:shotId/variants/:variantId/select", attachUser, async (req, res) => {
    const access = await projectAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Project not found" });
    if (!mayEdit(access.role)) return res.status(403).json({ message: "Editor access is required" });
    const [variant] = await db.select().from(cutStudioShotVariants).where(and(eq(cutStudioShotVariants.id, req.params.variantId), eq(cutStudioShotVariants.shotId, req.params.shotId), eq(cutStudioShotVariants.businessId, access.project.businessId))).limit(1);
    if (!variant?.assetId) return res.status(409).json({ message: "A ready generated asset is required" });
    try { await assertProjectAssets(access.project, [variant.assetId]); } catch { return res.status(409).json({ message: "The generated asset is not a ready private asset in this business" }); }
    const plan = await productionPlan(access.project);
    if (!plan) return res.status(404).json({ message: "Production plan not found" });
    const [updated] = await db.update(cutStudioShots).set({ selectedVariantId: variant.id, status: "selected", revision: sql`${cutStudioShots.revision} + 1`, updatedAt: new Date() }).where(and(eq(cutStudioShots.id, req.params.shotId), eq(cutStudioShots.planId, plan.id))).returning();
    if (!updated) return res.status(404).json({ message: "Shot not found" });
    res.json(updated);
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
