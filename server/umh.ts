import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  broadcastBrandKits, businesses, businessMembers, campaigns, channels, communityMemberships, communityRoomEvents, communityRooms, contentDrafts, creativeWorkApprovals, creativeWorkDependencies, creativeWorkEvents, creativeWorkItems, designProjectEvents, designProjects, designVersions, foundationInstrumentEvents, foundationInstrumentRevisions, foundationInstruments, posts, projectionEvents, umhApprovals, umhAuditRecords,
  umhCommandOutcomes, umhCommands, umhNonces, users,
} from "../shared/schema";
import {
  getCreativesOsCapabilityManifest, isApprovalRequired, type SupportedUmhCommandType,
  parseInboundUmhCommandEnvelope, UmhCommandEnvelopeSchema, type UmhCommandEnvelope, type UmhEventEnvelope,
} from "../shared/umh-contract";
import {
  createFoundationInstrumentSchema,
  foundationCommandSchema,
  foundationInstrumentStatusSchema,
  nextFoundationStatus,
  parseFoundationContent,
  reviseFoundationInstrumentSchema,
  type FoundationInstrumentKind,
} from "../shared/foundation-instruments";
import { createDesignProjectSchema, designDocumentSchema, saveDesignSchema } from "../shared/design-studio";
import { canTransitionCreativeWork, createCreativeWorkItemSchema, transitionCreativeWorkItemSchema, updateCreativeWorkItemSchema } from "../shared/planning";
import { db } from "./db";
import { attachUser } from "./auth";
import { userCanAdminBusiness, userCanManageBusiness } from "./businesses";
import { createUmhSignature, verifyUmhSignature } from "./umh-signing";

export { createUmhSignature, verifyUmhSignature } from "./umh-signing";

declare global { namespace Express { interface Request { rawBody?: Buffer; } } }

type DbExecutor = Pick<typeof db, "insert">;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const DELIVERY_LOCK_MS = 5 * 60 * 1000;
const DELIVERY_BATCH_SIZE = 20;

const contentDraftPayloadSchema = z.object({ content: z.string().max(20_000).default(""), kind: z.string().min(1).max(48).default("post"), audience: z.string().min(1).max(48).default("public"), scheduledFor: z.string().datetime().optional(), platformVariants: z.record(z.unknown()).default({}) });
const campaignPayloadSchema = z.object({ name: z.string().min(1).max(160), objective: z.enum(["awareness", "engagement", "traffic", "conversion", "creator_seeding", "community"]).default("awareness"), channel: z.enum(["organic", "paid", "creator_seeding", "owned"]).default("organic"), description: z.string().max(10_000).default(""), budgetCents: z.number().int().min(0).max(100_000_000).default(0), targeting: z.record(z.unknown()).default({}), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional() });
const postPublishPayloadSchema = z.object({ content: z.string().min(1).max(20_000), mediaType: z.enum(["text", "photo", "audio", "video"]).default("text"), imageUrl: z.string().url().optional(), audioUrl: z.string().url().optional(), videoUrl: z.string().url().optional() });
const instrumentRevisionPayloadSchema = reviseFoundationInstrumentSchema.extend({ instrumentId: z.string().uuid() });
const instrumentLifecyclePayloadSchema = foundationCommandSchema.extend({ instrumentId: z.string().uuid() });
const designCreatePayloadSchema = createDesignProjectSchema.extend({ document: designDocumentSchema });
const designRevisionPayloadSchema = saveDesignSchema.extend({ projectId: z.string().uuid() });
const taskRevisionPayloadSchema = updateCreativeWorkItemSchema.extend({ workItemId: z.string().uuid() });
const taskTransitionPayloadSchema = transitionCreativeWorkItemSchema.extend({ workItemId: z.string().uuid() });
const roomSchedulePayloadSchema = z.object({ communityId: z.number().int().positive(), channelId: z.number().int().positive().nullable().optional(), title: z.string().trim().min(1).max(160), description: z.string().max(10_000).default(""), startsAt: z.string().datetime(), provider: z.enum(["manual_link", "livekit"]).default("manual_link"), joinUrl: z.string().url().nullable().optional() });
const roomTransitionPayloadSchema = z.object({ roomId: z.string().uuid(), status: z.enum(["live", "ended", "canceled"]) });

export async function emitProjectionEvent(input: { aggregateType: string; aggregateId: string | number; eventType: string; actorUserId?: number | null; payload?: Record<string, unknown>; idempotencyKey: string; correlationId?: string | null; traceId?: string | null }, executor: DbExecutor = db) {
  // The disposable demo identity lives in MemStorage and deliberately has no
  // row in PostgreSQL. A demo mutation must therefore remain fully local and
  // must never attempt to enqueue a production integration event.
  if (process.env.CREATOROS_DEMO_MODE === "true") return null;
  const [event] = await executor.insert(projectionEvents).values({ projection: "creativesos", aggregateType: input.aggregateType, aggregateId: String(input.aggregateId), eventType: input.eventType, actorUserId: input.actorUserId ?? null, payload: input.payload ?? {}, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId ?? null, traceId: input.traceId ?? null }).onConflictDoNothing().returning();
  return event ?? null;
}

