import crypto from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "./db";
import {
  automationApprovals,
  automationAuditEvents,
  automationDefinitions,
  automationMessages,
  automationRuns,
  automationStepRuns,
  automationSteps,
  automationThreads,
  automationTriggerEvents,
  type AutomationDefinition,
  type AutomationRun,
  type AutomationStep,
} from "../shared/schema";
import { executeAutomationAction, getAutomationAction } from "./automation-actions";
import {
  automationBackoffMs,
  requiresAutomationApproval,
  sanitizeAutomationError,
} from "./automation-policy";
import { matchesNativeSocialTrigger } from "./social-automation";

const RUN_BATCH_SIZE = 10;
const STALE_RUN_MS = 2 * 60_000;

async function appendAudit(
  eventType: string,
  values: {
    actorUserId?: number | null;
    businessId?: string | null;
    definitionId?: string | null;
    runId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(automationAuditEvents).values({
    actorUserId: values.actorUserId ?? null,
    businessId: values.businessId ?? null,
    definitionId: values.definitionId ?? null,
    runId: values.runId ?? null,
    eventType,
    metadata: values.metadata ?? {},
  });
}

async function appendRunMessage(
  runId: string,
  kind: "message" | "action" | "approval" | "status" | "error",
  content: string,
  metadata: Record<string, unknown> = {},
) {
  const [run] = await db.select({ threadId: automationRuns.threadId }).from(automationRuns).where(eq(automationRuns.id, runId)).limit(1);
  const [thread] = run?.threadId
    ? await db.select({ id: automationThreads.id }).from(automationThreads).where(eq(automationThreads.id, run.threadId)).limit(1)
    : await db.select({ id: automationThreads.id }).from(automationThreads).where(eq(automationThreads.runId, runId)).limit(1);
  if (!thread) return;
  await db.transaction(async (tx) => {
    await tx.insert(automationMessages).values({ threadId: thread.id, authorType: "automation", kind, content, metadata });
    await tx.update(automationThreads).set({ updatedAt: new Date() }).where(eq(automationThreads.id, thread.id));
  });
}

export async function createAutomationRun(values: {
  definition: AutomationDefinition;
  initiatedByUserId: number;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  maxCostUnits: number;
  triggerEventId?: string | null;
  threadId?: string | null;
}) {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000);
  const [usage] = await db
    .select({ count: count() })
    .from(automationRuns)
    .where(and(eq(automationRuns.definitionId, values.definition.id), gt(automationRuns.createdAt, oneHourAgo)));
  if (usage.count >= values.definition.maxRunsPerHour) {
    throw new Error("Automation hourly run budget reached");
  }

  const idempotencyKey = values.idempotencyKey ?? `manual:${values.definition.id}:${crypto.randomUUID()}`;
  const [run] = await db
    .insert(automationRuns)
    .values({
      definitionId: values.definition.id,
      definitionVersion: values.definition.version,
      businessId: values.definition.businessId,
      initiatedByUserId: values.initiatedByUserId,
      triggerType: values.definition.triggerType,
      triggerEventId: values.triggerEventId ?? null,
      threadId: values.threadId ?? null,
      idempotencyKey,
      input: values.input,
      maxCostUnits: values.maxCostUnits,
    })
    .onConflictDoNothing()
    .returning();
  if (!run) {
    const [existing] = await db.select().from(automationRuns).where(eq(automationRuns.idempotencyKey, idempotencyKey)).limit(1);
    if (!existing) throw new Error("Unable to resolve idempotent automation run");
    return existing;
  }

  if (!values.threadId) {
    const [thread] = await db.insert(automationThreads).values({
      ownerUserId: values.definition.ownerUserId,
      businessId: values.definition.businessId,
      definitionId: values.definition.id,
      runId: run.id,
      title: values.definition.name,
    }).returning();
    await db.update(automationRuns).set({ threadId: thread.id }).where(eq(automationRuns.id, run.id));
    run.threadId = thread.id;
  }
  await appendAudit("automation.run.queued", {
    actorUserId: values.initiatedByUserId,
    businessId: values.definition.businessId,
    definitionId: values.definition.id,
    runId: run.id,
    metadata: { idempotencyKey },
  });
  await appendRunMessage(run.id, "status", `Started ${values.definition.name}.`);
  return run;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Automation action timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function finishRun(run: AutomationRun, output: Record<string, unknown>) {
  const now = new Date();
  await db.update(automationRuns).set({
    status: "succeeded",
    output,
    currentStepKey: null,
    heartbeatAt: now,
    finishedAt: now,
    updatedAt: now,
    errorCode: null,
    errorMessage: null,
  }).where(eq(automationRuns.id, run.id));
  await appendAudit("automation.run.succeeded", { actorUserId: run.initiatedByUserId, businessId: run.businessId, definitionId: run.definitionId, runId: run.id });
  await appendRunMessage(run.id, "status", "Automation completed successfully.", output);
}

async function failRun(
  run: AutomationRun,
  status: "failed" | "dead_letter",
  errorCode: string,
  error: unknown,
) {
  const errorMessage = sanitizeAutomationError(error);
  const now = new Date();
  await db.update(automationRuns).set({ status, errorCode, errorMessage, finishedAt: now, heartbeatAt: now, updatedAt: now }).where(eq(automationRuns.id, run.id));
  await appendAudit(`automation.run.${status}`, {
    actorUserId: run.initiatedByUserId,
    businessId: run.businessId,
    definitionId: run.definitionId,
    runId: run.id,
    metadata: { errorCode, errorMessage },
  });
  await appendRunMessage(run.id, "error", errorMessage, { errorCode });
}

async function processStep(
  run: AutomationRun,
  definition: AutomationDefinition,
  step: AutomationStep,
  previousOutput: Record<string, unknown>,
) {
  const action = getAutomationAction(step.actionType);
  if (!action) {
    await failRun(run, "dead_letter", "unsupported_action", `Unsupported automation action: ${step.actionType}`);
    return "stopped" as const;
  }

  const stepHistory = await db
    .select()
    .from(automationStepRuns)
    .where(and(eq(automationStepRuns.runId, run.id), eq(automationStepRuns.stepKey, step.stepKey)))
    .orderBy(desc(automationStepRuns.attempt));
  const latest = stepHistory[0];
  if (latest?.status === "succeeded") return { status: "completed" as const, output: latest.output, newCostUnits: 0 };

  const needsApproval = requiresAutomationApproval(
    step.approvalPolicy as "none" | "always" | "consequential",
    action.consequential,
  );
  let stepRun = latest;
  if (!stepRun) {
    [stepRun] = await db.insert(automationStepRuns).values({
      runId: run.id,
      stepId: step.id,
      stepKey: step.stepKey,
      actionType: step.actionType,
      attempt: 1,
      status: needsApproval ? "waiting_approval" : "queued",
      idempotencyKey: `${run.id}:${step.stepKey}:1`,
      input: { run: run.input, previous: previousOutput, config: step.config },
    }).returning();
  }

  if (needsApproval) {
    const [approval] = await db.select().from(automationApprovals).where(eq(automationApprovals.stepRunId, stepRun.id)).limit(1);
    if (!approval) {
      await db.insert(automationApprovals).values({
        runId: run.id,
        stepRunId: stepRun.id,
        requestedForUserId: definition.ownerUserId,
        reason: `${step.name} needs your approval before CreativesOS can continue.`,
        evidence: { actionType: step.actionType, config: step.config },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      });
      await db.update(automationRuns).set({ status: "waiting_approval", currentStepKey: step.stepKey, heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(automationRuns.id, run.id));
      await appendAudit("automation.approval.requested", { actorUserId: run.initiatedByUserId, businessId: run.businessId, definitionId: run.definitionId, runId: run.id, metadata: { stepKey: step.stepKey, actionType: step.actionType } });
      await appendRunMessage(run.id, "approval", `${step.name} is waiting for your approval.`, { stepKey: step.stepKey });
      return "stopped" as const;
    }
    if (approval.status === "pending") return "stopped" as const;
    if (approval.status !== "approved") {
      await failRun(run, "failed", "approval_declined", `${step.name} was not approved`);
      return "stopped" as const;
    }
  }

  const projectedCost = run.costUnits + action.defaultCostUnits;
  if (projectedCost > run.maxCostUnits) {
    await failRun(run, "failed", "cost_budget_exceeded", "Automation cost-unit budget exceeded");
    return "stopped" as const;
  }

  const [currentRun] = await db.select({ status: automationRuns.status }).from(automationRuns).where(eq(automationRuns.id, run.id)).limit(1);
  if (currentRun?.status === "canceled") return "stopped" as const;

  const now = new Date();
  await db.update(automationStepRuns).set({ status: "running", startedAt: stepRun.startedAt ?? now, heartbeatAt: now, updatedAt: now }).where(eq(automationStepRuns.id, stepRun.id));
  await db.update(automationRuns).set({ status: "running", currentStepKey: step.stepKey, heartbeatAt: now, updatedAt: now }).where(eq(automationRuns.id, run.id));

  try {
    const result = await withTimeout(executeAutomationAction(step.actionType, {
      runId: run.id,
      stepRunId: stepRun.id,
      triggerEventId: run.triggerEventId,
      ownerUserId: definition.ownerUserId,
      businessId: definition.businessId,
      input: run.input,
      previousOutput,
      config: step.config,
    }), step.timeoutMs);
    const finishedAt = new Date();
    await db.update(automationStepRuns).set({ status: "succeeded", output: result.output, costUnits: result.costUnits, heartbeatAt: finishedAt, finishedAt, updatedAt: finishedAt }).where(eq(automationStepRuns.id, stepRun.id));
    await db.update(automationRuns).set({ costUnits: sql`${automationRuns.costUnits} + ${result.costUnits}`, stepCount: sql`${automationRuns.stepCount} + 1`, heartbeatAt: finishedAt, updatedAt: finishedAt }).where(eq(automationRuns.id, run.id));
    await appendAudit("automation.step.succeeded", { actorUserId: run.initiatedByUserId, businessId: run.businessId, definitionId: run.definitionId, runId: run.id, metadata: { stepKey: step.stepKey, actionType: step.actionType, summary: result.summary, costUnits: result.costUnits } });
    await appendRunMessage(run.id, "action", result.summary, { stepKey: step.stepKey, output: result.output });
    return { status: "completed" as const, output: result.output, newCostUnits: result.costUnits };
  } catch (error) {
    const errorMessage = sanitizeAutomationError(error);
    const attempt = stepRun.attempt;
    const canRetry = attempt <= step.retryLimit;
    const finishedAt = new Date();
    await db.update(automationStepRuns).set({ status: "failed", errorCode: canRetry ? "retryable_action_error" : "action_error", errorMessage, heartbeatAt: finishedAt, finishedAt, updatedAt: finishedAt }).where(eq(automationStepRuns.id, stepRun.id));
    if (!canRetry) {
      await failRun(run, "dead_letter", "retry_limit_exceeded", errorMessage);
      return "stopped" as const;
    }
    const nextAttemptAt = new Date(Date.now() + automationBackoffMs(attempt));
    await db.insert(automationStepRuns).values({
      runId: run.id,
      stepId: step.id,
      stepKey: step.stepKey,
      actionType: step.actionType,
      attempt: attempt + 1,
      status: "queued",
      idempotencyKey: `${run.id}:${step.stepKey}:${attempt + 1}`,
      input: { run: run.input, previous: previousOutput, config: step.config },
      nextAttemptAt,
    });
    await db.update(automationRuns).set({ status: "queued", nextAttemptAt, errorCode: "retry_scheduled", errorMessage, heartbeatAt: finishedAt, updatedAt: finishedAt }).where(eq(automationRuns.id, run.id));
    await appendAudit("automation.step.retry_scheduled", { actorUserId: run.initiatedByUserId, businessId: run.businessId, definitionId: run.definitionId, runId: run.id, metadata: { stepKey: step.stepKey, attempt: attempt + 1, nextAttemptAt: nextAttemptAt.toISOString() } });
    return "stopped" as const;
  }
}

export async function processAutomationRun(runId: string) {
  const [claimed] = await db
    .update(automationRuns)
    .set({ status: "running", startedAt: sql`coalesce(${automationRuns.startedAt}, now())`, heartbeatAt: new Date(), updatedAt: new Date() })
    .where(and(eq(automationRuns.id, runId), eq(automationRuns.status, "queued"), sql`${automationRuns.nextAttemptAt} <= now()`))
    .returning();
  if (!claimed) return false;

  const [definition] = await db.select().from(automationDefinitions).where(eq(automationDefinitions.id, claimed.definitionId)).limit(1);
  if (!definition) {
    await failRun(claimed, "dead_letter", "definition_missing", "Automation definition no longer exists");
    return true;
  }
  if (claimed.definitionVersion !== definition.version) {
    await failRun(claimed, "dead_letter", "definition_version_mismatch", "The automation changed after this run was queued");
    return true;
  }
  const steps = await db.select().from(automationSteps).where(eq(automationSteps.definitionId, definition.id)).orderBy(asc(automationSteps.position));
  if (steps.length === 0 || steps.length > definition.maxStepsPerRun) {
    await failRun(claimed, "dead_letter", "invalid_step_budget", "Automation has no executable steps or exceeds its step budget");
    return true;
  }

  let previousOutput: Record<string, unknown> = {};
  for (const step of steps) {
    const outcome = await processStep(claimed, definition, step, previousOutput);
    if (outcome === "stopped") return true;
    previousOutput = outcome.output;
    const [currentRun] = await db.select({ status: automationRuns.status, costUnits: automationRuns.costUnits }).from(automationRuns).where(eq(automationRuns.id, claimed.id)).limit(1);
    if (!currentRun || currentRun.status === "canceled") return true;
    claimed.costUnits = currentRun.costUnits;
  }
  await finishRun(claimed, previousOutput);
  return true;
}

export async function decideAutomationApproval(input: {
  approvalId: string;
  userId: number;
  decision: "approved" | "declined";
  note?: string;
}) {
  const [approval] = await db.select().from(automationApprovals).where(eq(automationApprovals.id, input.approvalId)).limit(1);
  if (!approval) throw new Error("Approval not found");
  if (approval.requestedForUserId !== input.userId) throw new Error("This approval belongs to another user");
  if (approval.status !== "pending") throw new Error("This approval has already been decided");

  const [updated] = await db.transaction(async (tx) => {
    const [row] = await tx.update(automationApprovals).set({
      status: input.decision,
      decidedByUserId: input.userId,
      decidedAt: new Date(),
      updatedAt: new Date(),
      evidence: { ...(approval.evidence ?? {}), decisionNote: input.note ?? null },
    }).where(and(eq(automationApprovals.id, approval.id), eq(automationApprovals.status, "pending"))).returning();
    if (!row) throw new Error("Approval decision raced with another request");
    if (input.decision === "approved") {
      await tx.update(automationStepRuns).set({ status: "queued", updatedAt: new Date() }).where(eq(automationStepRuns.id, approval.stepRunId));
      await tx.update(automationRuns).set({ status: "queued", nextAttemptAt: sql`now()`, updatedAt: new Date() }).where(eq(automationRuns.id, approval.runId));
    } else {
      await tx.update(automationStepRuns).set({ status: "canceled", finishedAt: new Date(), updatedAt: new Date() }).where(eq(automationStepRuns.id, approval.stepRunId));
      await tx.update(automationRuns).set({ status: "failed", errorCode: "approval_declined", errorMessage: "Required approval was declined", finishedAt: new Date(), updatedAt: new Date() }).where(eq(automationRuns.id, approval.runId));
    }
    await tx.insert(automationAuditEvents).values({
      actorUserId: input.userId,
      runId: approval.runId,
      eventType: `automation.approval.${input.decision}`,
      metadata: { approvalId: approval.id, note: input.note ?? null },
    });
    return [row];
  });
  return { approval: updated, runId: approval.runId };
}

export async function cancelAutomationRun(input: { run: AutomationRun; actorUserId: number }) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(automationRuns).set({
      status: "canceled",
      finishedAt: now,
      heartbeatAt: now,
      updatedAt: now,
    }).where(and(eq(automationRuns.id, input.run.id), inArray(automationRuns.status, ["queued", "running", "waiting_approval"]))).returning();
    if (!updated) throw new Error("This run has already finished");
    await tx.update(automationStepRuns).set({ status: "canceled", finishedAt: now, updatedAt: now }).where(and(eq(automationStepRuns.runId, input.run.id), inArray(automationStepRuns.status, ["queued", "running", "waiting_approval"])));
    await tx.update(automationApprovals).set({ status: "expired", decidedByUserId: input.actorUserId, decidedAt: now, updatedAt: now }).where(and(eq(automationApprovals.runId, input.run.id), eq(automationApprovals.status, "pending")));
    await tx.insert(automationAuditEvents).values({
      actorUserId: input.actorUserId,
      businessId: input.run.businessId,
      definitionId: input.run.definitionId,
      runId: input.run.id,
      eventType: "automation.run.canceled",
      metadata: { reason: "owner_requested" },
    });
    return updated;
  });
}

