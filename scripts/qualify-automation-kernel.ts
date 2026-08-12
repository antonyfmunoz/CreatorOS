#!/usr/bin/env tsx
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  automationApprovals,
  automationActionReceipts,
  automationAuditEvents,
  automationDefinitions,
  automationRuns,
  automationStepRuns,
  automationSteps,
  businessMembers,
  businesses,
  campaigns,
  contentDrafts,
  notifications,
  users,
} from "../shared/schema";
import {
  cancelAutomationRun,
  createAutomationRun,
  decideAutomationApproval,
  processAutomationRun,
  recoverStaleAutomationRuns,
} from "../server/automation-engine";
import { redactExpiredAutomationPayloads } from "../server/automation-retention";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createDefinition(values: {
  ownerUserId: number;
  businessId: string;
  name: string;
  maxRunsPerHour?: number;
  steps: Array<{
    stepKey: string;
    name: string;
    actionType: string;
    config: Record<string, unknown>;
    approvalPolicy?: string;
    retryLimit?: number;
    position: number;
  }>;
}) {
  return db.transaction(async (tx) => {
    const [definition] = await tx.insert(automationDefinitions).values({
      ownerUserId: values.ownerUserId,
      businessId: values.businessId,
      name: values.name,
      status: "active",
      maxRunsPerHour: values.maxRunsPerHour ?? 100,
    }).returning();
    await tx.insert(automationSteps).values(values.steps.map((step) => ({
      definitionId: definition.id,
      stepKey: step.stepKey,
      name: step.name,
      actionType: step.actionType,
      config: step.config,
      approvalPolicy: step.approvalPolicy ?? "none",
      retryLimit: step.retryLimit ?? 1,
      timeoutMs: 10_000,
      position: step.position,
    })));
    return definition;
  });
}