function integrationSecrets() { return { inbound: process.env.UMH_COMMAND_SIGNING_SECRET, outbound: process.env.UMH_EVENT_SIGNING_SECRET, ingestUrl: process.env.UMH_EVENT_INGEST_URL }; }
function retryAfter(attempt: number) { return new Date(Date.now() + Math.min(2 ** attempt, 300) * 1_000); }
function eventEnvelope(event: typeof projectionEvents.$inferSelect): UmhEventEnvelope {
  const businessId = typeof event.payload.businessId === "string" ? event.payload.businessId : null;
  return { schemaVersion: "umh.event.v1", eventId: event.id, projection: "creativesos", aggregateType: event.aggregateType, aggregateId: event.aggregateId, eventType: event.eventType, actorUserId: event.actorUserId, businessId, payload: event.payload, idempotencyKey: event.idempotencyKey, correlationId: event.correlationId, traceId: event.traceId, occurredAt: event.occurredAt.toISOString() };
}

async function claimPendingEvents() {
  const now = new Date(); const staleLock = new Date(now.getTime() - DELIVERY_LOCK_MS);
  const candidates = await db.select().from(projectionEvents).where(and(isNull(projectionEvents.deliveredAt), or(isNull(projectionEvents.nextDeliveryAt), lte(projectionEvents.nextDeliveryAt, now)), or(isNull(projectionEvents.deliveryLockedAt), lt(projectionEvents.deliveryLockedAt, staleLock)))).orderBy(projectionEvents.occurredAt).limit(DELIVERY_BATCH_SIZE);
  const claimed: typeof projectionEvents.$inferSelect[] = [];
  for (const candidate of candidates) {
    const [event] = await db.update(projectionEvents).set({ deliveryLockedAt: now }).where(and(eq(projectionEvents.id, candidate.id), isNull(projectionEvents.deliveredAt), or(isNull(projectionEvents.deliveryLockedAt), lt(projectionEvents.deliveryLockedAt, staleLock)))).returning();
    if (event) claimed.push(event);
  }
  return claimed;
}