export async function recoverStaleAutomationRuns() {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const staleRuns = await db.select({ id: automationRuns.id }).from(automationRuns).where(and(eq(automationRuns.status, "running"), lt(automationRuns.heartbeatAt, staleBefore))).limit(RUN_BATCH_SIZE);
  if (staleRuns.length === 0) return 0;
  const ids = staleRuns.map((run) => run.id);
  await db.update(automationStepRuns).set({ status: "failed", errorCode: "stale_worker", errorMessage: "Recovered after an interrupted worker", finishedAt: new Date(), updatedAt: new Date() }).where(and(inArray(automationStepRuns.runId, ids), eq(automationStepRuns.status, "running")));
  await db.update(automationRuns).set({ status: "queued", nextAttemptAt: sql`now()`, errorCode: "stale_worker_recovered", errorMessage: "Recovered after an interrupted worker", updatedAt: new Date() }).where(inArray(automationRuns.id, ids));
  return ids.length;
}

export async function expireAutomationApprovals() {
  const expired = await db.update(automationApprovals).set({ status: "expired", updatedAt: new Date() }).where(and(eq(automationApprovals.status, "pending"), lt(automationApprovals.expiresAt, new Date()))).returning({ runId: automationApprovals.runId });
  if (expired.length > 0) {
    await db.update(automationRuns).set({ status: "failed", errorCode: "approval_expired", errorMessage: "Required approval expired", finishedAt: new Date(), updatedAt: new Date() }).where(inArray(automationRuns.id, expired.map((item) => item.runId)));
  }
  return expired.length;
}