async function main() {
  const [user] = await db.insert(users).values({ clerkId: "qualification_user", authEmail: "qualification@example.invalid", username: "qualification", displayName: "Qualification User" }).returning();
  const [business] = await db.insert(businesses).values({ ownerUserId: user.id, name: "Qualification Business", handle: "qualification_business", isDefault: true }).returning();
  await db.insert(businessMembers).values({ businessId: business.id, userId: user.id, role: "owner" });

  const nativeDefinition = await createDefinition({
    ownerUserId: user.id,
    businessId: business.id,
    name: "Native content workflow",
    maxRunsPerHour: 1_000,
    steps: [
      { stepKey: "compose", name: "Compose", actionType: "text.compose", config: { template: "Launch: {{input.brief}}" }, position: 0 },
      { stepKey: "draft", name: "Draft", actionType: "content_draft.create", config: { content: "{{previous.content}}", kind: "post", audience: "public" }, position: 1 },
      { stepKey: "notify", name: "Notify", actionType: "notification.create", config: { message: "Draft ready", linkTo: "/studio" }, position: 2 },
    ],
  });
  const nativeRun = await createAutomationRun({ definition: nativeDefinition, initiatedByUserId: user.id, input: { brief: "field test" }, idempotencyKey: "qualification-native-run", maxCostUnits: 10 });
  const sameRun = await createAutomationRun({ definition: nativeDefinition, initiatedByUserId: user.id, input: { brief: "ignored duplicate" }, idempotencyKey: "qualification-native-run", maxCostUnits: 10 });
  assert(nativeRun.id === sameRun.id, "Run idempotency did not return the original run");
  await Promise.all(Array.from({ length: 20 }, () => processAutomationRun(nativeRun.id)));
  const [completedNative] = await db.select().from(automationRuns).where(eq(automationRuns.id, nativeRun.id));
  assert(completedNative.status === "succeeded", `Native run ended as ${completedNative.status}`);
  assert(completedNative.stepCount === 3 && completedNative.costUnits === 4, "Native run accounting is incorrect");
  const [nativeDraftCount] = await db.select({ count: count() }).from(contentDrafts).where(eq(contentDrafts.userId, user.id));
  const [nativeNotificationCount] = await db.select({ count: count() }).from(notifications).where(eq(notifications.userId, user.id));
  assert(nativeDraftCount.count === 1, "Concurrent claims created duplicate drafts");
  assert(nativeNotificationCount.count === 1, "Concurrent claims created duplicate notifications");

  const conversationRun = await createAutomationRun({ definition: nativeDefinition, initiatedByUserId: user.id, input: { brief: "conversation continuation" }, idempotencyKey: "qualification-conversation-run", maxCostUnits: 10, threadId: nativeRun.threadId });
  await processAutomationRun(conversationRun.id);
  assert(conversationRun.threadId === nativeRun.threadId, "Conversational continuation created a disconnected thread");

  const approvalDefinition = await createDefinition({
    ownerUserId: user.id,
    businessId: business.id,
    name: "Approval workflow",
    steps: [{ stepKey: "campaign", name: "Create campaign", actionType: "campaign.create", config: { name: "Approved campaign", description: "Qualification" }, approvalPolicy: "consequential", position: 0 }],
  });
  const approvalRun = await createAutomationRun({ definition: approvalDefinition, initiatedByUserId: user.id, input: {}, idempotencyKey: "qualification-approval-run", maxCostUnits: 10 });
  await processAutomationRun(approvalRun.id);
  const [waitingRun] = await db.select().from(automationRuns).where(eq(automationRuns.id, approvalRun.id));
  const [approval] = await db.select().from(automationApprovals).where(eq(automationApprovals.runId, approvalRun.id));
  assert(waitingRun.status === "waiting_approval" && approval?.status === "pending", "Consequential action did not pause for approval");
  const approvalDecision = await decideAutomationApproval({ approvalId: approval.id, userId: user.id, decision: "approved", note: "Qualification approval" });
  assert(approvalDecision.approval.evidence?.decisionNote === "Qualification approval", "Approval evidence was not persisted");
  await processAutomationRun(approvalRun.id);
  const [completedApproval] = await db.select().from(automationRuns).where(eq(automationRuns.id, approvalRun.id));
  const [campaignCount] = await db.select({ count: count() }).from(campaigns).where(eq(campaigns.ownerUserId, user.id));
  assert(completedApproval.status === "succeeded" && campaignCount.count === 1, "Approved action did not complete exactly once");

  const canceledRun = await createAutomationRun({ definition: approvalDefinition, initiatedByUserId: user.id, input: {}, idempotencyKey: "qualification-canceled-run", maxCostUnits: 10 });
  await processAutomationRun(canceledRun.id);
  const canceledResult = await cancelAutomationRun({ run: canceledRun, actorUserId: user.id });
  const [expiredApproval] = await db.select().from(automationApprovals).where(eq(automationApprovals.runId, canceledRun.id));
  assert(canceledResult.status === "canceled" && expiredApproval.status === "expired", "Cancel did not atomically clear the pending approval");

  const failingDefinition = await createDefinition({
    ownerUserId: user.id,
    businessId: business.id,
    name: "Retry workflow",
    steps: [{ stepKey: "fail", name: "Fail safely", actionType: "text.compose", config: {}, retryLimit: 1, position: 0 }],
  });
  const failingRun = await createAutomationRun({ definition: failingDefinition, initiatedByUserId: user.id, input: {}, idempotencyKey: "qualification-retry-run", maxCostUnits: 10 });
  await processAutomationRun(failingRun.id);
  await db.update(automationRuns).set({ nextAttemptAt: sql`now()` }).where(eq(automationRuns.id, failingRun.id));
  await db.update(automationStepRuns).set({ nextAttemptAt: sql`now()` }).where(and(eq(automationStepRuns.runId, failingRun.id), eq(automationStepRuns.status, "queued")));
  await processAutomationRun(failingRun.id);
  const [deadLetter] = await db.select().from(automationRuns).where(eq(automationRuns.id, failingRun.id));
  assert(deadLetter.status === "dead_letter", `Retry exhaustion ended as ${deadLetter.status}`);

  const staleRun = await createAutomationRun({ definition: nativeDefinition, initiatedByUserId: user.id, input: { brief: "recovery" }, idempotencyKey: "qualification-stale-run", maxCostUnits: 10 });
  await db.update(automationRuns).set({ status: "running", heartbeatAt: new Date(Date.now() - 10 * 60_000) }).where(eq(automationRuns.id, staleRun.id));
  const recovered = await recoverStaleAutomationRuns();
  const [recoveredRun] = await db.select().from(automationRuns).where(eq(automationRuns.id, staleRun.id));
  assert(recovered === 1 && recoveredRun.status === "queued", "Stale run recovery failed");

  const loadRuns = await Promise.all(Array.from({ length: 50 }, (_value, index) => createAutomationRun({ definition: nativeDefinition, initiatedByUserId: user.id, input: { brief: `load-${index}` }, idempotencyKey: `qualification-load-${index}`, maxCostUnits: 10 })));
  await Promise.all(loadRuns.flatMap((run) => [processAutomationRun(run.id), processAutomationRun(run.id)]));
  const loadStatuses = await db.select({ status: automationRuns.status, count: count() }).from(automationRuns).where(inArray(automationRuns.id, loadRuns.map((run) => run.id))).groupBy(automationRuns.status);
  assert(loadStatuses.length === 1 && loadStatuses[0].status === "succeeded" && loadStatuses[0].count === 50, "Concurrent load qualification did not complete all runs");

  const [receiptCount] = await db.select({ count: count() }).from(automationActionReceipts);
  assert(receiptCount.count === 105, `Expected 105 crash-safe native receipts, received ${receiptCount.count}`);

  await db.update(automationDefinitions).set({ retentionDays: 1 }).where(eq(automationDefinitions.id, nativeDefinition.id));
  await db.update(automationRuns).set({ finishedAt: new Date(Date.now() - 2 * 24 * 60 * 60_000) }).where(eq(automationRuns.id, conversationRun.id));
  const retention = await redactExpiredAutomationPayloads();
  const [redactedRun] = await db.select().from(automationRuns).where(eq(automationRuns.id, conversationRun.id));
  assert(retention.runsRedacted === 1 && redactedRun.payloadRedactedAt && Object.keys(redactedRun.input).length === 0, "Automation retention did not redact expired payloads");

  const [audit] = await db.select().from(automationAuditEvents).where(eq(automationAuditEvents.runId, nativeRun.id)).limit(1);
  let auditMutationRejected = false;
  try {
    await db.update(automationAuditEvents).set({ eventType: "tampered" }).where(eq(automationAuditEvents.id, audit.id));
  } catch {
    auditMutationRejected = true;
  }
  assert(auditMutationRejected, "Append-only audit protection allowed a mutation");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('creativesos.audit_redaction', 'on', true)`);
    await tx.update(automationAuditEvents).set({ actorUserId: null, metadata: { redacted: true } }).where(eq(automationAuditEvents.id, audit.id));
  });
  const [redactedAudit] = await db.select().from(automationAuditEvents).where(eq(automationAuditEvents.id, audit.id));
  assert(redactedAudit.actorUserId === null && redactedAudit.eventType === audit.eventType, "Privacy redaction damaged audit identity-independent evidence");

  const [summary] = await db.select({ runs: count(), totalCostUnits: sql<number>`coalesce(sum(${automationRuns.costUnits}), 0)::int` }).from(automationRuns);
  console.log(JSON.stringify({
    status: "qualified",
    runs: summary.runs,
    totalCostUnits: summary.totalCostUnits,
    concurrentLoadRuns: 50,
    approvalGate: "passed",
    cancellation: "passed",
    idempotency: "passed",
    retryDeadLetter: "passed",
    staleRecovery: "passed",
    crashSafeReceipts: receiptCount.count,
    retentionRedaction: "passed",
    appendOnlyAudit: "passed",
    privacyAuditRedaction: "passed",
  }));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
