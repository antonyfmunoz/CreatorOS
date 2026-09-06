import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express, Request } from "express";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { cutLocalNodeClaimSchema, cutLocalNodeHeartbeatSchema, cutLocalNodeJobCompletionSchema, cutLocalNodeJobFailureSchema, cutLocalNodeJobHeartbeatSchema } from "@shared/cut-node";
import { assets, cutStudioJobs, cutStudioLocalNodeInvitations, cutStudioLocalNodes, cutStudioProjectMedia, cutStudioProjects } from "@shared/schema";
import { attachUser } from "./auth";
import { createDirectUpload, createPrivateAssetReadUrl, inspectDirectUpload, materializePrivateAsset, removeStoredAsset, sealPrivateAssetCopy } from "./asset-storage";
import { ensureDefaultBusiness } from "./businesses";
import { withCutJobLeaseWrite } from "./cut-job-publication";
import { db } from "./db";
import { queueMediaIngestJobs, registerAssetLineage } from "./media-cloud";
import { emitProjectionEvent } from "./umh";

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const safe = (node: typeof cutStudioLocalNodes.$inferSelect) => { const { deviceSecretHash: _secret, ...value } = node; return value; };
async function authenticated(req: Request) {
  const token = req.header("authorization")?.match(/^Bearer\s+([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (!token) return null;
  const [node] = await db.select().from(cutStudioLocalNodes).where(and(eq(cutStudioLocalNodes.deviceSecretHash, hash(token)), isNull(cutStudioLocalNodes.revokedAt))).limit(1);
  return node ?? null;
}

const localLeaseMs = 5 * 60_000;
const outputDescriptor = (runtime: Record<string, unknown>) => {
  if (runtime.mode === "sequence") return { format: "zip", mimeType: "application/zip", filename: "cutstudio-code-render.zip", assetKind: "file" };
  const format = typeof runtime.format === "string" ? runtime.format : runtime.mode === "video" ? "mp4" : "png";
  const allowed = new Map([
    ["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"],
    ["mp4", "video/mp4"], ["webm", "video/webm"], ["gif", "image/gif"],
  ]);
  const mimeType = allowed.get(format);
  if (!mimeType) throw new Error("The queued job does not have a supported output format");
  return { format, mimeType, filename: `cutstudio-code-render.${format}`, assetKind: runtime.mode === "video" ? "video" : "image" };
};

function codeRenderRequest(job: typeof cutStudioJobs.$inferSelect) {
  const candidate = job.request?.codeRender;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const value = candidate as Record<string, unknown>;
  if (typeof value.sourceAssetId !== "string" || typeof value.lockfileAssetId !== "string" || typeof value.compositionId !== "string" || typeof value.entrypoint !== "string" || !value.runtime || typeof value.runtime !== "object" || Array.isArray(value.runtime) || !value.limits || typeof value.limits !== "object" || Array.isArray(value.limits)) return null;
  return {
    sourceAssetId: value.sourceAssetId,
    lockfileAssetId: value.lockfileAssetId,
    compositionId: value.compositionId,
    entrypoint: value.entrypoint,
    runtime: value.runtime as Record<string, unknown>,
    limits: value.limits as Record<string, unknown>,
  };
}

async function locallyOwnedLease(node: typeof cutStudioLocalNodes.$inferSelect, jobId: string, leaseToken: string) {
  const [job] = await db.select().from(cutStudioJobs).where(and(
    eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.kind, "code_render"), eq(cutStudioJobs.ownerUserId, node.ownerUserId),
    eq(cutStudioJobs.workerId, `cut-local-node:${node.id}`), eq(cutStudioJobs.leaseToken, leaseToken),
  )).limit(1);
  return job ?? null;
}

export function registerCutLocalNodeRoutes(app: Express) {
  app.get("/api/cut/nodes", attachUser, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const nodes = await db.select().from(cutStudioLocalNodes).where(eq(cutStudioLocalNodes.ownerUserId, req.dbUser!.id)).orderBy(desc(cutStudioLocalNodes.updatedAt));
    res.json({ nodes: nodes.map(safe) });
  });
  app.post("/api/cut/nodes/invitations", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await db.transaction(async tx => {
      await tx.delete(cutStudioLocalNodeInvitations).where(and(eq(cutStudioLocalNodeInvitations.ownerUserId, req.dbUser!.id), lt(cutStudioLocalNodeInvitations.expiresAt, new Date())));
      await tx.insert(cutStudioLocalNodeInvitations).values({ ownerUserId: req.dbUser!.id, businessId: business.id, tokenHash: hash(token), expiresAt });
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.status(201).json({ token, expiresAt });
  });
  app.post("/api/cut/nodes/claim", async (req, res) => {
    const parsed = cutLocalNodeClaimSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid local node claim" });
    const now = new Date(); const secret = crypto.randomBytes(32).toString("base64url");
    const node = await db.transaction(async tx => {
      const [invite] = await tx.select().from(cutStudioLocalNodeInvitations).where(and(eq(cutStudioLocalNodeInvitations.tokenHash, hash(parsed.data.token)), isNull(cutStudioLocalNodeInvitations.consumedAt), gt(cutStudioLocalNodeInvitations.expiresAt, now))).limit(1);
      if (!invite) return null;
      const consumed = await tx.update(cutStudioLocalNodeInvitations).set({ consumedAt: now }).where(and(eq(cutStudioLocalNodeInvitations.id, invite.id), isNull(cutStudioLocalNodeInvitations.consumedAt))).returning({ id: cutStudioLocalNodeInvitations.id });
      if (!consumed.length) return null;
      const [created] = await tx.insert(cutStudioLocalNodes).values({ ownerUserId: invite.ownerUserId, businessId: invite.businessId, name: parsed.data.name, capabilities: parsed.data.capabilities, deviceSecretHash: hash(secret), lastSeenAt: now }).returning();
      return created;
    });
    if (!node) return res.status(410).json({ message: "This pairing code is invalid, expired, or already used" });
    res.setHeader("Cache-Control", "no-store"); res.status(201).json({ node: safe(node), credential: secret });
  });
  app.post("/api/cut/nodes/:id/heartbeat", async (req, res) => {
    const node = await authenticated(req); if (!node || node.id !== req.params.id) return res.status(401).json({ message: "Local-node authentication failed" });
    const parsed = cutLocalNodeHeartbeatSchema.safeParse(req.body ?? {}); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    // A running lease owns the node. An out-of-band heartbeat cannot make it
    // ready again and permit a second concurrent local render.
    const readyGuard = parsed.data.status === "ready" ? sql`not exists (
      select 1 from ${cutStudioJobs}
      where ${cutStudioJobs.workerId} = ${`cut-local-node:${node.id}`}
        and ${cutStudioJobs.state} = 'running'
        and ${cutStudioJobs.leaseExpiresAt} > clock_timestamp()
    )` : sql`true`;
    const [updated] = await db.update(cutStudioLocalNodes).set({ status: parsed.data.status, lastSequence: parsed.data.sequence, lastSeenAt: new Date(), updatedAt: new Date() }).where(and(eq(cutStudioLocalNodes.id, node.id), lt(cutStudioLocalNodes.lastSequence, parsed.data.sequence), isNull(cutStudioLocalNodes.revokedAt), readyGuard)).returning();
    if (!updated) return res.status(409).json({ message: parsed.data.status === "ready" ? "This node still owns an active local render lease" : "A newer node heartbeat was already accepted" }); res.json({ node: safe(updated) });
  });
  app.post("/api/cut/nodes/jobs/claim", async (req, res) => {
    const node = await authenticated(req);
    if (!node) return res.status(401).json({ message: "Local-node authentication failed" });
    if (node.status !== "ready" || !node.capabilities.isolatedCode || !node.capabilities.docker) return res.status(409).json({ message: "This node is not ready for isolated code execution" });
    const [candidateRow] = await db.select({ job: cutStudioJobs }).from(cutStudioJobs).innerJoin(cutStudioProjects, eq(cutStudioProjects.id, cutStudioJobs.projectId)).where(and(
      eq(cutStudioJobs.ownerUserId, node.ownerUserId), eq(cutStudioProjects.businessId, node.businessId), eq(cutStudioJobs.kind, "code_render"), eq(cutStudioJobs.state, "queued"),
      isNull(cutStudioJobs.cancellationRequestedAt), lt(cutStudioJobs.attempt, cutStudioJobs.maxAttempts),
    )).orderBy(cutStudioJobs.createdAt).limit(1);
    const candidate = candidateRow?.job;
    if (!candidate) return res.status(204).end();
    const request = codeRenderRequest(candidate);
    if (!request) return res.status(409).json({ message: "The queued code-render request is invalid" });
    let descriptor: ReturnType<typeof outputDescriptor>;
    let sources: Array<{ id: string; storageKey: string; originalFilename: string | null }>;
    let output: Awaited<ReturnType<typeof createDirectUpload>>;
    try {
      descriptor = outputDescriptor(request.runtime);
      sources = await db.select({ id: assets.id, storageKey: assets.storageKey, originalFilename: assets.originalFilename }).from(assets).where(and(
        inArray(assets.id, [request.sourceAssetId, request.lockfileAssetId]), eq(assets.ownerUserId, node.ownerUserId), eq(assets.businessId, node.businessId), eq(assets.visibility, "private"), eq(assets.status, "ready"),
      ));
      if (sources.length !== 2) throw new Error("The source capsule is no longer available");
      output = await createDirectUpload(node.ownerUserId, "cut-code-render", descriptor.filename, descriptor.mimeType, "private");
    } catch (error) {
      return res.status(503).json({ message: error instanceof Error ? error.message : "Private source delivery is not configured" });
    }
    const leaseToken = crypto.randomUUID();
    const job = await db.transaction(async tx => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      const now = sql`clock_timestamp() AT TIME ZONE 'UTC'`;
      // The status transition is a per-node work lock. This enforces the
      // one-job capability server-side rather than trusting the local CLI.
      const [busyNode] = await tx.update(cutStudioLocalNodes).set({ status: "busy", lastSeenAt: new Date(), updatedAt: new Date() }).where(and(eq(cutStudioLocalNodes.id, node.id), eq(cutStudioLocalNodes.status, "ready"), isNull(cutStudioLocalNodes.revokedAt))).returning({ id: cutStudioLocalNodes.id });
      if (!busyNode) return null;
      const [claimed] = await tx.update(cutStudioJobs).set({
        state: "running", attempt: sql`${cutStudioJobs.attempt} + 1`, detail: "Claimed by paired local node", progress: 0.05,
        workerId: `cut-local-node:${node.id}`, workerRegion: "local-device", leaseToken,
        leaseExpiresAt: sql`(${now}) + ${localLeaseMs} * interval '1 millisecond'`, heartbeatAt: now, startedAt: now, finishedAt: null, errorCode: null,
        output: { ...candidate.output, localNode: { temporaryStorageKey: output.storageKey, mimeType: descriptor.mimeType, filename: descriptor.filename } },
      }).where(and(eq(cutStudioJobs.id, candidate.id), eq(cutStudioJobs.state, "queued"), isNull(cutStudioJobs.cancellationRequestedAt), lt(cutStudioJobs.attempt, cutStudioJobs.maxAttempts))).returning();
      if (!claimed) await tx.update(cutStudioLocalNodes).set({ status: "ready", updatedAt: new Date() }).where(and(eq(cutStudioLocalNodes.id, node.id), eq(cutStudioLocalNodes.status, "busy"), isNull(cutStudioLocalNodes.revokedAt)));
      return claimed ?? null;
    });
    if (!job) return res.status(204).end();
    const sourceById = new Map(sources.map(source => [source.id, source]));
    try {
      const [source, lockfile] = await Promise.all([createPrivateAssetReadUrl(sourceById.get(request.sourceAssetId)!.storageKey), createPrivateAssetReadUrl(sourceById.get(request.lockfileAssetId)!.storageKey)]);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        job: { id: job.id, projectId: job.projectId, compositionId: request.compositionId, runtime: request.runtime, limits: request.limits },
        lease: { token: leaseToken, expiresAt: job.leaseExpiresAt },
        source: { archive: source, lockfile, entrypoint: request.entrypoint },
        output: { storageKey: output.storageKey, uploadUrl: output.uploadUrl, expiresAt: output.expiresAt, mimeType: descriptor.mimeType, filename: descriptor.filename },
      });
    } catch {
      await withCutJobLeaseWrite(job.id, leaseToken, transaction => transaction.update(cutStudioJobs).set({ state: "error", detail: "Private source delivery was unavailable", errorCode: "local_node_source_unavailable", leaseExpiresAt: null, finishedAt: new Date() }).where(eq(cutStudioJobs.id, job.id)));
      await db.update(cutStudioLocalNodes).set({ status: "ready", updatedAt: new Date() }).where(and(eq(cutStudioLocalNodes.id, node.id), isNull(cutStudioLocalNodes.revokedAt))).catch(() => undefined);
      res.status(503).json({ message: "Private source delivery is not configured" });
    }
  });
  app.post("/api/cut/nodes/jobs/:id/heartbeat", async (req, res) => {
    const node = await authenticated(req); if (!node) return res.status(401).json({ message: "Local-node authentication failed" });
    const parsed = cutLocalNodeJobHeartbeatSchema.safeParse(req.body ?? {}); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const job = await locallyOwnedLease(node, req.params.id, parsed.data.leaseToken); if (!job) return res.status(404).json({ message: "Local code-render lease not found" });
    const live = await withCutJobLeaseWrite(job.id, parsed.data.leaseToken, transaction => transaction.update(cutStudioJobs).set({
      heartbeatAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`, leaseExpiresAt: sql`(clock_timestamp() AT TIME ZONE 'UTC') + ${localLeaseMs} * interval '1 millisecond'`,
      ...(parsed.data.progress === undefined ? {} : { progress: parsed.data.progress }), ...(parsed.data.detail ? { detail: parsed.data.detail } : {}),
    }).where(and(eq(cutStudioJobs.id, job.id), eq(cutStudioJobs.workerId, `cut-local-node:${node.id}`))).returning({ leaseExpiresAt: cutStudioJobs.leaseExpiresAt }));
    if (!live?.length) return res.status(409).json({ message: "The local code-render lease is no longer active" });
    res.json({ status: "running", leaseExpiresAt: live[0].leaseExpiresAt });
  });
  app.post("/api/cut/nodes/jobs/:id/fail", async (req, res) => {
    const node = await authenticated(req); if (!node) return res.status(401).json({ message: "Local-node authentication failed" });
    const parsed = cutLocalNodeJobFailureSchema.safeParse(req.body ?? {}); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const job = await locallyOwnedLease(node, req.params.id, parsed.data.leaseToken); if (!job) return res.status(404).json({ message: "Local code-render lease not found" });
    const failed = await withCutJobLeaseWrite(job.id, parsed.data.leaseToken, transaction => transaction.update(cutStudioJobs).set({ state: "error", detail: parsed.data.detail, errorCode: parsed.data.code, progress: 0, leaseExpiresAt: null, heartbeatAt: new Date(), finishedAt: new Date() }).where(and(eq(cutStudioJobs.id, job.id), eq(cutStudioJobs.workerId, `cut-local-node:${node.id}`))).returning({ id: cutStudioJobs.id }));
    if (!failed?.length) return res.status(409).json({ message: "The local code-render lease is no longer active" });
    await db.update(cutStudioLocalNodes).set({ status: "ready", updatedAt: new Date() }).where(and(eq(cutStudioLocalNodes.id, node.id), isNull(cutStudioLocalNodes.revokedAt))).catch(() => undefined);
    await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: job.projectId, eventType: "cutstudio.code_render.failed", actorUserId: node.ownerUserId, payload: { jobId: job.id, nodeId: node.id, code: parsed.data.code }, idempotencyKey: `cutstudio:${job.id}:code-render.failed` });
    res.status(204).end();
  });
  app.post("/api/cut/nodes/jobs/:id/complete", async (req, res) => {
    const node = await authenticated(req); if (!node) return res.status(401).json({ message: "Local-node authentication failed" });
    const parsed = cutLocalNodeJobCompletionSchema.safeParse(req.body ?? {}); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const job = await locallyOwnedLease(node, req.params.id, parsed.data.leaseToken); if (!job) return res.status(404).json({ message: "Local code-render lease not found" });
    const request = codeRenderRequest(job);
    const localOutput = job.output?.localNode;
    const temporaryStorageKey = localOutput && typeof localOutput === "object" && !Array.isArray(localOutput) && typeof (localOutput as Record<string, unknown>).temporaryStorageKey === "string" ? (localOutput as Record<string, unknown>).temporaryStorageKey : null;
    if (!request || !temporaryStorageKey || parsed.data.storageKey !== temporaryStorageKey) return res.status(400).json({ message: "The submitted output does not belong to this lease" });
    let descriptor: ReturnType<typeof outputDescriptor>;
    let inspected: Awaited<ReturnType<typeof inspectDirectUpload>>;
    try {
      descriptor = outputDescriptor(request.runtime);
      if (parsed.data.filename !== descriptor.filename) throw new Error("The output filename does not match the queued render");
      inspected = await inspectDirectUpload(temporaryStorageKey, "private");
      const maximumOutputBytes = Number(request.limits.maximumOutputBytes);
      if (!Number.isSafeInteger(maximumOutputBytes) || inspected.sizeBytes < 1 || inspected.sizeBytes > maximumOutputBytes) throw new Error("The uploaded output exceeds the approved size limit");
      if (inspected.mimeType.toLowerCase() !== descriptor.mimeType) throw new Error("The uploaded output type does not match the queued render");
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "The output cannot be verified" });
    }
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-local-code-receipt-"));
    let sealed: Awaited<ReturnType<typeof sealPrivateAssetCopy>> | null = null;
    try {
      const downloaded = path.join(temporaryDirectory, "output");
      await materializePrivateAsset(temporaryStorageKey, downloaded);
      const digest = crypto.createHash("sha256");
      for await (const chunk of createReadStream(downloaded)) digest.update(chunk);
      if (digest.digest("hex") !== parsed.data.sha256) return res.status(400).json({ message: "The uploaded output checksum could not be verified" });
      sealed = await sealPrivateAssetCopy({ storageKey: temporaryStorageKey, ownerUserId: node.ownerUserId, kind: "cut-code-render", filename: parsed.data.filename, mimeType: descriptor.mimeType });
      if (sealed.sizeBytes !== inspected.sizeBytes) throw new Error("The sealed output size could not be verified");
      const accepted = await withCutJobLeaseWrite(job.id, parsed.data.leaseToken, async transaction => {
        const [artifact] = await transaction.insert(assets).values({
          ownerUserId: node.ownerUserId, businessId: node.businessId, kind: descriptor.assetKind, storageProvider: "r2", storageKey: sealed!.storageKey,
          publicUrl: null, mimeType: descriptor.mimeType, sizeBytes: sealed!.sizeBytes, visibility: "private", status: "ready", originalFilename: parsed.data.filename,
          sha256: parsed.data.sha256, metadata: { cutStudioProjectId: job.projectId, cutStudioJobId: job.id, cutStudioCompositionId: request.compositionId, execution: "paired_local_node", nodeId: node.id },
        }).returning();
        const [completed] = await transaction.update(cutStudioJobs).set({ state: "done", detail: "Local isolated render ready", progress: 1, artifactAssetId: artifact.id, output: { artifactId: artifact.id, filename: parsed.data.filename, mimeType: descriptor.mimeType, sizeBytes: sealed!.sizeBytes, execution: "paired_local_node", nodeId: node.id }, leaseExpiresAt: null, heartbeatAt: new Date(), finishedAt: new Date() }).where(and(eq(cutStudioJobs.id, job.id), eq(cutStudioJobs.workerId, `cut-local-node:${node.id}`))).returning({ id: cutStudioJobs.id });
        if (!completed) return null;
        // A video or still is immediately reusable by the project. A frame
        // sequence remains a sealed ZIP artifact instead of being mislabeled as
        // timeline media the browser cannot preview.
        if (descriptor.assetKind === "video" || descriptor.assetKind === "image") {
          const runtime = request.runtime;
          const fps = Number(runtime.fps);
          const range = Array.isArray(runtime.frameRange) ? runtime.frameRange : null;
          const frames = range && Number.isInteger(range[0]) && Number.isInteger(range[1]) ? Number(range[1]) - Number(range[0]) + 1 : 1;
          const duration = Number.isFinite(fps) && fps > 0 ? Math.max(1 / fps, frames / fps) : 1;
          await transaction.insert(cutStudioProjectMedia).values({ projectId: job.projectId, assetId: artifact.id, ownerUserId: node.ownerUserId, name: parsed.data.filename, mediaKind: descriptor.assetKind, duration }).onConflictDoNothing();
        }
        await transaction.update(cutStudioLocalNodes).set({ status: "ready", updatedAt: new Date() }).where(and(eq(cutStudioLocalNodes.id, node.id), isNull(cutStudioLocalNodes.revokedAt)));
        return artifact;
      });
      if (!accepted) {
        await removeStoredAsset(sealed.storageKey, "private").catch(() => undefined);
        sealed = null;
        return res.status(409).json({ message: "The local code-render lease is no longer active" });
      }
      // The sealed object is now durably owned by the accepted artifact. Media
      // indexing and projection-event delivery are follow-on work and must not
      // turn a committed render into an orphan by triggering cleanup below.
      sealed = null;
      await Promise.all([
        ...(descriptor.assetKind === "video" ? [queueMediaIngestJobs(accepted)] : []),
        registerAssetLineage({ parentAssetId: request.sourceAssetId, childAssetId: accepted.id, relationship: "derived_from", createdByUserId: node.ownerUserId, metadata: { instrument: "cutstudio", jobId: job.id, nodeId: node.id } }),
      ]).catch(() => undefined);
      await emitProjectionEvent({ aggregateType: "cutstudio_project", aggregateId: job.projectId, eventType: "cutstudio.code_render.ready", actorUserId: node.ownerUserId, payload: { jobId: job.id, nodeId: node.id, artifactAssetId: accepted.id }, idempotencyKey: `cutstudio:${job.id}:code-render.ready` }).catch(() => undefined);
      res.status(201).json({ jobId: job.id, artifact: accepted });
    } catch (error) {
      if (sealed) await removeStoredAsset(sealed.storageKey, "private").catch(() => undefined);
      return res.status(500).json({ message: "The local output could not be sealed" });
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
      await removeStoredAsset(temporaryStorageKey, "private").catch(() => undefined);
    }
  });
  app.delete("/api/cut/nodes/:id", attachUser, async (req, res) => {
    const node = await db.transaction(async transaction => {
      const now = new Date();
      const [revoked] = await transaction.update(cutStudioLocalNodes).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(and(eq(cutStudioLocalNodes.id, req.params.id), eq(cutStudioLocalNodes.ownerUserId, req.dbUser!.id), isNull(cutStudioLocalNodes.revokedAt))).returning();
      if (!revoked) return null;
      // Revocation is immediate authority loss. The local child has no network
      // or platform credentials, but mark any durable lease terminal now so it
      // cannot be shown as running while its host is being stopped.
      await transaction.update(cutStudioJobs).set({ state: "cancelled", detail: "Cancelled because its local node was revoked", cancellationRequestedAt: now, leaseExpiresAt: null, heartbeatAt: now, finishedAt: now }).where(and(eq(cutStudioJobs.workerId, `cut-local-node:${revoked.id}`), eq(cutStudioJobs.state, "running")));
      return revoked;
    });
    if (!node) return res.status(404).json({ message: "Local node not found" }); res.status(204).end();
  });
}
