import type { Express, NextFunction, Request, Response } from "express";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import {
  createVisionPresetSchema,
  createVisionSessionSchema,
  updateVisionPresetSchema,
  visionSessionCommandSchema,
} from "@shared/vision";
import {
  users,
  visionEvents,
  visionObservations,
  visionPresets,
  visionSessions,
  visionWatches,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";
import { emitProjectionEvent } from "./umh";

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
const safe = (handler: Handler): Handler => (req, res, next) => {
  try {
    Promise.resolve(handler(req, res, next)).catch(next);
  } catch (error) {
    next(error);
  }
};

const SCENE_EXPIRY_MS = 5 * 60 * 1_000;
const SESSION_IDLE_MS = 30 * 60 * 1_000;
const MAX_ACTIVE_WATCHES = 10;

const visionCommandLimiter = rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

type VisionExecutor = Pick<typeof db, "insert">;

async function recordVisionEvent(input: {
  sessionId: string;
  businessId: string;
  eventType: string;
  actorUserId?: number | null;
  version?: number | null;
  payload?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}, executor: VisionExecutor = db) {
  const [event] = await executor.insert(visionEvents).values({
    sessionId: input.sessionId,
    businessId: input.businessId,
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    version: input.version ?? null,
    payload: input.payload ?? {},
    evidence: input.evidence ?? {},
  }).returning();
  return event;
}

async function sessionAccess(userId: number, sessionId: string) {
  const [session] = await db.select().from(visionSessions).where(eq(visionSessions.id, sessionId)).limit(1);
  if (!session) return null;
  if (session.ownerUserId === userId || await userCanManageBusiness(userId, session.businessId)) return session;
  return null;
}

async function expireSessionState(sessionId: string) {
  const now = new Date();
  await db.update(visionWatches).set({ status: "expired", stoppedAt: now })
    .where(and(eq(visionWatches.sessionId, sessionId), eq(visionWatches.status, "active"), lt(visionWatches.expiresAt, now)));
  const [session] = await db.select().from(visionSessions).where(eq(visionSessions.id, sessionId)).limit(1);
  if (!session || session.status !== "live" || session.lastInteractionAt.getTime() >= Date.now() - SESSION_IDLE_MS) return session;
  return db.transaction(async (tx) => {
    const [stopped] = await tx.update(visionSessions).set({
      status: "stopped",
      stoppedAt: now,
      followTarget: null,
      version: sql`${visionSessions.version} + 1`,
      updatedAt: now,
    }).where(and(eq(visionSessions.id, session.id), eq(visionSessions.status, "live"))).returning();
    if (!stopped) return session;
    await tx.update(visionWatches).set({ status: "stopped", stoppedAt: now })
      .where(and(eq(visionWatches.sessionId, session.id), eq(visionWatches.status, "active")));
    await recordVisionEvent({ sessionId: stopped.id, businessId: stopped.businessId, eventType: "vision.session.auto_stopped", actorUserId: null, version: stopped.version, payload: { reason: "idle_timeout", idleMinutes: 30 }, evidence: { source: "native_policy", rawFramesPersisted: false } }, tx);
    await emitProjectionEvent({ aggregateType: "vision_session", aggregateId: stopped.id, eventType: "vision.session.auto_stopped", actorUserId: null, payload: { businessId: stopped.businessId, reason: "idle_timeout", version: stopped.version }, idempotencyKey: `vision:${stopped.id}:auto_stopped:${stopped.version}` }, tx);
    return stopped;
  });
}

function publicObservation<T extends typeof visionObservations.$inferSelect>(observation: T) {
  return { ...observation, expired: observation.expiresAt.getTime() <= Date.now() };
}

export function registerVisionRoutes(base: Express) {
  const app = {
    get: (path: string, ...handlers: Handler[]) => base.get(path, ...handlers.map(safe)),
    post: (path: string, ...handlers: Handler[]) => base.post(path, ...handlers.map(safe)),
    patch: (path: string, ...handlers: Handler[]) => base.patch(path, ...handlers.map(safe)),
    delete: (path: string, ...handlers: Handler[]) => base.delete(path, ...handlers.map(safe)),
  };

  app.get("/api/vision", attachUser, async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.dbUser!.id)).limit(1);
    if (!user) return res.status(401).json({ message: "Account not found" });
    const business = await ensureDefaultBusiness(user);
    const [sessions, presets] = await Promise.all([
      db.select().from(visionSessions).where(eq(visionSessions.businessId, business.id)).orderBy(desc(visionSessions.updatedAt)).limit(50),
      db.select().from(visionPresets).where(and(eq(visionPresets.businessId, business.id), isNull(visionPresets.archivedAt))).orderBy(desc(visionPresets.updatedAt)),
    ]);
    await Promise.all(sessions.filter((session) => session.status === "live").map((session) => expireSessionState(session.id)));
    const current = await db.select().from(visionSessions).where(eq(visionSessions.businessId, business.id)).orderBy(desc(visionSessions.updatedAt)).limit(50);
    return res.json({
      businessId: business.id,
      sessions: current,
      presets,
      policy: { rawFramesPersistedByDefault: false, sceneExpirySeconds: 300, idleStopSeconds: 1_800, maxActiveWatches: MAX_ACTIVE_WATCHES, audioCapture: false },
    });
  });

  app.post("/api/vision/presets", attachUser, async (req, res) => {
    const parsed = createVisionPresetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid preset" });
    const [user] = await db.select().from(users).where(eq(users.id, req.dbUser!.id)).limit(1);
    if (!user) return res.status(401).json({ message: "Account not found" });
    const business = await ensureDefaultBusiness(user);
    const [preset] = await db.insert(visionPresets).values({ businessId: business.id, ownerUserId: user.id, ...parsed.data }).returning();
    return res.status(201).json(preset);
  });

  app.patch("/api/vision/presets/:id", attachUser, async (req, res) => {
    const parsed = updateVisionPresetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid preset" });
    const [preset] = await db.select().from(visionPresets).where(eq(visionPresets.id, req.params.id)).limit(1);
    if (!preset || !(preset.ownerUserId === req.dbUser!.id || await userCanManageBusiness(req.dbUser!.id, preset.businessId))) return res.status(404).json({ message: "Vision preset not found" });
    const { version, ...changes } = parsed.data;
    const [updated] = await db.update(visionPresets).set({ ...changes, version: sql`${visionPresets.version} + 1`, updatedAt: new Date() })
      .where(and(eq(visionPresets.id, preset.id), eq(visionPresets.version, version))).returning();
    if (!updated) return res.status(409).json({ message: "Preset changed before this save completed" });
    return res.json(updated);
  });

  app.delete("/api/vision/presets/:id", attachUser, async (req, res) => {
    const [preset] = await db.select().from(visionPresets).where(eq(visionPresets.id, req.params.id)).limit(1);
    if (!preset || !(preset.ownerUserId === req.dbUser!.id || await userCanManageBusiness(req.dbUser!.id, preset.businessId))) return res.status(404).json({ message: "Vision preset not found" });
    const [archived] = await db.update(visionPresets).set({ archivedAt: new Date(), updatedAt: new Date(), version: sql`${visionPresets.version} + 1` }).where(eq(visionPresets.id, preset.id)).returning();
    return res.json(archived);
  });

  app.post("/api/vision/sessions", attachUser, async (req, res) => {
    const parsed = createVisionSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid capture session" });
    const [user] = await db.select().from(users).where(eq(users.id, req.dbUser!.id)).limit(1);
    if (!user) return res.status(401).json({ message: "Account not found" });
    const business = await ensureDefaultBusiness(user);
    const session = await db.transaction(async (tx) => {
      const [created] = await tx.insert(visionSessions).values({
        businessId: business.id,
        ownerUserId: user.id,
        title: parsed.data.title,
        source: parsed.data.source,
        quality: parsed.data.quality,
        captureNoticeAcknowledgedAt: new Date(),
      }).returning();
      await recordVisionEvent({ sessionId: created.id, businessId: business.id, eventType: "vision.session.created", actorUserId: user.id, version: created.version, payload: { source: created.source, quality: created.quality }, evidence: { source: "native", explicitCaptureNotice: true, rawFramesPersisted: false } }, tx);
      await emitProjectionEvent({ aggregateType: "vision_session", aggregateId: created.id, eventType: "vision.session.created", actorUserId: user.id, payload: { businessId: business.id, source: created.source, quality: created.quality, version: created.version }, idempotencyKey: `vision:${created.id}:created` }, tx);
      return created;
    });
    return res.status(201).json(session);
  });

  app.get("/api/vision/sessions/:id", attachUser, async (req, res) => {
    const access = await sessionAccess(req.dbUser!.id, req.params.id);
    if (!access) return res.status(404).json({ message: "Vision session not found" });
    const session = await expireSessionState(access.id);
    const now = new Date();
    const [observations, watches, events] = await Promise.all([
      db.select().from(visionObservations).where(eq(visionObservations.sessionId, access.id)).orderBy(desc(visionObservations.capturedAt)).limit(100),
      db.select().from(visionWatches).where(eq(visionWatches.sessionId, access.id)).orderBy(desc(visionWatches.createdAt)).limit(50),
      db.select().from(visionEvents).where(eq(visionEvents.sessionId, access.id)).orderBy(desc(visionEvents.createdAt)).limit(200),
    ]);
    return res.json({
      session,
      observations: observations.map(publicObservation),
      currentScene: observations.find((observation) => observation.expiresAt > now) ? publicObservation(observations.find((observation) => observation.expiresAt > now)!) : null,
      watches,
      events,
    });
  });

  app.post("/api/vision/sessions/:id/commands", attachUser, visionCommandLimiter, async (req, res) => {
    const parsed = visionSessionCommandSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid Vision command" });
    const session = await sessionAccess(req.dbUser!.id, req.params.id);
    if (!session) return res.status(404).json({ message: "Vision session not found" });
    if (session.status === "archived" && parsed.data.command !== "archive") return res.status(409).json({ message: "Archived sessions cannot be controlled" });
    const now = new Date();

    if (parsed.data.command === "observe") {
      const observationInput = parsed.data.observation;
      if (session.status !== "live") return res.status(409).json({ message: "Start the visible preview before recording an observation" });
      if (observationInput.kind === "operator_label" && !observationInput.operatorConfirmed) return res.status(400).json({ message: "Labels require explicit operator confirmation" });
      const forbidden = /\b(identity|emotion|health|diagnos|ethnicity|gender|age estimate|biometric)\b/i;
      if (forbidden.test(`${observationInput.label ?? ""} ${observationInput.summary}`)) return res.status(400).json({ message: "This visual claim is prohibited by Vision privacy policy" });
      const observation = await db.transaction(async (tx) => {
        const [created] = await tx.insert(visionObservations).values({
          sessionId: session.id,
          ...observationInput,
          label: observationInput.label ?? null,
          expiresAt: new Date(now.getTime() + SCENE_EXPIRY_MS),
        }).onConflictDoNothing().returning();
        if (!created) {
          const [existing] = await tx.select().from(visionObservations).where(and(eq(visionObservations.sessionId, session.id), eq(visionObservations.frameId, observationInput.frameId), eq(visionObservations.kind, observationInput.kind))).limit(1);
          return existing;
        }
        const [updated] = await tx.update(visionSessions).set({ lastFrameAt: now, lastInteractionAt: now, version: sql`${visionSessions.version} + 1`, updatedAt: now }).where(eq(visionSessions.id, session.id)).returning();
        await recordVisionEvent({ sessionId: session.id, businessId: session.businessId, eventType: "vision.observation.recorded", actorUserId: req.dbUser!.id, version: updated.version, payload: { frameId: created.frameId, kind: created.kind, source: created.source, expiresAt: created.expiresAt.toISOString() }, evidence: { groundedFrame: created.frameId, rawFramePersisted: false, operatorConfirmed: created.operatorConfirmed } }, tx);
        await emitProjectionEvent({ aggregateType: "vision_session", aggregateId: session.id, eventType: "vision.observation.recorded", actorUserId: req.dbUser!.id, payload: { businessId: session.businessId, frameId: created.frameId, kind: created.kind, source: created.source, expiresAt: created.expiresAt.toISOString() }, idempotencyKey: `vision:${session.id}:observation:${created.id}` }, tx);
        return created;
      });
      return res.status(201).json(publicObservation(observation));
    }

    if (parsed.data.command === "watch_start") {
      const watchInput = parsed.data;
      const active = await db.select({ id: visionWatches.id }).from(visionWatches).where(and(eq(visionWatches.sessionId, session.id), eq(visionWatches.status, "active"), gt(visionWatches.expiresAt, now)));
      if (active.length >= MAX_ACTIVE_WATCHES) return res.status(409).json({ message: "Stop an active watch before adding another" });
      const watch = await db.transaction(async (tx) => {
        const [created] = await tx.insert(visionWatches).values({ sessionId: session.id, target: watchInput.target, condition: watchInput.condition, expiresAt: new Date(now.getTime() + watchInput.durationMinutes * 60_000) }).returning();
        await tx.update(visionSessions).set({ lastInteractionAt: now, version: sql`${visionSessions.version} + 1`, updatedAt: now }).where(eq(visionSessions.id, session.id));
        await recordVisionEvent({ sessionId: session.id, businessId: session.businessId, eventType: "vision.watch.started", actorUserId: req.dbUser!.id, version: session.version + 1, payload: { watchId: created.id, target: created.target, condition: created.condition, expiresAt: created.expiresAt.toISOString() }, evidence: { source: "explicit_operator_command", autoExpires: true } }, tx);
        await emitProjectionEvent({ aggregateType: "vision_session", aggregateId: session.id, eventType: "vision.watch.started", actorUserId: req.dbUser!.id, payload: { businessId: session.businessId, watchId: created.id, target: created.target, condition: created.condition, expiresAt: created.expiresAt.toISOString() }, idempotencyKey: `vision:${session.id}:watch:${created.id}:started` }, tx);
        return created;
      });
      return res.status(201).json(watch);
    }

    if (parsed.data.command === "watch_stop") {
      const [watch] = await db.update(visionWatches).set({ status: "stopped", stoppedAt: now }).where(and(eq(visionWatches.id, parsed.data.watchId), eq(visionWatches.sessionId, session.id), inArray(visionWatches.status, ["active", "expired"]))).returning();
      if (!watch) return res.status(404).json({ message: "Active watch not found" });
      await recordVisionEvent({ sessionId: session.id, businessId: session.businessId, eventType: "vision.watch.stopped", actorUserId: req.dbUser!.id, version: session.version, payload: { watchId: watch.id }, evidence: { source: "explicit_operator_command" } });
      return res.json(watch);
    }

    if (parsed.data.command === "watch_trigger") {
      const trigger = parsed.data;
      if (session.status !== "live") return res.status(409).json({ message: "Activity watches require a live visible preview" });
      const [watch] = await db.select().from(visionWatches).where(and(
        eq(visionWatches.id, trigger.watchId),
        eq(visionWatches.sessionId, session.id),
        eq(visionWatches.status, "active"),
        gt(visionWatches.expiresAt, now),
      )).limit(1);
      if (!watch || watch.condition !== "activity_changed") return res.status(404).json({ message: "Active scene watch not found" });
      const event = await db.transaction(async (tx) => {
        const [updated] = await tx.update(visionSessions).set({ lastInteractionAt: now, lastFrameAt: now, version: sql`${visionSessions.version} + 1`, updatedAt: now }).where(eq(visionSessions.id, session.id)).returning();
        const created = await recordVisionEvent({ sessionId: session.id, businessId: session.businessId, eventType: "vision.watch.triggered", actorUserId: req.dbUser!.id, version: updated.version, payload: { watchId: watch.id, target: watch.target, condition: watch.condition, frameId: trigger.frameId, motionScore: trigger.motionScore }, evidence: { source: trigger.source, groundedFrame: trigger.frameId, rawFramePersisted: false } }, tx);
        await emitProjectionEvent({ aggregateType: "vision_session", aggregateId: session.id, eventType: "vision.watch.triggered", actorUserId: req.dbUser!.id, payload: { businessId: session.businessId, watchId: watch.id, frameId: trigger.frameId, motionScore: trigger.motionScore }, idempotencyKey: `vision:${session.id}:watch:${watch.id}:triggered:${trigger.frameId}` }, tx);
        return created;
      });
      return res.status(201).json(event);
    }

    if (parsed.data.command === "activate_preset") {
      const [preset] = await db.select().from(visionPresets).where(and(eq(visionPresets.id, parsed.data.presetId), eq(visionPresets.businessId, session.businessId))).limit(1);
      if (!preset || preset.archivedAt) return res.status(404).json({ message: "Vision preset not found" });
      const [updated] = await db.update(visionSessions).set({ activePresetId: preset.id, source: preset.source, quality: preset.quality, lastInteractionAt: now, version: sql`${visionSessions.version} + 1`, updatedAt: now }).where(and(eq(visionSessions.id, session.id), eq(visionSessions.version, parsed.data.version))).returning();
      if (!updated) return res.status(409).json({ message: "Session changed before this preset was activated" });
      await recordVisionEvent({ sessionId: session.id, businessId: session.businessId, eventType: "vision.preset.activated", actorUserId: req.dbUser!.id, version: updated.version, payload: { presetId: preset.id, quality: preset.quality, source: preset.source }, evidence: { source: "explicit_operator_command" } });
      return res.json(updated);
    }

    const result = await db.transaction(async (tx) => {
      let eventType: string;
      let patch: Record<string, unknown>;
      let payload: Record<string, unknown> = {};
      if (parsed.data.command === "start") {
        if (session.status === "live") return session;
        eventType = "vision.session.started";
        patch = { status: "live", startedAt: now, stoppedAt: null, lastInteractionAt: now, captureNoticeAcknowledgedAt: now };
        payload = { source: session.source, quality: session.quality };
      } else if (parsed.data.command === "stop") {
        eventType = "vision.session.stopped";
        patch = { status: "stopped", stoppedAt: now, followTarget: null, lastInteractionAt: now };
        payload = { reason: parsed.data.reason };
        await tx.update(visionWatches).set({ status: "stopped", stoppedAt: now }).where(and(eq(visionWatches.sessionId, session.id), eq(visionWatches.status, "active")));
      } else if (parsed.data.command === "follow_start") {
        eventType = "vision.follow.started";
        patch = { followTarget: parsed.data.target, lastInteractionAt: now };
        payload = { target: parsed.data.target };
      } else if (parsed.data.command === "follow_stop") {
        eventType = "vision.follow.stopped";
        patch = { followTarget: null, lastInteractionAt: now };
      } else {
        if (session.status === "live") throw Object.assign(new Error("Stop the live preview before archiving"), { status: 409 });
        eventType = "vision.session.archived";
        patch = { status: "archived", followTarget: null, lastInteractionAt: now };
      }
      const [updated] = await tx.update(visionSessions).set({ ...patch, version: sql`${visionSessions.version} + 1`, updatedAt: now }).where(eq(visionSessions.id, session.id)).returning();
      await recordVisionEvent({ sessionId: session.id, businessId: session.businessId, eventType, actorUserId: req.dbUser!.id, version: updated.version, payload, evidence: { source: "explicit_operator_command", visibleIndicatorRequired: updated.status === "live", rawFramesPersisted: false } }, tx);
      await emitProjectionEvent({ aggregateType: "vision_session", aggregateId: session.id, eventType, actorUserId: req.dbUser!.id, payload: { businessId: session.businessId, status: updated.status, version: updated.version, ...payload }, idempotencyKey: `vision:${session.id}:${eventType}:${updated.version}` }, tx);
      return updated;
    });
    return res.json(result);
  });
}
