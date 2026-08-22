import type { Express, RequestHandler, Response } from "express";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assetCollectionItems,
  assetCollections,
  assetLineageEdges,
  assetProvenanceClaims,
  assetProductAccess,
  assetRights,
  assetTags,
  assetUsageRecords,
  assets,
  entitlements,
  mediaPlaybackEvents,
  mediaPlaybackSessions,
  mediaProcessingJobs,
  mediaRenditions,
  mediaTextTracks,
  type Asset,
  type MediaRendition,
  type MediaTextTrack,
} from "@shared/schema";
import {
  createAssetCollectionSchema,
  assetTagSchema,
  createAssetRightSchema,
  createMediaJobSchema,
  createMediaLineageSchema,
  createPlaybackSessionSchema,
  playbackSessionDelta,
  recordPlaybackEventSchema,
  registerMediaRenditionSchema,
  registerMediaTextTrackSchema,
  updateAssetCollectionSchema,
  updateAssetRightSchema,
} from "@shared/media-cloud";
import { attachUser } from "./auth";
import { createPrivateAssetReadUrl } from "./asset-storage";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";
import { cancelMediaProcess } from "./media-processing";

const uuidSchema = z.string().uuid();
const mediaKinds = new Set(["photo", "video", "audio", "broadcast-recording", "cut-render", "ugc"]);
type IngestJobKind = "probe" | "thumbnail" | "transcode" | "package" | "waveform";

const safe = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
}

function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({
    message: error.issues[0]?.message ?? "Invalid media request",
    issues: error.issues,
  });
}

async function ownedAsset(userId: number, assetId: string) {
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerUserId, userId), ne(assets.status, "deleted")))
    .limit(1);
  return asset ?? null;
}

async function accessibleAsset(userId: number, assetId: string) {
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.status, "ready"))).limit(1);
  if (!asset) return null;
  if (!(await assetRightsAllowUse(asset.id, "playback"))) return null;
  if (asset.visibility === "public" || asset.ownerUserId === userId) return asset;
  const [access] = await db
    .select({ id: assetProductAccess.id })
    .from(assetProductAccess)
    .innerJoin(
      entitlements,
      and(
        eq(entitlements.productId, assetProductAccess.productId),
        eq(entitlements.userId, userId),
        eq(entitlements.status, "active"),
      ),
    )
    .where(eq(assetProductAccess.assetId, assetId))
    .limit(1);
  return access ? asset : null;
}

export async function assetRightsAllowUse(assetId: string, useType: string) {
  const rights = await db.select().from(assetRights).where(eq(assetRights.assetId, assetId));
  if (!rights.length) return true;
  const now = Date.now();
  if (rights.some((right) => right.status === "revoked" || right.status === "disputed" || (right.expiresAt && right.expiresAt.getTime() <= now))) return false;
  return rights.some((right) => right.status === "active" && right.validFrom.getTime() <= now && (!right.expiresAt || right.expiresAt.getTime() > now) && (right.permittedUses.includes("all") || right.permittedUses.includes(useType)));
}

export async function assertAssetUsageAllowed(assetId: string, useType: string) {
  if (await assetRightsAllowUse(assetId, useType)) return;
  throw Object.assign(new Error("Asset rights do not permit this use"), { code: "asset_rights_blocked" });
}

export async function recordAssetUsage(input: {
  assetId: string;
  actorUserId?: number | null;
  surfaceType: "post" | "story" | "product" | "course" | "cutstudio" | "broadcast" | "ugc" | "distribution" | "podcast" | "design" | "site" | "community" | "event";
  surfaceId: string;
  useType: "native_publish" | "commercial_delivery" | "editing" | "broadcast" | "ugc_submission" | "external_distribution" | "playback" | "artwork" | "evidence";
  metadata?: Record<string, unknown>;
}) {
  await assertAssetUsageAllowed(input.assetId, input.useType);
  const [usage] = await db.insert(assetUsageRecords).values({ ...input, actorUserId: input.actorUserId ?? null, metadata: input.metadata ?? {} }).onConflictDoUpdate({
    target: [assetUsageRecords.assetId, assetUsageRecords.surfaceType, assetUsageRecords.surfaceId, assetUsageRecords.useType],
    set: { state: "active", endedAt: null, metadata: input.metadata ?? {}, updatedAt: new Date() },
  }).returning();
  return usage;
}

