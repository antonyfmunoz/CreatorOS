#!/usr/bin/env tsx
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../server/db";
import {
  automationActionReceipts,
  automationAuditEvents,
  automationContactStates,
  automationDefinitions,
  automationRuns,
  automationStepRuns,
  automationSteps,
  automationTriggerEvents,
  businessMembers,
  businesses,
  comments,
  conversations,
  directMessages,
  posts,
  users,
} from "../shared/schema";
import { createAutomationRun, processAutomationRun, processAutomationTriggerEvents, processDueAutomationRuns } from "../server/automation-engine";
import { NATIVE_COMMENT_CREATED_EVENT } from "../server/social-automation";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function cleanupQualificationFixtures(userIds?: number[], definitionIds?: string[]) {
  const matchedUsers = userIds ?? (await db.select({ id: users.id }).from(users).where(sql`${users.clerkId} like 'qualification_owner_%' or ${users.clerkId} like 'qualification_contact_%'`)).map((row) => row.id);
  if (matchedUsers.length === 0) return;
  const matchedDefinitions = definitionIds ?? (await db.select({ id: automationDefinitions.id }).from(automationDefinitions).where(inArray(automationDefinitions.ownerUserId, matchedUsers))).map((row) => row.id);
  await db.transaction(async (tx) => {
    // Deleting qualification fixtures updates nullable audit foreign keys. The
    // database permits that privacy-preserving mutation only under this local,
    // transaction-scoped flag; event identity and timestamps remain immutable.
    await tx.execute(sql`select set_config('creativesos.audit_redaction', 'on', true)`);
    if (matchedDefinitions.length > 0) {
      await tx.delete(automationRuns).where(inArray(automationRuns.definitionId, matchedDefinitions));
      await tx.delete(automationDefinitions).where(inArray(automationDefinitions.id, matchedDefinitions));
    }
    await tx.delete(users).where(inArray(users.id, matchedUsers));
  });
}