export async function processDueAutomationRuns() {
  await recoverStaleAutomationRuns();
  await expireAutomationApprovals();
  const due = await db.select({ id: automationRuns.id }).from(automationRuns).where(and(eq(automationRuns.status, "queued"), sql`${automationRuns.nextAttemptAt} <= now()`)).orderBy(asc(automationRuns.nextAttemptAt)).limit(RUN_BATCH_SIZE);
  let processed = 0;
  for (const run of due) {
    if (await processAutomationRun(run.id)) processed += 1;
  }
  return processed;
}

export async function processAutomationTriggerEvents() {
  const pending = await db.select().from(automationTriggerEvents).where(eq(automationTriggerEvents.status, "pending")).orderBy(asc(automationTriggerEvents.receivedAt)).limit(RUN_BATCH_SIZE);
  let processed = 0;
  for (const event of pending) {
    const definitions = await db.select().from(automationDefinitions).where(and(eq(automationDefinitions.ownerUserId, event.ownerUserId), eq(automationDefinitions.status, "active"), eq(automationDefinitions.triggerType, "event")));
    for (const definition of definitions) {
      const config = definition.triggerConfig as Record<string, unknown>;
      if (!matchesNativeSocialTrigger(config, event.eventType, event.payload)) continue;
      await createAutomationRun({ definition, initiatedByUserId: event.ownerUserId, input: event.payload, idempotencyKey: `event:${event.id}:${definition.id}`, maxCostUnits: 100, triggerEventId: event.id });
    }
    await db.update(automationTriggerEvents).set({ status: "processed", processedAt: new Date() }).where(eq(automationTriggerEvents.id, event.id));
    processed += 1;
  }
  return processed;
}

