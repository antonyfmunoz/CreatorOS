import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { ZodError, z } from "zod";
import { attachUser } from "./auth";
import { db } from "./db";
import { userCanManageBusiness } from "./businesses";
import {
  automationApprovals,
  automationActionReceipts,
  automationAuditEvents,
  automationDefinitions,
  automationMessages,
  automationRuns,
  automationStepRuns,
  automationSteps,
  automationThreads,
  automationTriggerEvents,
  businessMembers,
  type AutomationDefinition,
} from "../shared/schema";
import { getAutomationAction, listAutomationActions } from "./automation-actions";
import { cancelAutomationRun, createAutomationRun, decideAutomationApproval, processAutomationRun } from "./automation-engine";
import {
  automationApprovalDecisionSchema,
  automationConfigContainsSecret,
  automationDefinitionInputSchema,
  automationDefinitionUpdateSchema,
  automationEventInputSchema,
  automationRunInputSchema,
  automationThreadMessageSchema,
  isTerminalAutomationStatus,
} from "./automation-policy";
import { automationTemplates } from "./automation-templates";
import { automationMutationRateLimiter } from "./security";
import { validateNativeSocialTriggerConfig } from "./social-automation";

function automationError(res: Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ message: "Invalid automation request", issues: error.issues });
  const message = error instanceof Error ? error.message : "Automation request failed";
  const status = /not found/i.test(message) ? 404 : /not authorized|permission|belongs to another user/i.test(message) ? 403 : /budget|active run|archived|already been decided|raced/i.test(message) ? 409 : 500;
  if (status === 500) console.error("Automation route failed", { errorType: error instanceof Error ? error.name : typeof error });
  return res.status(status).json({ message: status === 500 ? "Automation request failed" : message });
}

async function userCanAccessDefinition(userId: number, definition: AutomationDefinition) {
  if (definition.ownerUserId === userId) return true;
  return definition.businessId ? userCanManageBusiness(userId, definition.businessId) : false;
}

async function ownedDefinition(userId: number, definitionId: string) {
  const [definition] = await db.select().from(automationDefinitions).where(eq(automationDefinitions.id, definitionId)).limit(1);
  if (!definition) throw new Error("Automation not found");
  if (!(await userCanAccessDefinition(userId, definition))) throw new Error("Not authorized to manage this automation");
  return definition;
}

async function ownedRun(userId: number, runId: string) {
  const [run] = await db.select().from(automationRuns).where(eq(automationRuns.id, runId)).limit(1);
  if (!run) throw new Error("Automation run not found");
  const definition = await ownedDefinition(userId, run.definitionId);
  return { run, definition };
}

function validateActions(steps: Array<{ actionType: string }>) {
  const unsupported = steps.map((step) => step.actionType).filter((type) => !getAutomationAction(type));
  if (unsupported.length > 0) throw new Error(`Unsupported automation actions: ${Array.from(new Set(unsupported)).join(", ")}`);
}

function validateStepIdentity(steps: Array<{ stepKey: string; position: number }>) {
  if (new Set(steps.map((step) => step.stepKey)).size !== steps.length) throw new Error("Automation step keys must be unique");
  if (new Set(steps.map((step) => step.position)).size !== steps.length) throw new Error("Automation step positions must be unique");
}

function validateTrigger(triggerType: string, triggerConfig: Record<string, unknown>) {
  if (triggerType === "schedule") {
    const interval = triggerConfig.intervalMinutes;
    if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 5 || interval > 10_080) {
      throw new Error("Scheduled automations need an intervalMinutes value between 5 and 10080");
    }
  }
  if (triggerType === "event" && (typeof triggerConfig.eventType !== "string" || !/^[a-z][a-z0-9_.]*$/.test(triggerConfig.eventType))) {
    throw new Error("Event automations need a valid trigger eventType");
  }
  if (triggerType === "event") validateNativeSocialTriggerConfig(triggerConfig);
}

async function writeDefinitionAudit(
  eventType: string,
  actorUserId: number,
  definition: AutomationDefinition,
  metadata: Record<string, unknown> = {},
) {
  await db.insert(automationAuditEvents).values({ actorUserId, businessId: definition.businessId, definitionId: definition.id, eventType, metadata });
}