/** Delivers a durable local outbox; CreativesOS remains fully functional while UMH is offline. */
export async function deliverPendingProjectionEvents() {
  const { outbound, ingestUrl } = integrationSecrets();
  if (!outbound || !ingestUrl) return { delivered: 0, failed: 0, skipped: true };
  const claimed = await claimPendingEvents(); let delivered = 0; let failed = 0;
  for (const event of claimed) {
    const body = JSON.stringify(eventEnvelope(event)); const timestamp = new Date().toISOString(); const nonce = crypto.randomUUID();
    try {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(ingestUrl, { method: "POST", headers: { "content-type": "application/json", "x-umh-timestamp": timestamp, "x-umh-nonce": nonce, "x-umh-signature": createUmhSignature(outbound, timestamp, nonce, body) }, body, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`UMH ingest returned ${response.status}`);
      await db.update(projectionEvents).set({ deliveredAt: new Date(), deliveryLockedAt: null, lastDeliveryError: null }).where(eq(projectionEvents.id, event.id)); delivered += 1;
    } catch (error) {
      const attempts = event.deliveryAttempts + 1; const message = error instanceof Error ? error.message.slice(0, 2_000) : "Unknown UMH delivery failure";
      await db.update(projectionEvents).set({ deliveryAttempts: attempts, nextDeliveryAt: retryAfter(attempts), deliveryLockedAt: null, lastDeliveryError: message }).where(eq(projectionEvents.id, event.id)); failed += 1;
    }
  }
  return { delivered, failed, skipped: false };
}

let deliveryTimer: ReturnType<typeof setInterval> | undefined;
export function scheduleUmhDelivery() {
  const { outbound, ingestUrl } = integrationSecrets(); if (!outbound || !ingestUrl || deliveryTimer) return;
  void deliverPendingProjectionEvents().catch((error) => console.error("UMH outbox delivery failed:", error));
  deliveryTimer = setInterval(() => void deliverPendingProjectionEvents().catch((error) => console.error("UMH outbox delivery failed:", error)), 30_000);
}

function commandCorrelationId(envelope: UmhCommandEnvelope) { return envelope.correlationId ?? envelope.commandId; }
async function audit(commandId: string | null, envelope: UmhCommandEnvelope, action: string, result: string, metadata: Record<string, unknown> = {}, executor: DbExecutor = db) { await executor.insert(umhAuditRecords).values({ commandId, action, result, businessId: envelope.businessId, actorUserId: envelope.delegatedUserId, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId, metadata }); }
async function outcome(commandId: string, envelope: UmhCommandEnvelope, status: string, detail: string, payload: Record<string, unknown> = {}, executor: DbExecutor = db) { await executor.insert(umhCommandOutcomes).values({ commandId, status, detail, payload, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }); }

async function rejectCommand(command: typeof umhCommands.$inferSelect, envelope: UmhCommandEnvelope, detail: string) {
  await db.transaction(async (tx) => {
    await tx.update(umhCommands).set({ status: "rejected", updatedAt: new Date() }).where(eq(umhCommands.id, command.id));
    await outcome(command.id, envelope, "rejected", detail, {}, tx);
    await audit(command.id, envelope, "command.rejected", "rejected", { detail }, tx);
  });
  return { status: "rejected", detail, commandId: command.commandId };
}

async function executeApprovedCommand(command: typeof umhCommands.$inferSelect, envelope: UmhCommandEnvelope) {
  try {
    const execution = await db.transaction(async (tx) => {
      let result: Record<string, unknown>;
      if (envelope.commandType === "creativesos.content_draft.create.v1") {
        const payload = contentDraftPayloadSchema.parse(envelope.payload);
        const [draft] = await tx.insert(contentDrafts).values({ userId: envelope.delegatedUserId, businessId: envelope.businessId, content: payload.content, kind: payload.kind, audience: payload.audience, platformVariants: payload.platformVariants, scheduledFor: payload.scheduledFor ? new Date(payload.scheduledFor) : null, status: "draft" }).returning();
        await emitProjectionEvent({ aggregateType: "content_draft", aggregateId: draft.id, eventType: "content_draft.created", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:content_draft.created`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx); result = { contentDraftId: draft.id };
      } else if (envelope.commandType === "creativesos.campaign.create.v1") {
        const payload = campaignPayloadSchema.parse(envelope.payload); const startsAt = payload.startsAt ? new Date(payload.startsAt) : null; const endsAt = payload.endsAt ? new Date(payload.endsAt) : null;
        if ((startsAt && Number.isNaN(startsAt.valueOf())) || (endsAt && Number.isNaN(endsAt.valueOf())) || (startsAt && endsAt && endsAt <= startsAt)) throw new Error("Campaign schedule is invalid");
        const [campaign] = await tx.insert(campaigns).values({ businessId: envelope.businessId, ownerUserId: envelope.delegatedUserId, name: payload.name, objective: payload.objective, channel: payload.channel, description: payload.description, budgetCents: payload.budgetCents, targeting: payload.targeting, startsAt, endsAt, status: "draft" }).returning();
        await emitProjectionEvent({ aggregateType: "campaign", aggregateId: campaign.id, eventType: "campaign.created", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, objective: campaign.objective, channel: campaign.channel, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:campaign.created`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx); result = { campaignId: campaign.id };
      } else if (envelope.commandType === "creativesos.instrument.create.v1") {
        const payload = createFoundationInstrumentSchema.parse(envelope.payload);
        const content = parseFoundationContent(payload.kind, payload.content);
        const [instrument] = await tx.insert(foundationInstruments).values({ businessId: envelope.businessId, kind: payload.kind, title: payload.title, ownerUserId: envelope.delegatedUserId, authorityScope: payload.authorityScope, extension: { ...payload.extension, origin: "umh" } }).returning();
        await tx.insert(foundationInstrumentRevisions).values({ instrumentId: instrument.id, revision: 1, title: instrument.title, content, actorUserId: envelope.delegatedUserId, changeSummary: "Created by approved UMH command", baseRevision: null, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId } });
        await tx.insert(foundationInstrumentEvents).values({ instrumentId: instrument.id, businessId: envelope.businessId, eventType: "instrument.created", toStatus: "draft", actorUserId: envelope.delegatedUserId, payload: { kind: instrument.kind, revision: 1, origin: "umh", commandId: envelope.commandId } });
        await emitProjectionEvent({ aggregateType: "foundation_instrument", aggregateId: instrument.id, eventType: "instrument.created", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, kind: instrument.kind, revision: 1, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:instrument.created`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { instrumentId: instrument.id, revision: 1, status: "draft" };
      } else if (envelope.commandType === "creativesos.instrument.revise.v1") {
        const payload = instrumentRevisionPayloadSchema.parse(envelope.payload);
        const [instrument] = await tx.select().from(foundationInstruments).where(and(eq(foundationInstruments.id, payload.instrumentId), eq(foundationInstruments.businessId, envelope.businessId))).limit(1);
        if (!instrument) throw new Error("Instrument not found in the delegated business");
        if (instrument.status === "archived") throw new Error("Restore the instrument before revising it");
        if (instrument.currentRevision !== payload.baseRevision) throw new Error(`Revision conflict: current revision is ${instrument.currentRevision}`);
        const content = parseFoundationContent(instrument.kind as FoundationInstrumentKind, payload.content);
        const nextRevision = instrument.currentRevision + 1;
        const [updated] = await tx.update(foundationInstruments).set({ title: payload.title ?? instrument.title, currentRevision: nextRevision, status: instrument.status === "approved" || instrument.status === "published" ? "draft" : instrument.status, updatedAt: new Date() }).where(and(eq(foundationInstruments.id, instrument.id), eq(foundationInstruments.currentRevision, payload.baseRevision))).returning();
        if (!updated) throw new Error("Revision conflict");
        await tx.insert(foundationInstrumentRevisions).values({ instrumentId: instrument.id, revision: nextRevision, title: updated.title, content, actorUserId: envelope.delegatedUserId, changeSummary: payload.changeSummary, baseRevision: payload.baseRevision, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId } });
        await tx.insert(foundationInstrumentEvents).values({ instrumentId: instrument.id, businessId: envelope.businessId, eventType: "instrument.revised", fromStatus: instrument.status, toStatus: updated.status, actorUserId: envelope.delegatedUserId, payload: { revision: nextRevision, origin: "umh", commandId: envelope.commandId } });
        await emitProjectionEvent({ aggregateType: "foundation_instrument", aggregateId: instrument.id, eventType: "instrument.revised", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, kind: instrument.kind, revision: nextRevision, status: updated.status, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:instrument.revised`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { instrumentId: instrument.id, revision: nextRevision, status: updated.status };
      } else if (envelope.commandType === "creativesos.instrument.lifecycle.v1") {
        const payload = instrumentLifecyclePayloadSchema.parse(envelope.payload);
        const [instrument] = await tx.select().from(foundationInstruments).where(and(eq(foundationInstruments.id, payload.instrumentId), eq(foundationInstruments.businessId, envelope.businessId))).limit(1);
        if (!instrument) throw new Error("Instrument not found in the delegated business");
        const nextStatus = nextFoundationStatus(foundationInstrumentStatusSchema.parse(instrument.status), payload.command);
        const [updated] = await tx.update(foundationInstruments).set({ status: nextStatus, updatedAt: new Date(), archivedAt: nextStatus === "archived" ? new Date() : null }).where(and(eq(foundationInstruments.id, instrument.id), eq(foundationInstruments.status, instrument.status))).returning();
        if (!updated) throw new Error("Lifecycle conflict");
        await tx.insert(foundationInstrumentEvents).values({ instrumentId: instrument.id, businessId: envelope.businessId, eventType: `instrument.${payload.command}`, fromStatus: instrument.status, toStatus: nextStatus, actorUserId: envelope.delegatedUserId, payload: { note: payload.note, revision: instrument.currentRevision, origin: "umh", commandId: envelope.commandId } });
        await emitProjectionEvent({ aggregateType: "foundation_instrument", aggregateId: instrument.id, eventType: `instrument.${payload.command}`, actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, kind: instrument.kind, revision: instrument.currentRevision, fromStatus: instrument.status, toStatus: nextStatus, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:instrument.${payload.command}`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { instrumentId: instrument.id, revision: instrument.currentRevision, status: nextStatus };
      } else if (envelope.commandType === "creativesos.design.create.v1") {
        const payload = designCreatePayloadSchema.parse(envelope.payload);
        if (payload.brandKitId) {
          const [brandKit] = await tx.select({ id: broadcastBrandKits.id }).from(broadcastBrandKits).where(and(eq(broadcastBrandKits.id, payload.brandKitId), eq(broadcastBrandKits.businessId, envelope.businessId))).limit(1);
          if (!brandKit) throw new Error("Brand kit not found in the delegated business");
        }
        const [project] = await tx.insert(designProjects).values({ businessId: envelope.businessId, ownerUserId: envelope.delegatedUserId, name: payload.name, kind: payload.kind, width: payload.width, height: payload.height, brandKitId: payload.brandKitId, document: payload.document }).returning();
        await tx.insert(designVersions).values({ projectId: project.id, createdByUserId: envelope.delegatedUserId, revision: 1, label: "Initial revision", document: project.document, reviewStatus: "draft" });
        await tx.insert(designProjectEvents).values({ projectId: project.id, businessId: envelope.businessId, eventType: "design.project.created", actorUserId: envelope.delegatedUserId, revision: 1, payload: { kind: project.kind, width: project.width, height: project.height, origin: "umh" }, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId, automaticRevision: true } });
        await emitProjectionEvent({ aggregateType: "design_project", aggregateId: project.id, eventType: "design.project.created", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, kind: project.kind, revision: 1, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:design.project.created`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { designProjectId: project.id, revision: 1, status: project.status };
      } else if (envelope.commandType === "creativesos.design.revise.v1") {
        const payload = designRevisionPayloadSchema.parse(envelope.payload);
        const [project] = await tx.select().from(designProjects).where(and(eq(designProjects.id, payload.projectId), eq(designProjects.businessId, envelope.businessId))).limit(1);
        if (!project) throw new Error("Design project not found in the delegated business");
        if (project.revision !== payload.revision) throw new Error(`Revision conflict: current revision is ${project.revision}`);
        const [updated] = await tx.update(designProjects).set({ document: payload.document, revision: sql`${designProjects.revision} + 1`, status: "draft", updatedAt: new Date() }).where(and(eq(designProjects.id, project.id), eq(designProjects.revision, payload.revision))).returning();
        if (!updated) throw new Error("Revision conflict");
        await tx.insert(designVersions).values({ projectId: updated.id, createdByUserId: envelope.delegatedUserId, revision: updated.revision, label: `Revision ${updated.revision}`, document: updated.document, reviewStatus: "draft" });
        await tx.insert(designProjectEvents).values({ projectId: updated.id, businessId: envelope.businessId, eventType: "design.project.revised", actorUserId: envelope.delegatedUserId, revision: updated.revision, payload: { baseRevision: payload.revision, status: updated.status, origin: "umh" }, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId, automaticRevision: true } });
        await emitProjectionEvent({ aggregateType: "design_project", aggregateId: updated.id, eventType: "design.project.revised", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, revision: updated.revision, baseRevision: payload.revision, status: updated.status, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:design.project.revised`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { designProjectId: updated.id, revision: updated.revision, status: updated.status };
      } else if (envelope.commandType === "creativesos.task.create.v1") {
        const payload = createCreativeWorkItemSchema.parse(envelope.payload);
        if (payload.parentWorkItemId) {
          const [parent] = await tx.select({ id: creativeWorkItems.id }).from(creativeWorkItems).where(and(eq(creativeWorkItems.id, payload.parentWorkItemId), eq(creativeWorkItems.businessId, envelope.businessId))).limit(1);
          if (!parent) throw new Error("Parent work item not found in the delegated business");
        }
        const [item] = await tx.insert(creativeWorkItems).values({ ...payload, businessId: envelope.businessId, createdByUserId: envelope.delegatedUserId }).returning();
        await tx.insert(creativeWorkEvents).values({ workItemId: item.id, businessId: envelope.businessId, eventType: "task.created", actorUserId: envelope.delegatedUserId, toStatus: item.status, version: item.version, payload: { kind: item.kind, parentWorkItemId: item.parentWorkItemId, origin: "umh" }, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId } });
        await emitProjectionEvent({ aggregateType: "creative_work_item", aggregateId: item.id, eventType: "task.created", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, kind: item.kind, status: item.status, version: item.version, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:task.created`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { workItemId: item.id, version: item.version, status: item.status };
      } else if (envelope.commandType === "creativesos.task.revise.v1") {
        const payload = taskRevisionPayloadSchema.parse(envelope.payload);
        const { workItemId, version, ...changes } = payload;
        const [item] = await tx.select().from(creativeWorkItems).where(and(eq(creativeWorkItems.id, workItemId), eq(creativeWorkItems.businessId, envelope.businessId))).limit(1);
        if (!item) throw new Error("Work item not found in the delegated business");
        if (item.version !== version) throw new Error(`Version conflict: current version is ${item.version}`);
        if (changes.parentWorkItemId) {
          if (changes.parentWorkItemId === item.id) throw new Error("Work cannot be its own parent");
          const rows = await tx.select({ id: creativeWorkItems.id, parentId: creativeWorkItems.parentWorkItemId }).from(creativeWorkItems).where(eq(creativeWorkItems.businessId, envelope.businessId));
          const parents = new Map(rows.map((row) => [row.id, row.parentId]));
          if (!parents.has(changes.parentWorkItemId)) throw new Error("Parent work item not found in the delegated business");
          let cursor: string | null | undefined = changes.parentWorkItemId;
          while (cursor) { if (cursor === item.id) throw new Error("This parent would create a cycle"); cursor = parents.get(cursor); }
        }
        const startsAt = changes.startsAt === undefined ? item.startsAt : changes.startsAt; const dueAt = changes.dueAt === undefined ? item.dueAt : changes.dueAt;
        if (startsAt && dueAt && dueAt < startsAt) throw new Error("Due date cannot precede the start date");
        const [updated] = await tx.update(creativeWorkItems).set({ ...changes, version: sql`${creativeWorkItems.version} + 1`, updatedAt: new Date() }).where(and(eq(creativeWorkItems.id, item.id), eq(creativeWorkItems.version, version))).returning();
        if (!updated) throw new Error("Version conflict");
        await tx.insert(creativeWorkEvents).values({ workItemId: updated.id, businessId: envelope.businessId, eventType: "task.revised", actorUserId: envelope.delegatedUserId, fromStatus: item.status, toStatus: updated.status, version: updated.version, payload: { baseVersion: version, changedFields: Object.keys(changes), origin: "umh" }, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId } });
        await emitProjectionEvent({ aggregateType: "creative_work_item", aggregateId: updated.id, eventType: "task.revised", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, status: updated.status, version: updated.version, baseVersion: version, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:task.revised`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { workItemId: updated.id, version: updated.version, status: updated.status };
      } else if (envelope.commandType === "creativesos.task.transition.v1") {
        const payload = taskTransitionPayloadSchema.parse(envelope.payload);
        const [item] = await tx.select().from(creativeWorkItems).where(and(eq(creativeWorkItems.id, payload.workItemId), eq(creativeWorkItems.businessId, envelope.businessId))).limit(1);
        if (!item) throw new Error("Work item not found in the delegated business");
        if (payload.version !== undefined && payload.version !== item.version) throw new Error(`Version conflict: current version is ${item.version}`);
        if (!canTransitionCreativeWork(item.status, payload.status)) throw new Error(`Cannot move ${item.status} work directly to ${payload.status}`);
        if (["scheduled", "published"].includes(payload.status)) {
          const dependencies = await tx.select({ status: creativeWorkItems.status }).from(creativeWorkDependencies).innerJoin(creativeWorkItems, eq(creativeWorkDependencies.dependsOnWorkItemId, creativeWorkItems.id)).where(eq(creativeWorkDependencies.workItemId, item.id));
          if (dependencies.some((dependency) => !["published", "retrospective"].includes(dependency.status))) throw new Error("Complete dependent work before scheduling or publishing");
          const [approval] = await tx.select().from(creativeWorkApprovals).where(eq(creativeWorkApprovals.workItemId, item.id)).orderBy(desc(creativeWorkApprovals.requestedAt)).limit(1);
          if (approval && approval.status !== "approved") throw new Error("Required local approval has not been granted");
        }
        const [updated] = await tx.update(creativeWorkItems).set({ status: payload.status, completedAt: ["published", "retrospective", "cancelled"].includes(payload.status) ? new Date() : null, version: sql`${creativeWorkItems.version} + 1`, updatedAt: new Date() }).where(and(eq(creativeWorkItems.id, item.id), eq(creativeWorkItems.version, item.version), eq(creativeWorkItems.status, item.status))).returning();
        if (!updated) throw new Error("Version conflict");
        await tx.insert(creativeWorkEvents).values({ workItemId: updated.id, businessId: envelope.businessId, eventType: "task.status_changed", actorUserId: envelope.delegatedUserId, fromStatus: item.status, toStatus: updated.status, version: updated.version, payload: { fromStatus: item.status, toStatus: updated.status, origin: "umh" }, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId } });
        await emitProjectionEvent({ aggregateType: "creative_work_item", aggregateId: updated.id, eventType: "task.status_changed", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, fromStatus: item.status, toStatus: updated.status, version: updated.version, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:task.status_changed`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { workItemId: updated.id, version: updated.version, status: updated.status };
      } else if (envelope.commandType === "creativesos.room.schedule.v1") {
        const payload = roomSchedulePayloadSchema.parse(envelope.payload);
        const [membership] = await tx.select().from(communityMemberships).where(and(eq(communityMemberships.communityId, payload.communityId), eq(communityMemberships.userId, envelope.delegatedUserId), inArray(communityMemberships.role, ["owner", "admin"]), eq(communityMemberships.status, "active"))).limit(1);
        if (!membership) throw new Error("Delegated user cannot manage the requested community");
        if (payload.channelId) {
          const [channel] = await tx.select({ id: channels.id }).from(channels).where(and(eq(channels.id, payload.channelId), eq(channels.communityId, payload.communityId))).limit(1);
          if (!channel) throw new Error("Channel not found in the delegated community");
        }
        const startsAt = new Date(payload.startsAt);
        const [room] = await tx.insert(communityRooms).values({ communityId: payload.communityId, channelId: payload.channelId ?? null, hostUserId: envelope.delegatedUserId, title: payload.title, description: payload.description, startsAt, provider: payload.provider, joinUrl: payload.joinUrl ?? null }).returning();
        await tx.insert(communityRoomEvents).values({ roomId: room.id, communityId: room.communityId, eventType: "community.room.scheduled", actorUserId: envelope.delegatedUserId, payload: { provider: room.provider, startsAt: room.startsAt.toISOString(), origin: "umh" }, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId } });
        await emitProjectionEvent({ aggregateType: "community_room", aggregateId: room.id, eventType: "community.room.scheduled", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, communityId: room.communityId, provider: room.provider, startsAt: room.startsAt.toISOString(), origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:community.room.scheduled`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { roomId: room.id, communityId: room.communityId, status: room.status };
      } else if (envelope.commandType === "creativesos.room.transition.v1") {
        const payload = roomTransitionPayloadSchema.parse(envelope.payload);
        const [room] = await tx.select().from(communityRooms).where(eq(communityRooms.id, payload.roomId)).limit(1);
        if (!room) throw new Error("Community room not found");
        const [membership] = await tx.select().from(communityMemberships).where(and(eq(communityMemberships.communityId, room.communityId), eq(communityMemberships.userId, envelope.delegatedUserId), inArray(communityMemberships.role, ["owner", "admin"]), eq(communityMemberships.status, "active"))).limit(1);
        if (!membership && room.hostUserId !== envelope.delegatedUserId) throw new Error("Delegated user cannot manage the requested room");
        if (["ended", "canceled"].includes(room.status)) throw new Error("Closed rooms cannot be reopened");
        if (room.status === "scheduled" && !["live", "canceled"].includes(payload.status)) throw new Error("Invalid room status transition");
        if (room.status === "live" && !["ended", "canceled"].includes(payload.status)) throw new Error("Invalid room status transition");
        if (room.provider === "livekit" && (payload.status === "live" || room.status === "live")) throw new Error("Provider-managed rooms must start or stop locally so media and consent state can be coordinated");
        const [updated] = await tx.update(communityRooms).set({ status: payload.status, endedAt: payload.status === "ended" ? new Date() : room.endedAt, recordingEnabled: ["ended", "canceled"].includes(payload.status) ? false : room.recordingEnabled, transcriptionEnabled: ["ended", "canceled"].includes(payload.status) ? false : room.transcriptionEnabled, aiAssistanceEnabled: ["ended", "canceled"].includes(payload.status) ? false : room.aiAssistanceEnabled, updatedAt: new Date() }).where(and(eq(communityRooms.id, room.id), eq(communityRooms.status, room.status))).returning();
        if (!updated) throw new Error("Room status changed before the command completed");
        const eventType = `community.room.${updated.status}`;
        await tx.insert(communityRoomEvents).values({ roomId: updated.id, communityId: updated.communityId, eventType, actorUserId: envelope.delegatedUserId, payload: { provider: updated.provider, fromStatus: room.status, toStatus: updated.status, origin: "umh" }, evidence: { source: "umh", commandId: envelope.commandId, traceId: envelope.traceId } });
        await emitProjectionEvent({ aggregateType: "community_room", aggregateId: updated.id, eventType, actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, communityId: updated.communityId, provider: updated.provider, fromStatus: room.status, toStatus: updated.status, origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:${eventType}`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx);
        result = { roomId: updated.id, communityId: updated.communityId, status: updated.status };
      } else {
        const payload = postPublishPayloadSchema.parse(envelope.payload);
        const [post] = await tx.insert(posts).values({ userId: envelope.delegatedUserId, content: payload.content, mediaType: payload.mediaType, imageUrl: payload.imageUrl, audioUrl: payload.audioUrl, videoUrl: payload.videoUrl }).returning();
        await emitProjectionEvent({ aggregateType: "post", aggregateId: post.id, eventType: "post.published", actorUserId: envelope.delegatedUserId, payload: { businessId: envelope.businessId, mediaType: post.mediaType ?? "text", origin: "umh" }, idempotencyKey: `umh:${envelope.commandId}:post.published`, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId }, tx); result = { postId: post.id };
      }
      await tx.update(umhCommands).set({ status: "completed", executedAt: new Date(), updatedAt: new Date() }).where(eq(umhCommands.id, command.id)); await outcome(command.id, envelope, "completed", "Command completed", result, tx); await audit(command.id, envelope, "command.completed", "completed", result, tx); return result;
    });
    return { status: "completed", detail: "Command completed", payload: execution };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : "Command execution failed";
    await db.transaction(async (tx) => { await tx.update(umhCommands).set({ status: "failed", updatedAt: new Date() }).where(eq(umhCommands.id, command.id)); await outcome(command.id, envelope, "failed", detail, {}, tx); await audit(command.id, envelope, "command.failed", "failed", { detail }, tx); });
    return { status: "failed", detail };
  }
}

async function processUmhCommand(envelope: UmhCommandEnvelope) {
  const [existing] = await db.select().from(umhCommands).where(or(eq(umhCommands.commandId, envelope.commandId), eq(umhCommands.idempotencyKey, envelope.idempotencyKey))).limit(1);
  if (existing) return { status: existing.status, commandId: existing.commandId, replayed: true };
  const [delegatedUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, envelope.delegatedUserId)).limit(1);
  const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, envelope.businessId)).limit(1);
  if (!delegatedUser || !business) return { status: "rejected", detail: "Delegated user or business is not recognized" };
  const [command] = await db.insert(umhCommands).values({ commandId: envelope.commandId, commandType: envelope.commandType, businessId: envelope.businessId, delegatedUserId: envelope.delegatedUserId, payload: envelope.payload, idempotencyKey: envelope.idempotencyKey, correlationId: commandCorrelationId(envelope), traceId: envelope.traceId, issuedAt: new Date(envelope.issuedAt), expiresAt: new Date(envelope.expiresAt) }).onConflictDoNothing().returning();
  if (!command) { const [conflict] = await db.select().from(umhCommands).where(or(eq(umhCommands.commandId, envelope.commandId), eq(umhCommands.idempotencyKey, envelope.idempotencyKey))).limit(1); return { status: conflict?.status ?? "received", commandId: conflict?.commandId ?? envelope.commandId, replayed: true }; }
  if (!(await userCanManageBusiness(envelope.delegatedUserId, envelope.businessId))) return rejectCommand(command, envelope, "Delegated user cannot manage the requested business");
  if (isApprovalRequired(envelope.commandType)) {
    const reason = envelope.commandType === "creativesos.instrument.lifecycle.v1"
      ? "UMH instrument lifecycle control requires explicit local approval"
      : "External publication requires explicit local approval";
    await db.transaction(async (tx) => { await tx.update(umhCommands).set({ status: "awaiting_approval", updatedAt: new Date() }).where(eq(umhCommands.id, command.id)); await tx.insert(umhApprovals).values({ commandId: command.id, businessId: envelope.businessId, reason }); await outcome(command.id, envelope, "awaiting_approval", reason, {}, tx); await audit(command.id, envelope, "command.awaiting_approval", "awaiting_approval", {}, tx); });
    return { status: "awaiting_approval", commandId: command.commandId, detail: reason };
  }
  return { ...(await executeApprovedCommand(command, envelope)), commandId: command.commandId };
}

function storedEnvelope(command: typeof umhCommands.$inferSelect): UmhCommandEnvelope { return UmhCommandEnvelopeSchema.parse({ schemaVersion: "umh.command.v1", commandId: command.commandId, commandType: command.commandType as SupportedUmhCommandType, idempotencyKey: command.idempotencyKey, correlationId: command.correlationId ?? command.commandId, traceId: command.traceId, issuedAt: command.issuedAt.toISOString(), expiresAt: command.expiresAt.toISOString(), businessId: command.businessId, delegatedUserId: command.delegatedUserId, payload: command.payload }); }

async function resolveApproval(commandId: string, approverUserId: number, decision: "approved" | "rejected") {
  const [command] = await db.select().from(umhCommands).where(eq(umhCommands.commandId, commandId)).limit(1);
  if (!command || !command.businessId || !command.delegatedUserId) return { status: 404, body: { message: "UMH command not found" } };
  const canApprove = command.commandType === "creativesos.instrument.lifecycle.v1"
    ? await userCanAdminBusiness(approverUserId, command.businessId)
    : await userCanManageBusiness(approverUserId, command.businessId);
  if (!canApprove) return { status: 403, body: { message: "You do not have access to approve this command" } };
  const [approval] = await db.select().from(umhApprovals).where(eq(umhApprovals.commandId, command.id)).limit(1);
  if (!approval || approval.status !== "pending") return { status: 409, body: { message: "This approval is no longer pending" } };
  const envelope = storedEnvelope(command);
  if (decision === "rejected") {
    const [claimedApproval] = await db.update(umhApprovals).set({ status: "rejected", approvedByUserId: approverUserId, resolvedAt: new Date() }).where(and(eq(umhApprovals.id, approval.id), eq(umhApprovals.status, "pending"))).returning();
    if (!claimedApproval) return { status: 409, body: { message: "This approval is no longer pending" } };
    await db.transaction(async (tx) => { await tx.update(umhCommands).set({ status: "rejected", updatedAt: new Date() }).where(eq(umhCommands.id, command.id)); await outcome(command.id, envelope, "rejected", "Local approval rejected", {}, tx); await audit(command.id, envelope, "approval.rejected", "rejected", { approverUserId }, tx); });
    return { status: 200, body: { status: "rejected", commandId } };
  }
  const [claimedApproval] = await db.update(umhApprovals).set({ status: "approved", approvedByUserId: approverUserId, resolvedAt: new Date() }).where(and(eq(umhApprovals.id, approval.id), eq(umhApprovals.status, "pending"))).returning();
  if (!claimedApproval) return { status: 409, body: { message: "This approval is no longer pending" } };
  await db.transaction(async (tx) => { await tx.update(umhCommands).set({ status: "approved", updatedAt: new Date() }).where(eq(umhCommands.id, command.id)); await audit(command.id, envelope, "approval.approved", "approved", { approverUserId }, tx); });
  return { status: 200, body: { ...(await executeApprovedCommand(command, envelope)), commandId } };
}

async function verifyInboundRequest(req: Request) {
  const secret = integrationSecrets().inbound; if (!secret) return { ok: false as const, status: 503, message: "UMH command integration is not configured" };
  const timestamp = req.header("x-umh-timestamp"); const nonce = req.header("x-umh-nonce"); const signature = req.header("x-umh-signature"); const rawBody = req.rawBody;
  if (!timestamp || !nonce || !signature || !rawBody) return { ok: false as const, status: 401, message: "Missing UMH authentication headers" };
  const timestampMs = Date.parse(timestamp); if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SIGNATURE_AGE_MS) return { ok: false as const, status: 401, message: "Expired UMH request" };
  if (!verifyUmhSignature(secret, timestamp, nonce, rawBody, signature)) return { ok: false as const, status: 401, message: "Invalid UMH signature" };
  return { ok: true as const, nonce };
}

export function registerUmhRoutes(app: Express) {
  app.get("/api/umh/manifest", (_req, res) => { const { inbound, outbound, ingestUrl } = integrationSecrets(); res.json({ ...getCreativesOsCapabilityManifest({ installationId: process.env.UMH_INSTALLATION_ID ?? null }), configured: { inboundCommands: Boolean(inbound), outboundEvents: Boolean(outbound && ingestUrl) } }); });
  app.post("/api/umh/commands", async (req: Request, res: Response) => {
    const verified = await verifyInboundRequest(req); if (!verified.ok) return res.status(verified.status).json({ message: verified.message });
    const parsed = parseInboundUmhCommandEnvelope(req.body, process.env.UMH_INSTALLATION_ID); if (!parsed.success) return res.status(400).json({ message: "Invalid UMH command envelope" }); if (new Date(parsed.data.expiresAt) <= new Date()) return res.status(400).json({ message: "UMH command has expired" });
    const [existing] = await db.select().from(umhCommands).where(or(eq(umhCommands.commandId, parsed.data.commandId), eq(umhCommands.idempotencyKey, parsed.data.idempotencyKey))).limit(1); if (existing) return res.status(200).json({ status: existing.status, commandId: existing.commandId, replayed: true });
    const [recordedNonce] = await db.insert(umhNonces).values({ nonce: verified.nonce, expiresAt: new Date(Date.now() + MAX_SIGNATURE_AGE_MS) }).onConflictDoNothing().returning(); if (!recordedNonce) return res.status(409).json({ message: "UMH request replay detected" });
    const result = await processUmhCommand(parsed.data); res.status(result.status === "rejected" ? 403 : 202).json(result);
  });
  app.get("/api/umh/operations", attachUser, async (req, res) => {
    const memberships = await db.select({ businessId: businessMembers.businessId }).from(businessMembers).where(eq(businessMembers.userId, req.dbUser!.id));
    const businessIds = memberships.map((membership) => membership.businessId);
    const commandScope = businessIds.length
      ? or(eq(umhCommands.delegatedUserId, req.dbUser!.id), inArray(umhCommands.businessId, businessIds))
      : eq(umhCommands.delegatedUserId, req.dbUser!.id);
    const commands = await db.select().from(umhCommands).where(commandScope).orderBy(desc(umhCommands.createdAt)).limit(30);
    const pendingApprovalCount = businessIds.length
      ? (await db.select({ id: umhApprovals.id }).from(umhApprovals).where(and(eq(umhApprovals.status, "pending"), inArray(umhApprovals.businessId, businessIds)))).length
      : 0;
    const { inbound, outbound, ingestUrl } = integrationSecrets();
    res.json({
      configured: { inboundCommands: Boolean(inbound), outboundEvents: Boolean(outbound && ingestUrl) },
      pendingApprovalCount,
      commands,
    });
  });
  app.get("/api/umh/approvals", attachUser, async (req, res) => { const pending = await db.select({ approval: umhApprovals, command: umhCommands }).from(umhApprovals).innerJoin(umhCommands, eq(umhApprovals.commandId, umhCommands.id)).where(eq(umhApprovals.status, "pending")).orderBy(desc(umhApprovals.createdAt)); const visible = []; for (const item of pending) if (item.approval.businessId && await userCanManageBusiness(req.dbUser!.id, item.approval.businessId)) visible.push(item); res.json(visible); });
  app.post("/api/umh/approvals/:commandId", attachUser, async (req, res) => { const decision = req.body?.decision === "approved" || req.body?.decision === "rejected" ? req.body.decision : null; if (!decision) return res.status(400).json({ message: "Decision must be approved or rejected" }); const result = await resolveApproval(req.params.commandId, req.dbUser!.id, decision); res.status(result.status).json(result.body); });
}