async function main() {
  const suffix = `${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const createdUserIds: number[] = [];
  const createdDefinitionIds: string[] = [];
  let qualificationResult: Record<string, unknown> | null = null;
  try {
    await cleanupQualificationFixtures();
    const [owner, contact] = await db.insert(users).values([
      { clerkId: `qualification_owner_${suffix}`, authEmail: `owner_${suffix}@example.invalid`, username: `owner_${suffix}`, displayName: "Automation Owner" },
      { clerkId: `qualification_contact_${suffix}`, authEmail: `contact_${suffix}@example.invalid`, username: `contact_${suffix}`, displayName: "Automation Contact" },
    ]).returning();
    createdUserIds.push(owner.id, contact.id);
    const [business] = await db.insert(businesses).values({ ownerUserId: owner.id, name: "Native Social Qualification", handle: `social_${suffix}`, isDefault: true }).returning();
    await db.insert(businessMembers).values({ businessId: business.id, userId: owner.id, role: "owner" });
    const [post] = await db.insert(posts).values({ userId: owner.id, content: "Keyword automation qualification", mediaType: "text" }).returning();
    const [sourceComment] = await db.insert(comments).values({ postId: post.id, userId: contact.id, content: "GUIDE" }).returning();

    const [definition] = await db.insert(automationDefinitions).values({
      ownerUserId: owner.id,
      businessId: business.id,
      name: "Comment keyword qualification",
      status: "active",
      triggerType: "event",
      triggerConfig: { eventType: NATIVE_COMMENT_CREATED_EVENT, keywords: ["guide"], matchMode: "exact", topLevelOnly: true },
      maxRunsPerHour: 100,
    }).returning();
    createdDefinitionIds.push(definition.id);
    await db.insert(automationSteps).values([
      { definitionId: definition.id, stepKey: "reply", name: "Reply", actionType: "native.comment.reply", config: { content: "Sent—check your DMs." }, position: 0, approvalPolicy: "none" },
      { definitionId: definition.id, stepKey: "dm", name: "DM", actionType: "native.dm.send", config: { content: "Here is your requested guide.", cooldownMinutes: 0 }, position: 1, approvalPolicy: "none" },
    ]);
    const [event] = await db.insert(automationTriggerEvents).values({
      ownerUserId: owner.id,
      businessId: business.id,
      eventType: NATIVE_COMMENT_CREATED_EVENT,
      idempotencyKey: `qualification:native-comment:${suffix}`,
      payload: { channel: "native", actorUserId: contact.id, actorDisplayName: contact.displayName, commentId: sourceComment.id, postId: post.id, parentId: null, content: sourceComment.content, automated: false },
    }).returning();

    await processAutomationTriggerEvents();
    await processDueAutomationRuns();
    const [run] = await db.select().from(automationRuns).where(eq(automationRuns.triggerEventId, event.id)).limit(1);
    assert(run?.status === "succeeded", `Comment keyword run ended as ${run?.status ?? "missing"}`);
    const [replyCount] = await db.select({ count: count() }).from(comments).where(and(eq(comments.parentId, sourceComment.id), eq(comments.userId, owner.id)));
    const [dmCount] = await db.select({ count: count() }).from(directMessages).where(eq(directMessages.senderId, owner.id));
    assert(replyCount.count === 1, "Comment keyword workflow did not create exactly one public reply");
    assert(dmCount.count === 1, "Comment keyword workflow did not create exactly one DM");
    await processAutomationRun(run.id);
    const [replayReplyCount] = await db.select({ count: count() }).from(comments).where(and(eq(comments.parentId, sourceComment.id), eq(comments.userId, owner.id)));
    const [replayDmCount] = await db.select({ count: count() }).from(directMessages).where(eq(directMessages.senderId, owner.id));
    assert(replayReplyCount.count === 1 && replayDmCount.count === 1, "Reprocessing duplicated a social side effect");

    await db.update(automationContactStates).set({ optedOut: true, optedOutAt: new Date(), cooldownUntil: null }).where(and(eq(automationContactStates.ownerUserId, owner.id), eq(automationContactStates.contactUserId, contact.id)));
    const [dmOnlyDefinition] = await db.insert(automationDefinitions).values({
      ownerUserId: owner.id,
      businessId: business.id,
      name: "Opt-out qualification",
      status: "active",
      triggerType: "event",
      triggerConfig: { eventType: "native.dm.received", keywords: ["guide"], matchMode: "exact" },
    }).returning();
    createdDefinitionIds.push(dmOnlyDefinition.id);
    await db.insert(automationSteps).values({ definitionId: dmOnlyDefinition.id, stepKey: "dm", name: "DM", actionType: "native.dm.send", config: { content: "This must not send." }, position: 0, approvalPolicy: "none" });
    const [optOutEvent] = await db.insert(automationTriggerEvents).values({
      ownerUserId: owner.id,
      businessId: business.id,
      eventType: "native.dm.received",
      idempotencyKey: `qualification:optout-event:${suffix}`,
      payload: { channel: "native", actorUserId: contact.id, content: "guide", automated: false },
      status: "processed",
      processedAt: new Date(),
    }).returning();
    const optedOutRun = await createAutomationRun({ definition: dmOnlyDefinition, initiatedByUserId: owner.id, input: optOutEvent.payload, idempotencyKey: `qualification:optout:${suffix}`, maxCostUnits: 10, triggerEventId: optOutEvent.id });
    await processAutomationRun(optedOutRun.id);
    const [optedOutReceipt] = await db.select({ output: automationActionReceipts.output })
      .from(automationActionReceipts)
      .innerJoin(automationStepRuns, eq(automationStepRuns.id, automationActionReceipts.stepRunId))
      .where(and(eq(automationStepRuns.runId, optedOutRun.id), eq(automationActionReceipts.actionType, "native.dm.send")))
      .limit(1);
    const [finalDmCount] = await db.select({ count: count() }).from(directMessages).where(eq(directMessages.senderId, owner.id));
    assert(finalDmCount.count === 1, "Opted-out contact received an automated DM");
    const [completedOptOutRun] = await db.select().from(automationRuns).where(eq(automationRuns.id, optedOutRun.id));
    assert(completedOptOutRun.status === "succeeded", "Opt-out suppression did not produce a completed governed run");

    qualificationResult = {
      status: "qualified",
      commentKeywordTrigger: "passed",
      publicReply: "passed",
      directMessage: "passed",
      sideEffectIdempotency: "passed",
      optOutSuppression: "passed",
      evidenceReceiptObserved: optedOutReceipt?.output?.reason === "contact_opted_out",
    };
  } finally {
    if (createdUserIds.length > 0) await cleanupQualificationFixtures(createdUserIds, createdDefinitionIds);
    // Audit records deliberately remain append-only; qualification identities
    // become null through their foreign-key policy when fixtures are removed.
  }
  assert(qualificationResult, "Qualification did not produce a result");
  console.log(JSON.stringify({ ...qualificationResult, fixtureCleanup: "passed" }));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