export function registerAutomationRoutes(app: Express) {
  const limitAutomationMutation = automationMutationRateLimiter();
  app.get("/api/automations/actions", attachUser, (_req, res) => res.json(listAutomationActions()));
  app.get("/api/automations/templates", attachUser, (_req, res) => res.json(automationTemplates));

  app.get("/api/automations", attachUser, async (req, res) => {
    try {
      const memberships = await db.select({ businessId: businessMembers.businessId }).from(businessMembers).where(eq(businessMembers.userId, req.dbUser!.id));
      const businessIds = memberships.map((membership) => membership.businessId);
      const where = businessIds.length > 0
        ? or(eq(automationDefinitions.ownerUserId, req.dbUser!.id), inArray(automationDefinitions.businessId, businessIds))
        : eq(automationDefinitions.ownerUserId, req.dbUser!.id);
      const definitions = await db.select().from(automationDefinitions).where(where).orderBy(desc(automationDefinitions.updatedAt));
      const ids = definitions.map((definition) => definition.id);
      const runCounts = ids.length === 0 ? [] : await db
        .select({ definitionId: automationRuns.definitionId, count: count() })
        .from(automationRuns)
        .where(inArray(automationRuns.definitionId, ids))
        .groupBy(automationRuns.definitionId);
      const counts = new Map(runCounts.map((item) => [item.definitionId, item.count]));
      res.json(definitions.map((definition) => ({ ...definition, runCount: counts.get(definition.id) ?? 0 })));
    } catch (error) {
      automationError(res, error);
    }
  });

  app.post("/api/automations", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const input = automationDefinitionInputSchema.parse(req.body);
      validateActions(input.steps);
      validateStepIdentity(input.steps);
      validateTrigger(input.triggerType, input.triggerConfig);
      if (input.businessId && !(await userCanManageBusiness(req.dbUser!.id, input.businessId))) {
        return res.status(403).json({ message: "Not authorized for this business workspace" });
      }
      const definition = await db.transaction(async (tx) => {
        const [created] = await tx.insert(automationDefinitions).values({
          ownerUserId: req.dbUser!.id,
          businessId: input.businessId ?? null,
          name: input.name,
          description: input.description,
          triggerType: input.triggerType,
          triggerConfig: input.triggerConfig,
          maxRunsPerHour: input.maxRunsPerHour,
          maxStepsPerRun: input.maxStepsPerRun,
          retentionDays: input.retentionDays,
        }).returning();
        await tx.insert(automationSteps).values(input.steps.map((step) => ({ ...step, definitionId: created.id })));
        return created;
      });
      await writeDefinitionAudit("automation.definition.created", req.dbUser!.id, definition, { stepCount: input.steps.length });
      res.status(201).json(definition);
    } catch (error) {
      automationError(res, error);
    }
  });

  app.post("/api/automations/from-template/:templateId", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const template = automationTemplates.find((candidate) => candidate.id === req.params.templateId);
      if (!template) return res.status(404).json({ message: "Automation template not found" });
      const body = z.object({ businessId: z.string().uuid().nullable().optional(), name: z.string().trim().min(1).max(120).optional() }).parse(req.body ?? {});
      if (body.businessId && !(await userCanManageBusiness(req.dbUser!.id, body.businessId))) return res.status(403).json({ message: "Not authorized for this business workspace" });
      const input = automationDefinitionInputSchema.parse({
        name: body.name ?? template.name,
        description: template.description,
        businessId: body.businessId ?? null,
        triggerType: template.triggerType,
        steps: template.steps,
      });
      const definition = await db.transaction(async (tx) => {
        const [created] = await tx.insert(automationDefinitions).values({ ownerUserId: req.dbUser!.id, businessId: input.businessId ?? null, name: input.name, description: input.description, triggerType: input.triggerType, triggerConfig: input.triggerConfig, maxRunsPerHour: input.maxRunsPerHour, maxStepsPerRun: input.maxStepsPerRun, retentionDays: input.retentionDays }).returning();
        await tx.insert(automationSteps).values(input.steps.map((step) => ({ ...step, definitionId: created.id })));
        return created;
      });
      await writeDefinitionAudit("automation.definition.created_from_template", req.dbUser!.id, definition, { templateId: template.id });
      res.status(201).json(definition);
    } catch (error) {
      automationError(res, error);
    }
  });

  app.get("/api/automations/export", attachUser, async (req, res) => {
    try {
      const definitions = await db.select().from(automationDefinitions).where(eq(automationDefinitions.ownerUserId, req.dbUser!.id)).orderBy(asc(automationDefinitions.createdAt));
      const definitionIds = definitions.map((definition) => definition.id);
      const steps = definitionIds.length ? await db.select().from(automationSteps).where(inArray(automationSteps.definitionId, definitionIds)).orderBy(asc(automationSteps.position)) : [];
      const runs = definitionIds.length ? await db.select().from(automationRuns).where(and(inArray(automationRuns.definitionId, definitionIds), eq(automationRuns.initiatedByUserId, req.dbUser!.id))).orderBy(asc(automationRuns.createdAt)) : [];
      const runIds = runs.map((run) => run.id);
      const stepRuns = runIds.length ? await db.select().from(automationStepRuns).where(inArray(automationStepRuns.runId, runIds)).orderBy(asc(automationStepRuns.createdAt)) : [];
      const stepRunIds = stepRuns.map((stepRun) => stepRun.id);
      const [approvals, threads, audit, receipts] = await Promise.all([
        runIds.length ? db.select().from(automationApprovals).where(and(inArray(automationApprovals.runId, runIds), or(eq(automationApprovals.requestedForUserId, req.dbUser!.id), eq(automationApprovals.decidedByUserId, req.dbUser!.id)))).orderBy(asc(automationApprovals.createdAt)) : [],
        db.select().from(automationThreads).where(eq(automationThreads.ownerUserId, req.dbUser!.id)).orderBy(asc(automationThreads.createdAt)),
        db.select().from(automationAuditEvents).where(eq(automationAuditEvents.actorUserId, req.dbUser!.id)).orderBy(asc(automationAuditEvents.createdAt)),
        stepRunIds.length ? db.select().from(automationActionReceipts).where(inArray(automationActionReceipts.stepRunId, stepRunIds)).orderBy(asc(automationActionReceipts.createdAt)) : [],
      ]);
      const threadIds = threads.map((thread) => thread.id);
      const messages = threadIds.length ? await db.select().from(automationMessages).where(inArray(automationMessages.threadId, threadIds)).orderBy(asc(automationMessages.createdAt)) : [];
      res.setHeader("Content-Disposition", `attachment; filename="creativesos-automations-${new Date().toISOString().slice(0, 10)}.json"`);
      res.json({ exportedAt: new Date().toISOString(), ownerUserId: req.dbUser!.id, definitions, steps, runs, stepRuns, approvals, receipts, threads, messages, audit });
    } catch (error) {
      automationError(res, error);
    }
  });

  app.delete("/api/automations/data", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const input = z.object({ confirmation: z.literal("DELETE MY AUTOMATIONS") }).parse(req.body);
      void input;
      const definitions = await db.select({ id: automationDefinitions.id }).from(automationDefinitions).where(eq(automationDefinitions.ownerUserId, req.dbUser!.id));
      const definitionIds = definitions.map((definition) => definition.id);
      const deleted = await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('creativesos.audit_redaction', 'on', true)`);
        const auditWhere = definitionIds.length > 0
          ? or(eq(automationAuditEvents.actorUserId, req.dbUser!.id), inArray(automationAuditEvents.definitionId, definitionIds))
          : eq(automationAuditEvents.actorUserId, req.dbUser!.id);
        await tx.update(automationAuditEvents).set({ actorUserId: null, metadata: { redacted: true } }).where(auditWhere);
        if (definitionIds.length === 0) return [];
        return tx.delete(automationDefinitions).where(inArray(automationDefinitions.id, definitionIds)).returning({ id: automationDefinitions.id });
      });
      res.json({ status: "deleted", definitionsDeleted: deleted.length, auditEvidenceRedacted: true });
    } catch (error) {
      automationError(res, error);
    }
  });

  app.get("/api/automations/:id", attachUser, async (req, res) => {
    try {
      const definition = await ownedDefinition(req.dbUser!.id, req.params.id);
      const [steps, runs] = await Promise.all([
        db.select().from(automationSteps).where(eq(automationSteps.definitionId, definition.id)).orderBy(asc(automationSteps.position)),
        db.select().from(automationRuns).where(eq(automationRuns.definitionId, definition.id)).orderBy(desc(automationRuns.createdAt)).limit(25),
      ]);
      res.json({ ...definition, steps, runs });
    } catch (error) {
      automationError(res, error);
    }
  });

  app.patch("/api/automations/:id", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const definition = await ownedDefinition(req.dbUser!.id, req.params.id);
      if (definition.status === "archived") throw new Error("Archived automations cannot be edited");
      const input = automationDefinitionUpdateSchema.parse(req.body);
      if (input.steps) {
        validateActions(input.steps);
        validateStepIdentity(input.steps);
      }
      if (automationConfigContainsSecret(input.triggerConfig) || input.steps?.some((step) => automationConfigContainsSecret(step.config))) {
        throw new Error("Credentials and secret values cannot be stored in automation configuration");
      }
      validateTrigger(input.triggerType ?? definition.triggerType, input.triggerConfig ?? definition.triggerConfig);
      const activeRuns = await db.select({ id: automationRuns.id }).from(automationRuns).where(and(eq(automationRuns.definitionId, definition.id), inArray(automationRuns.status, ["queued", "running", "waiting_approval"]))).limit(1);
      if (activeRuns.length > 0 && input.steps) throw new Error("Wait for active runs before replacing automation steps");
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.update(automationDefinitions).set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.status === undefined ? {} : { status: input.status, lastActivatedAt: input.status === "active" ? new Date() : definition.lastActivatedAt }),
          ...(input.triggerType === undefined ? {} : { triggerType: input.triggerType }),
          ...(input.triggerConfig === undefined ? {} : { triggerConfig: input.triggerConfig }),
          ...(input.maxRunsPerHour === undefined ? {} : { maxRunsPerHour: input.maxRunsPerHour }),
          ...(input.maxStepsPerRun === undefined ? {} : { maxStepsPerRun: input.maxStepsPerRun }),
          ...(input.retentionDays === undefined ? {} : { retentionDays: input.retentionDays }),
          version: input.steps ? sql`${automationDefinitions.version} + 1` : definition.version,
          updatedAt: new Date(),
        }).where(eq(automationDefinitions.id, definition.id)).returning();
        if (input.steps) {
          await tx.delete(automationSteps).where(eq(automationSteps.definitionId, definition.id));
          await tx.insert(automationSteps).values(input.steps.map((step) => ({ ...step, definitionId: definition.id })));
        }
        return row;
      });
      await writeDefinitionAudit("automation.definition.updated", req.dbUser!.id, updated, { replacedSteps: Boolean(input.steps), status: updated.status });
      res.json(updated);
    } catch (error) {
      automationError(res, error);
    }
  });

  app.post("/api/automations/:id/run", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const definition = await ownedDefinition(req.dbUser!.id, req.params.id);
      if (definition.status !== "active") return res.status(409).json({ message: "Activate this automation before running it" });
      const input = automationRunInputSchema.parse(req.body ?? {});
      const run = await createAutomationRun({ definition, initiatedByUserId: req.dbUser!.id, input: input.input, idempotencyKey: input.idempotencyKey, maxCostUnits: input.maxCostUnits });
      void processAutomationRun(run.id);
      res.status(202).json(run);
    } catch (error) {
      automationError(res, error);
    }
  });

  app.post("/api/automations/:id/message", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const definition = await ownedDefinition(req.dbUser!.id, req.params.id);
      if (definition.status !== "active") return res.status(409).json({ message: "Activate this automation before messaging it" });
      if (definition.triggerType !== "message" && definition.triggerType !== "manual") return res.status(409).json({ message: "This automation does not accept conversational messages" });
      const input = automationThreadMessageSchema.extend({ threadId: z.string().uuid().optional() }).parse(req.body);
      if (input.threadId) {
        const [existingThread] = await db.select().from(automationThreads).where(and(eq(automationThreads.id, input.threadId), eq(automationThreads.ownerUserId, req.dbUser!.id), eq(automationThreads.definitionId, definition.id))).limit(1);
        if (!existingThread) return res.status(404).json({ message: "Automation conversation not found" });
      }
      const run = await createAutomationRun({
        definition,
        initiatedByUserId: req.dbUser!.id,
        input: { message: input.content },
        idempotencyKey: `message:${definition.id}:${crypto.randomUUID()}`,
        maxCostUnits: 100,
        threadId: input.threadId ?? null,
      });
      const [thread] = await db.select().from(automationThreads).where(eq(automationThreads.id, run.threadId!)).limit(1);
      if (thread) {
        await db.insert(automationMessages).values({ threadId: thread.id, authorType: "user", authorUserId: req.dbUser!.id, content: input.content });
      }
      void processAutomationRun(run.id);
      res.status(202).json({ run, thread: thread ?? null });
    } catch (error) {
      automationError(res, error);
    }
  });

  app.get("/api/automations/runs/:runId", attachUser, async (req, res) => {
    try {
      const { run } = await ownedRun(req.dbUser!.id, req.params.runId);
      const [stepRuns, approvals, audit, thread] = await Promise.all([
        db.select().from(automationStepRuns).where(eq(automationStepRuns.runId, run.id)).orderBy(asc(automationStepRuns.createdAt)),
        db.select().from(automationApprovals).where(eq(automationApprovals.runId, run.id)).orderBy(asc(automationApprovals.createdAt)),
        db.select().from(automationAuditEvents).where(eq(automationAuditEvents.runId, run.id)).orderBy(asc(automationAuditEvents.createdAt)),
        run.threadId
          ? db.select().from(automationThreads).where(eq(automationThreads.id, run.threadId)).limit(1)
          : db.select().from(automationThreads).where(eq(automationThreads.runId, run.id)).limit(1),
      ]);
      const messages = thread[0] ? await db.select().from(automationMessages).where(eq(automationMessages.threadId, thread[0].id)).orderBy(asc(automationMessages.createdAt)) : [];
      res.json({ ...run, stepRuns, approvals, audit, thread: thread[0] ? { ...thread[0], messages } : null });
    } catch (error) {
      automationError(res, error);
    }
  });

  app.post("/api/automations/runs/:runId/cancel", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const { run } = await ownedRun(req.dbUser!.id, req.params.runId);
      if (isTerminalAutomationStatus(run.status)) return res.status(409).json({ message: "This run has already finished" });
      const updated = await cancelAutomationRun({ run, actorUserId: req.dbUser!.id });
      res.json(updated);
    } catch (error) {
      automationError(res, error);
    }
  });

  app.post("/api/automations/runs/:runId/retry", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const { run } = await ownedRun(req.dbUser!.id, req.params.runId);
      if (run.status !== "failed" && run.status !== "dead_letter") return res.status(409).json({ message: "Only failed runs can be retried" });
      const [updated] = await db.update(automationRuns).set({ status: "queued", nextAttemptAt: sql`now()`, finishedAt: null, errorCode: null, errorMessage: null, updatedAt: new Date() }).where(eq(automationRuns.id, run.id)).returning();
      void processAutomationRun(run.id);
      res.status(202).json(updated);
    } catch (error) {
      automationError(res, error);
    }
  });

  app.get("/api/automations/approvals/pending", attachUser, async (req, res) => {
    const approvals = await db.select().from(automationApprovals).where(and(eq(automationApprovals.requestedForUserId, req.dbUser!.id), eq(automationApprovals.status, "pending"))).orderBy(desc(automationApprovals.createdAt));
    res.json(approvals);
  });

  app.post("/api/automations/approvals/:approvalId/decision", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const input = automationApprovalDecisionSchema.parse(req.body);
      const result = await decideAutomationApproval({ approvalId: req.params.approvalId, userId: req.dbUser!.id, decision: input.decision, note: input.note });
      if (input.decision === "approved") void processAutomationRun(result.runId);
      res.json(result.approval);
    } catch (error) {
      automationError(res, error);
    }
  });

  app.get("/api/automations/threads", attachUser, async (req, res) => {
    const threads = await db.select().from(automationThreads).where(eq(automationThreads.ownerUserId, req.dbUser!.id)).orderBy(desc(automationThreads.updatedAt)).limit(100);
    res.json(threads);
  });

  app.get("/api/automations/threads/:threadId/messages", attachUser, async (req, res) => {
    const [thread] = await db.select().from(automationThreads).where(and(eq(automationThreads.id, req.params.threadId), eq(automationThreads.ownerUserId, req.dbUser!.id))).limit(1);
    if (!thread) return res.status(404).json({ message: "Automation conversation not found" });
    const messages = await db.select().from(automationMessages).where(eq(automationMessages.threadId, thread.id)).orderBy(asc(automationMessages.createdAt));
    res.json(messages);
  });

  app.post("/api/automations/threads/:threadId/messages", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const input = automationThreadMessageSchema.parse(req.body);
      const [thread] = await db.select().from(automationThreads).where(and(eq(automationThreads.id, req.params.threadId), eq(automationThreads.ownerUserId, req.dbUser!.id))).limit(1);
      if (!thread) return res.status(404).json({ message: "Automation conversation not found" });
      const [message] = await db.insert(automationMessages).values({ threadId: thread.id, authorType: "user", authorUserId: req.dbUser!.id, content: input.content }).returning();
      await db.update(automationThreads).set({ updatedAt: new Date() }).where(eq(automationThreads.id, thread.id));
      let run = null;
      if (thread.definitionId) {
        const definition = await ownedDefinition(req.dbUser!.id, thread.definitionId);
        if (definition.status === "active" && (definition.triggerType === "message" || definition.triggerType === "manual")) {
          run = await createAutomationRun({ definition, initiatedByUserId: req.dbUser!.id, input: { message: input.content }, idempotencyKey: `thread-message:${message.id}`, maxCostUnits: 100, threadId: thread.id });
          void processAutomationRun(run.id);
        }
      }
      res.status(201).json({ message, run });
    } catch (error) {
      automationError(res, error);
    }
  });

  app.post("/api/automations/events", attachUser, limitAutomationMutation, async (req, res) => {
    try {
      const input = automationEventInputSchema.parse(req.body);
      if (input.businessId && !(await userCanManageBusiness(req.dbUser!.id, input.businessId))) return res.status(403).json({ message: "Not authorized for this business workspace" });
      const [event] = await db.insert(automationTriggerEvents).values({ ownerUserId: req.dbUser!.id, businessId: input.businessId ?? null, eventType: input.eventType, payload: input.payload, idempotencyKey: input.idempotencyKey }).onConflictDoNothing().returning();
      if (event) return res.status(202).json(event);
      const [existing] = await db.select().from(automationTriggerEvents).where(eq(automationTriggerEvents.idempotencyKey, input.idempotencyKey)).limit(1);
      res.status(200).json(existing);
    } catch (error) {
      automationError(res, error);
    }
  });

  app.get("/api/automations/health/summary", attachUser, async (req: Request, res: Response) => {
    const memberships = await db.select({ businessId: businessMembers.businessId }).from(businessMembers).where(eq(businessMembers.userId, req.dbUser!.id));
    const businessIds = memberships.map((membership) => membership.businessId);
    const definitions = await db.select({ id: automationDefinitions.id }).from(automationDefinitions).where(businessIds.length > 0 ? or(eq(automationDefinitions.ownerUserId, req.dbUser!.id), inArray(automationDefinitions.businessId, businessIds)) : eq(automationDefinitions.ownerUserId, req.dbUser!.id));
    const definitionIds = definitions.map((definition) => definition.id);
    if (definitionIds.length === 0) return res.json({ definitions: 0, queued: 0, running: 0, waitingApproval: 0, failed: 0 });
    const statusCounts = await db.select({ status: automationRuns.status, count: count() }).from(automationRuns).where(inArray(automationRuns.definitionId, definitionIds)).groupBy(automationRuns.status);
    const values = new Map(statusCounts.map((item) => [item.status, item.count]));
    res.json({ definitions: definitionIds.length, queued: values.get("queued") ?? 0, running: values.get("running") ?? 0, waitingApproval: values.get("waiting_approval") ?? 0, failed: (values.get("failed") ?? 0) + (values.get("dead_letter") ?? 0) });
  });
}