export async function processScheduledAutomations() {
  const definitions = await db.select().from(automationDefinitions).where(and(eq(automationDefinitions.status, "active"), eq(automationDefinitions.triggerType, "schedule"))).limit(RUN_BATCH_SIZE);
  let queued = 0;
  for (const definition of definitions) {
    const config = definition.triggerConfig as Record<string, unknown>;
    const intervalMinutes = typeof config.intervalMinutes === "number"
      ? Math.max(5, Math.min(10_080, Math.floor(config.intervalMinutes)))
      : null;
    if (!intervalMinutes) continue;
    const bucket = Math.floor(Date.now() / (intervalMinutes * 60_000));
    await createAutomationRun({
      definition,
      initiatedByUserId: definition.ownerUserId,
      input: { scheduledAt: new Date().toISOString(), intervalMinutes },
      idempotencyKey: `schedule:${definition.id}:${bucket}`,
      maxCostUnits: 100,
    });
    queued += 1;
  }
  return queued;
}

let automationTimer: NodeJS.Timeout | undefined;

export function scheduleAutomationProcessing() {
  if (automationTimer) return;
  const tick = async () => {
    try {
      await processAutomationTriggerEvents();
      await processScheduledAutomations();
      await processDueAutomationRuns();
    } catch (error) {
      console.error("Automation processing failed:", sanitizeAutomationError(error));
    }
  };
  void tick();
  automationTimer = setInterval(() => void tick(), 5_000);
  automationTimer.unref();
}