async function deliveryUrl(asset: Asset, rendition?: MediaRendition | null) {
  const candidate = rendition ?? asset;
  if (asset.visibility === "public") {
    if (!candidate.publicUrl) throw new Error("Public media is missing its delivery URL");
    return { url: candidate.publicUrl, expiresAt: null };
  }
  if (candidate.storageProvider === "local" && !rendition && process.env.NODE_ENV !== "production") {
    return { url: `/api/assets/${asset.id}/stream`, expiresAt: null };
  }
  return createPrivateAssetReadUrl(candidate.storageKey);
}

async function textTrackDelivery(asset: Asset, track: MediaTextTrack) {
  if (asset.visibility === "public") return { ...track, access: { url: track.publicUrl, expiresAt: null } };
  return { ...track, access: await createPrivateAssetReadUrl(track.storageKey) };
}

export async function queueMediaIngestJobs(asset: Pick<Asset, "id" | "ownerUserId" | "businessId" | "kind" | "mimeType">) {
  if (!mediaKinds.has(asset.kind) && !asset.mimeType?.startsWith("video/") && !asset.mimeType?.startsWith("audio/") && !asset.mimeType?.startsWith("image/")) return [];
  const jobs: Array<{ kind: IngestJobKind; priority: number }> = [
    { kind: "probe", priority: 100 },
  ];
  if (asset.mimeType?.startsWith("video/")) jobs.push({ kind: "thumbnail", priority: 90 }, { kind: "transcode", priority: 80 }, { kind: "package", priority: 70 });
  if (asset.mimeType?.startsWith("audio/")) jobs.push({ kind: "waveform", priority: 80 }, { kind: "transcode", priority: 70 });
  return db
    .insert(mediaProcessingJobs)
    .values(jobs.map((job) => ({
      assetId: asset.id,
      ownerUserId: asset.ownerUserId,
      businessId: asset.businessId,
      kind: job.kind,
      priority: job.priority,
      idempotencyKey: `ingest:${asset.id}:${job.kind}:v1`,
      request: { source: "asset_ingest", contractVersion: 1 },
    })))
    .onConflictDoNothing()
    .returning();
}

export async function registerAssetLineage(input: {
  parentAssetId: string;
  childAssetId: string;
  relationship: "derived_from" | "rendered_from" | "clipped_from" | "recorded_from" | "published_from" | "replaced_by";
  createdByUserId: number;
  metadata?: Record<string, unknown>;
}) {
  const [edge] = await db.insert(assetLineageEdges).values({ ...input, metadata: input.metadata ?? {} }).onConflictDoNothing().returning();
  if (edge && ["derived_from", "rendered_from", "clipped_from", "recorded_from", "published_from"].includes(input.relationship)) {
    const parentRights = await db.select().from(assetRights).where(eq(assetRights.assetId, input.parentAssetId));
    if (parentRights.length) {
      await db.transaction(async (tx) => {
        await tx.delete(assetRights).where(and(eq(assetRights.assetId, input.childAssetId), eq(assetRights.basis, "owner_declaration"), ilike(assetRights.notes, "Created automatically%")));
        await tx.insert(assetRights).values(parentRights.map((right) => ({
          assetId: input.childAssetId,
          ownerUserId: right.ownerUserId,
          rightsHolderName: right.rightsHolderName,
          basis: right.basis,
          permittedUses: right.permittedUses,
          territories: right.territories,
          validFrom: right.validFrom,
          expiresAt: right.expiresAt,
          status: right.status,
          evidenceAssetId: right.evidenceAssetId,
          syntheticMedia: right.syntheticMedia,
          clonedVoice: right.clonedVoice,
          notes: `Inherited through ${input.relationship}. ${right.notes}`.trim().slice(0, 2_000),
          revokedAt: right.revokedAt,
        })));
      });
    }
    const parentClaims = await db.select().from(assetProvenanceClaims).where(eq(assetProvenanceClaims.assetId, input.parentAssetId));
    if (parentClaims.length) await db.insert(assetProvenanceClaims).values(parentClaims.map((claim) => ({ assetId: input.childAssetId, assertedByUserId: input.createdByUserId, kind: claim.kind === "human_created" ? "edited_derivative" : claim.kind, provider: claim.provider, model: claim.model, tool: claim.tool, disclosure: claim.disclosure, sourceAssetIds: Array.from(new Set([...claim.sourceAssetIds, input.parentAssetId])), metadata: { ...claim.metadata, inheritedThrough: input.relationship }, inheritedFromClaimId: claim.id })));
  }
  return edge ?? null;
}

export function registerMediaCloudRoutes(app: Express) {
  app.get("/api/media/assets", attachUser, safe(async (req, res) => {
    noStore(res);
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
    const kind = typeof req.query.kind === "string" ? req.query.kind.trim().slice(0, 50) : "";
    const collectionId = typeof req.query.collectionId === "string" ? req.query.collectionId : "";
    if (collectionId && !uuidSchema.safeParse(collectionId).success) return res.status(400).json({ message: "Invalid collection" });

    const conditions = [eq(assets.ownerUserId, req.dbUser!.id), ne(assets.status, "deleted")];
    if (kind) conditions.push(eq(assets.kind, kind));
    if (query) conditions.push(or(ilike(assets.originalFilename, `%${query}%`), ilike(assets.kind, `%${query}%`))!);
    if (collectionId) {
      const [collection] = await db.select({ id: assetCollections.id }).from(assetCollections).where(and(eq(assetCollections.id, collectionId), eq(assetCollections.ownerUserId, req.dbUser!.id))).limit(1);
      if (!collection) return res.status(404).json({ message: "Collection not found" });
      const items = await db.select({ assetId: assetCollectionItems.assetId }).from(assetCollectionItems).where(eq(assetCollectionItems.collectionId, collectionId));
      if (!items.length) return res.json([]);
      conditions.push(inArray(assets.id, items.map((item) => item.assetId)));
    }

    const rows = await db.select().from(assets).where(and(...conditions)).orderBy(desc(assets.createdAt)).limit(500);
    if (!rows.length) return res.json([]);
    const ids = rows.map((asset) => asset.id);
    const [renditions, tracks, memberships, jobs, tags, rights, usages] = await Promise.all([
      db.select().from(mediaRenditions).where(and(inArray(mediaRenditions.assetId, ids), ne(mediaRenditions.status, "deleted"))).orderBy(asc(mediaRenditions.role)),
      db.select().from(mediaTextTracks).where(and(inArray(mediaTextTracks.assetId, ids), ne(mediaTextTracks.status, "deleted"))).orderBy(asc(mediaTextTracks.language)),
      db.select().from(assetCollectionItems).where(inArray(assetCollectionItems.assetId, ids)),
      db.select().from(mediaProcessingJobs).where(inArray(mediaProcessingJobs.assetId, ids)).orderBy(desc(mediaProcessingJobs.createdAt)),
      db.select().from(assetTags).where(inArray(assetTags.assetId, ids)).orderBy(asc(assetTags.tag)),
      db.select().from(assetRights).where(inArray(assetRights.assetId, ids)).orderBy(desc(assetRights.updatedAt)),
      db.select().from(assetUsageRecords).where(inArray(assetUsageRecords.assetId, ids)).orderBy(desc(assetUsageRecords.startedAt)),
    ]);
    const duplicateCounts = new Map<string, number>();
    for (const candidate of rows) if (candidate.sha256) duplicateCounts.set(candidate.sha256, (duplicateCounts.get(candidate.sha256) ?? 0) + 1);
    return res.json(rows.map((asset) => ({
      ...asset,
      renditions: renditions.filter((item) => item.assetId === asset.id),
      textTracks: tracks.filter((item) => item.assetId === asset.id),
      collectionIds: memberships.filter((item) => item.assetId === asset.id).map((item) => item.collectionId),
      processing: jobs.filter((item) => item.assetId === asset.id),
      tags: tags.filter((item) => item.assetId === asset.id),
      rights: rights.filter((item) => item.assetId === asset.id).map((right) => ({ ...right, effectiveStatus: right.status === "active" && right.expiresAt && right.expiresAt <= new Date() ? "expired" : right.status })),
      usageCount: usages.filter((item) => item.assetId === asset.id && item.state === "active").length,
      duplicateCount: asset.sha256 ? Math.max(0, (duplicateCounts.get(asset.sha256) ?? 1) - 1) : 0,
    })));
  }));

  app.get("/api/media/assets/:id", attachUser, safe(async (req, res) => {
    noStore(res);
    if (!uuidSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Invalid asset" });
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const [renditions, textTracks, parents, children, processing, tags, rights, usage, duplicates] = await Promise.all([
      db.select().from(mediaRenditions).where(eq(mediaRenditions.assetId, asset.id)).orderBy(asc(mediaRenditions.role)),
      db.select().from(mediaTextTracks).where(eq(mediaTextTracks.assetId, asset.id)).orderBy(asc(mediaTextTracks.language)),
      db.select().from(assetLineageEdges).where(eq(assetLineageEdges.childAssetId, asset.id)).orderBy(desc(assetLineageEdges.createdAt)),
      db.select().from(assetLineageEdges).where(eq(assetLineageEdges.parentAssetId, asset.id)).orderBy(desc(assetLineageEdges.createdAt)),
      db.select().from(mediaProcessingJobs).where(eq(mediaProcessingJobs.assetId, asset.id)).orderBy(desc(mediaProcessingJobs.createdAt)),
      db.select().from(assetTags).where(eq(assetTags.assetId, asset.id)).orderBy(asc(assetTags.tag)),
      db.select().from(assetRights).where(eq(assetRights.assetId, asset.id)).orderBy(desc(assetRights.updatedAt)),
      db.select().from(assetUsageRecords).where(eq(assetUsageRecords.assetId, asset.id)).orderBy(desc(assetUsageRecords.startedAt)),
      asset.sha256 ? db.select({ id: assets.id, originalFilename: assets.originalFilename, createdAt: assets.createdAt }).from(assets).where(and(eq(assets.ownerUserId, req.dbUser!.id), eq(assets.sha256, asset.sha256), ne(assets.id, asset.id), ne(assets.status, "deleted"))).orderBy(desc(assets.createdAt)) : Promise.resolve([]),
    ]);
    return res.json({ asset, renditions, textTracks, lineage: { parents, children }, processing, tags, rights: rights.map((right) => ({ ...right, effectiveStatus: right.status === "active" && right.expiresAt && right.expiresAt <= new Date() ? "expired" : right.status })), usage, duplicates });
  }));

  app.post("/api/media/assets/:id/jobs", attachUser, safe(async (req, res) => {
    const parsed = createMediaJobSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const idempotencyKey = `user:${req.dbUser!.id}:${parsed.data.idempotencyKey}`;
    const [created] = await db.insert(mediaProcessingJobs).values({
      assetId: asset.id,
      ownerUserId: req.dbUser!.id,
      businessId: asset.businessId,
      ...parsed.data,
      idempotencyKey,
    }).onConflictDoNothing().returning();
    if (created) return res.status(201).json(created);
    const [existing] = await db.select().from(mediaProcessingJobs).where(eq(mediaProcessingJobs.idempotencyKey, idempotencyKey)).limit(1);
    return res.status(200).json(existing);
  }));

  app.post("/api/media/jobs/:id/cancel", attachUser, safe(async (req, res) => {
    const [job] = await db.select().from(mediaProcessingJobs).where(and(eq(mediaProcessingJobs.id, req.params.id), eq(mediaProcessingJobs.ownerUserId, req.dbUser!.id))).limit(1);
    if (!job) return res.status(404).json({ message: "Media job not found" });
    if (!["queued", "running"].includes(job.state)) return res.status(409).json({ message: "This media job can no longer be cancelled" });
    const cancelledAt = new Date();
    const [updated] = await db.update(mediaProcessingJobs).set({ state: "cancelled", cancellationRequestedAt: cancelledAt, leaseExpiresAt: null, finishedAt: cancelledAt, updatedAt: cancelledAt }).where(and(eq(mediaProcessingJobs.id, job.id), inArray(mediaProcessingJobs.state, ["queued", "running"]))).returning();
    if (!updated) return res.status(409).json({ message: "The media job changed before cancellation" });
    cancelMediaProcess(job.id);
    return res.json(updated);
  }));

  app.post("/api/media/jobs/:id/retry", attachUser, safe(async (req, res) => {
    const [job] = await db.select().from(mediaProcessingJobs).where(and(eq(mediaProcessingJobs.id, req.params.id), eq(mediaProcessingJobs.ownerUserId, req.dbUser!.id))).limit(1);
    if (!job) return res.status(404).json({ message: "Media job not found" });
    if (!["failed", "cancelled"].includes(job.state)) return res.status(409).json({ message: "Only failed or cancelled media jobs can be retried" });
    if (job.attempt >= job.maxAttempts) return res.status(409).json({ message: "This media job exhausted its retry budget" });
    const [updated] = await db.update(mediaProcessingJobs).set({ state: "queued", progress: 0, errorCode: null, errorMessage: null, workerId: null, workerRegion: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null, cancellationRequestedAt: null, availableAt: new Date(), startedAt: null, finishedAt: null, updatedAt: new Date() }).where(eq(mediaProcessingJobs.id, job.id)).returning();
    return res.json(updated);
  }));

  app.post("/api/media/assets/:id/renditions", attachUser, safe(async (req, res) => {
    const parsed = registerMediaRenditionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    if (asset.visibility === "private" && parsed.data.publicUrl) return res.status(400).json({ message: "Private renditions cannot expose a public URL" });
    const [rendition] = await db.insert(mediaRenditions).values({ assetId: asset.id, ownerUserId: req.dbUser!.id, ...parsed.data }).onConflictDoUpdate({ target: [mediaRenditions.assetId, mediaRenditions.renditionKey], set: { ...parsed.data, status: "ready", updatedAt: new Date() } }).returning();
    return res.status(201).json(rendition);
  }));

  app.post("/api/media/assets/:id/text-tracks", attachUser, safe(async (req, res) => {
    const parsed = registerMediaTextTrackSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    if (asset.visibility === "private" && parsed.data.publicUrl) return res.status(400).json({ message: "Private text tracks cannot expose a public URL" });
    const track = await db.transaction(async (tx) => {
      if (parsed.data.isDefault) await tx.update(mediaTextTracks).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(mediaTextTracks.assetId, asset.id), eq(mediaTextTracks.kind, parsed.data.kind)));
      const [saved] = await tx.insert(mediaTextTracks).values({ assetId: asset.id, ownerUserId: req.dbUser!.id, ...parsed.data }).onConflictDoUpdate({ target: [mediaTextTracks.assetId, mediaTextTracks.kind, mediaTextTracks.language], set: { ...parsed.data, status: "ready", updatedAt: new Date() } }).returning();
      return saved;
    });
    return res.status(201).json(track);
  }));

  app.post("/api/media/assets/:id/lineage", attachUser, safe(async (req, res) => {
    const parsed = createMediaLineageSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const child = await ownedAsset(req.dbUser!.id, req.params.id);
    const parent = await ownedAsset(req.dbUser!.id, parsed.data.parentAssetId);
    if (!child || !parent) return res.status(404).json({ message: "Both lineage assets must belong to you" });
    if (child.id === parent.id) return res.status(400).json({ message: "An asset cannot derive from itself" });
    const edge = await registerAssetLineage({ childAssetId: child.id, parentAssetId: parent.id, relationship: parsed.data.relationship, createdByUserId: req.dbUser!.id, metadata: parsed.data.metadata });
    return res.status(edge ? 201 : 200).json(edge ?? { parentAssetId: parent.id, childAssetId: child.id, relationship: parsed.data.relationship, status: "already_exists" });
  }));

  app.post("/api/media/assets/:id/tags", attachUser, safe(async (req, res) => {
    const parsed = assetTagSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const [created] = await db.insert(assetTags).values({ assetId: asset.id, ownerUserId: req.dbUser!.id, tag: parsed.data.tag }).onConflictDoNothing().returning();
    if (created) return res.status(201).json(created);
    const [existing] = await db.select().from(assetTags).where(and(eq(assetTags.assetId, asset.id), eq(assetTags.tag, parsed.data.tag))).limit(1);
    return res.json(existing);
  }));

  app.delete("/api/media/assets/:id/tags/:tag", attachUser, safe(async (req, res) => {
    const parsed = assetTagSchema.safeParse({ tag: req.params.tag });
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    await db.delete(assetTags).where(and(eq(assetTags.assetId, asset.id), eq(assetTags.ownerUserId, req.dbUser!.id), eq(assetTags.tag, parsed.data.tag)));
    return res.status(204).end();
  }));

  app.post("/api/media/assets/:id/rights", attachUser, safe(async (req, res) => {
    const parsed = createAssetRightSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    if (parsed.data.evidenceAssetId) {
      const evidence = await ownedAsset(req.dbUser!.id, parsed.data.evidenceAssetId);
      if (!evidence) return res.status(404).json({ message: "Rights evidence asset not found" });
    }
    const [right] = await db.insert(assetRights).values({ assetId: asset.id, ownerUserId: req.dbUser!.id, ...parsed.data }).returning();
    return res.status(201).json(right);
  }));

  app.patch("/api/media/assets/:id/rights/:rightId", attachUser, safe(async (req, res) => {
    const parsed = updateAssetRightSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    if (parsed.data.evidenceAssetId) {
      const evidence = await ownedAsset(req.dbUser!.id, parsed.data.evidenceAssetId);
      if (!evidence) return res.status(404).json({ message: "Rights evidence asset not found" });
    }
    const [right] = await db.update(assetRights).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(assetRights.id, req.params.rightId), eq(assetRights.assetId, asset.id), eq(assetRights.ownerUserId, req.dbUser!.id))).returning();
    if (!right) return res.status(404).json({ message: "Rights record not found" });
    return res.json(right);
  }));

  app.post("/api/media/assets/:id/rights/:rightId/status", attachUser, safe(async (req, res) => {
    const parsed = z.object({ status: z.enum(["active", "revoked", "disputed", "expired"]) }).safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const [right] = await db.update(assetRights).set({ status: parsed.data.status, revokedAt: parsed.data.status === "revoked" ? new Date() : null, updatedAt: new Date() }).where(and(eq(assetRights.id, req.params.rightId), eq(assetRights.assetId, asset.id), eq(assetRights.ownerUserId, req.dbUser!.id))).returning();
    if (!right) return res.status(404).json({ message: "Rights record not found" });
    if (["revoked", "disputed", "expired"].includes(parsed.data.status)) {
      const descendantsResult = await db.execute(sql`with recursive descendants(id) as (select child_asset_id from asset_lineage_edges where parent_asset_id = ${asset.id} union select edge.child_asset_id from asset_lineage_edges edge join descendants prior on edge.parent_asset_id = prior.id) select id from descendants`); const descendantIds = (Array.from(descendantsResult) as unknown as Array<{ id: string }>).map((row) => row.id); const affectedAssetIds = [asset.id, ...descendantIds]; const now = new Date();
      await db.update(assetRights).set({ status: parsed.data.status, revokedAt: parsed.data.status === "revoked" ? now : null, updatedAt: now }).where(inArray(assetRights.assetId, affectedAssetIds));
      await db.update(assetUsageRecords).set({ state: "blocked", endedAt: now, updatedAt: now }).where(and(inArray(assetUsageRecords.assetId, affectedAssetIds), eq(assetUsageRecords.state, "active")));
    }
    return res.json(right);
  }));

  app.get("/api/media/collections", attachUser, safe(async (req, res) => {
    const rows = await db.select({ collection: assetCollections, itemCount: sql<number>`count(${assetCollectionItems.id})::int` }).from(assetCollections).leftJoin(assetCollectionItems, eq(assetCollectionItems.collectionId, assetCollections.id)).where(eq(assetCollections.ownerUserId, req.dbUser!.id)).groupBy(assetCollections.id).orderBy(desc(assetCollections.updatedAt));
    return res.json(rows.map((row) => ({ ...row.collection, itemCount: row.itemCount })));
  }));

  app.post("/api/media/collections", attachUser, safe(async (req, res) => {
    const parsed = createAssetCollectionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const business = req.body?.businessId ? null : await ensureDefaultBusiness(req.dbUser!);
    const businessId = typeof req.body?.businessId === "string" ? req.body.businessId : business!.id;
    if (!uuidSchema.safeParse(businessId).success || !(await userCanManageBusiness(req.dbUser!.id, businessId))) return res.status(403).json({ message: "You do not have access to that business" });
    const [collection] = await db.insert(assetCollections).values({ ownerUserId: req.dbUser!.id, businessId, ...parsed.data }).returning();
    return res.status(201).json(collection);
  }));

  app.patch("/api/media/collections/:id", attachUser, safe(async (req, res) => {
    const parsed = updateAssetCollectionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    if (!Object.keys(parsed.data).length) return res.status(400).json({ message: "No collection changes were supplied" });
    const [collection] = await db.update(assetCollections).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(assetCollections.id, req.params.id), eq(assetCollections.ownerUserId, req.dbUser!.id))).returning();
    if (!collection) return res.status(404).json({ message: "Collection not found" });
    return res.json(collection);
  }));

  app.delete("/api/media/collections/:id", attachUser, safe(async (req, res) => {
    const deleted = await db.delete(assetCollections).where(and(eq(assetCollections.id, req.params.id), eq(assetCollections.ownerUserId, req.dbUser!.id))).returning({ id: assetCollections.id });
    if (!deleted.length) return res.status(404).json({ message: "Collection not found" });
    return res.status(204).end();
  }));

  app.post("/api/media/collections/:id/assets/:assetId", attachUser, safe(async (req, res) => {
    const [[collection], asset] = await Promise.all([
      db.select().from(assetCollections).where(and(eq(assetCollections.id, req.params.id), eq(assetCollections.ownerUserId, req.dbUser!.id))).limit(1),
      ownedAsset(req.dbUser!.id, req.params.assetId),
    ]);
    if (!collection || !asset) return res.status(404).json({ message: "Collection or asset not found" });
    const [item] = await db.insert(assetCollectionItems).values({ collectionId: collection.id, assetId: asset.id, addedByUserId: req.dbUser!.id }).onConflictDoNothing().returning();
    await db.update(assetCollections).set({ updatedAt: new Date() }).where(eq(assetCollections.id, collection.id));
    return res.status(item ? 201 : 200).json(item ?? { collectionId: collection.id, assetId: asset.id, status: "already_added" });
  }));

  app.delete("/api/media/collections/:id/assets/:assetId", attachUser, safe(async (req, res) => {
    const [collection] = await db.select({ id: assetCollections.id }).from(assetCollections).where(and(eq(assetCollections.id, req.params.id), eq(assetCollections.ownerUserId, req.dbUser!.id))).limit(1);
    if (!collection) return res.status(404).json({ message: "Collection not found" });
    await db.delete(assetCollectionItems).where(and(eq(assetCollectionItems.collectionId, collection.id), eq(assetCollectionItems.assetId, req.params.assetId)));
    await db.update(assetCollections).set({ updatedAt: new Date() }).where(eq(assetCollections.id, collection.id));
    return res.status(204).end();
  }));

  app.post("/api/media/playback/sessions", attachUser, safe(async (req, res) => {
    noStore(res);
    const parsed = createPlaybackSessionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const asset = await accessibleAsset(req.dbUser!.id, parsed.data.assetId);
    if (!asset) return res.status(404).json({ message: "Playable asset not found" });
    const renditions = await db.select().from(mediaRenditions).where(and(eq(mediaRenditions.assetId, asset.id), eq(mediaRenditions.status, "ready"))).orderBy(asc(mediaRenditions.bitrateKbps));
    const rendition = parsed.data.renditionId
      ? renditions.find((item) => item.id === parsed.data.renditionId)
      : renditions.find((item) => item.role === "adaptive_manifest") ?? renditions.find((item) => item.role === "video" || item.role === "audio") ?? null;
    if (parsed.data.renditionId && !rendition) return res.status(400).json({ message: "Rendition does not belong to this asset" });
    const [created] = await db.insert(mediaPlaybackSessions).values({ assetId: asset.id, renditionId: rendition?.id ?? null, viewerUserId: req.dbUser!.id, clientSessionId: parsed.data.clientSessionId, playerVersion: parsed.data.playerVersion, metadata: parsed.data.metadata }).onConflictDoNothing().returning();
    const session = created ?? (await db.select().from(mediaPlaybackSessions).where(and(eq(mediaPlaybackSessions.viewerUserId, req.dbUser!.id), eq(mediaPlaybackSessions.clientSessionId, parsed.data.clientSessionId))).limit(1))[0];
    if (!session || session.assetId !== asset.id) return res.status(409).json({ message: "Playback session identity is already in use" });
    const tracks = await db.select().from(mediaTextTracks).where(and(eq(mediaTextTracks.assetId, asset.id), eq(mediaTextTracks.status, "ready"))).orderBy(desc(mediaTextTracks.isDefault), asc(mediaTextTracks.language));
    const access = await deliveryUrl(asset, rendition);
    const renditionAccess = await Promise.all(renditions.map(async (item) => ({
      rendition: item,
      access: await deliveryUrl(asset, item),
    })));
    const deliveredTracks = await Promise.all(tracks.map((track) => textTrackDelivery(asset, track)));
    return res.status(created ? 201 : 200).json({ session, asset, rendition, renditions, renditionAccess, textTracks: deliveredTracks, access });
  }));

  app.post("/api/media/playback/sessions/:id/events", attachUser, safe(async (req, res) => {
    noStore(res);
    const parsed = recordPlaybackEventSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const now = Date.now();
    if (parsed.data.occurredAt.getTime() < now - 24 * 60 * 60 * 1_000 || parsed.data.occurredAt.getTime() > now + 5 * 60 * 1_000) return res.status(400).json({ message: "Playback event time is outside the accepted window" });
    const session = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(mediaPlaybackSessions).where(and(eq(mediaPlaybackSessions.id, req.params.id), eq(mediaPlaybackSessions.viewerUserId, req.dbUser!.id))).limit(1);
      if (!current) return null;
      const [inserted] = await tx.insert(mediaPlaybackEvents).values({ sessionId: current.id, ...parsed.data }).onConflictDoNothing().returning({ id: mediaPlaybackEvents.id });
      if (!inserted) return current;
      const delta = playbackSessionDelta({ previousKind: current.lastEventKind, kind: parsed.data.kind, positionMs: parsed.data.positionMs, previousPositionMs: current.lastPositionMs });
      const rebufferMs = parsed.data.kind === "rebuffer_end" && current.lastEventKind === "rebuffer_start" && current.lastEventAt
        ? Math.max(0, Math.min(120_000, parsed.data.occurredAt.getTime() - current.lastEventAt.getTime()))
        : 0;
      const [updated] = await tx.update(mediaPlaybackSessions).set({
        state: parsed.data.kind === "ended" ? "ended" : current.state,
        watchMs: current.watchMs + delta.watchMs,
        lastPositionMs: parsed.data.positionMs,
        lastEventKind: parsed.data.kind,
        lastEventAt: parsed.data.occurredAt,
        rebufferCount: current.rebufferCount + delta.rebufferCount,
        rebufferMs: current.rebufferMs + rebufferMs,
        qualityChangeCount: current.qualityChangeCount + (parsed.data.kind === "quality_change" ? 1 : 0),
        errorCount: current.errorCount + delta.errorCount,
        endedAt: parsed.data.kind === "ended" ? parsed.data.occurredAt : current.endedAt,
        updatedAt: new Date(),
      }).where(eq(mediaPlaybackSessions.id, current.id)).returning();
      return updated;
    });
    if (!session) return res.status(404).json({ message: "Playback session not found" });
    return res.status(202).json(session);
  }));

  app.get("/api/media/assets/:id/playback-analytics", attachUser, safe(async (req, res) => {
    const asset = await ownedAsset(req.dbUser!.id, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const [summary] = await db.select({
      sessions: sql<number>`count(*)::int`,
      uniqueViewers: sql<number>`count(distinct ${mediaPlaybackSessions.viewerUserId})::int`,
      watchMs: sql<number>`coalesce(sum(${mediaPlaybackSessions.watchMs}), 0)::bigint`,
      completed: sql<number>`count(*) filter (where ${mediaPlaybackSessions.state} = 'ended')::int`,
      rebufferCount: sql<number>`coalesce(sum(${mediaPlaybackSessions.rebufferCount}), 0)::bigint`,
      rebufferMs: sql<number>`coalesce(sum(${mediaPlaybackSessions.rebufferMs}), 0)::bigint`,
      errors: sql<number>`coalesce(sum(${mediaPlaybackSessions.errorCount}), 0)::bigint`,
    }).from(mediaPlaybackSessions).where(eq(mediaPlaybackSessions.assetId, asset.id));
    const sessions = Number(summary?.sessions ?? 0);
    const watchMs = Number(summary?.watchMs ?? 0);
    const rebufferMs = Number(summary?.rebufferMs ?? 0);
    return res.json({
      ...summary,
      sessions,
      watchMs,
      rebufferMs,
      completionRate: sessions ? Number(summary?.completed ?? 0) / sessions : 0,
      rebufferRatio: watchMs + rebufferMs ? rebufferMs / (watchMs + rebufferMs) : 0,
    });
  }));
}
