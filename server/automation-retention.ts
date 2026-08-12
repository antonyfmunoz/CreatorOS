import { inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  automationActionReceipts,
  automationApprovals,
  automationAuditEvents,
  automationDefinitions,
  automationMessages,
  automationRuns,
  automationStepRuns,
  automationThreads,
} from "../shared/schema";

const RETENTION_BATCH_SIZE = 100;

export async function redactExpiredAutomationPayloads(now = new Date()) {
  const nowIso = now.toISOString();
  const expired = await db
    .select({ id: automationRuns.id, definitionId: automationRuns.definitionId })
    .from(automationRuns)
    .innerJoin(automationDefinitions, sql`${automationDefinitions.id} = ${automationRuns.definitionId}`)
    .where(sql`${automationRuns.payloadRedactedAt} is null
      and ${automationRuns.finishedAt} is not null
      and ${automationRuns.finishedAt} < ${nowIso}::timestamptz - (${automationDefinitions.retentionDays} || ' days')::interval`)
    .limit(RETENTION_BATCH_SIZE);
  if (expired.length === 0) return { runsRedacted: 0 };
  const runIds = expired.map((run) => run.id);

  await db.transaction(async (tx) => {
    await tx.update(automationRuns).set({ input: {}, output: {}, errorMessage: null, payloadRedactedAt: now, updatedAt: now }).where(inArray(automationRuns.id, runIds));
    const stepRuns = await tx.select({ id: automationStepRuns.id }).from(automationStepRuns).where(inArray(automationStepRuns.runId, runIds));
    const stepRunIds = stepRuns.map((stepRun) => stepRun.id);
    await tx.update(automationStepRuns).set({ input: {}, output: {}, errorMessage: null, updatedAt: now }).where(inArray(automationStepRuns.runId, runIds));
    await tx.update(automationApprovals).set({ reason: "Expired under the automation retention policy", evidence: {}, updatedAt: now }).where(inArray(automationApprovals.runId, runIds));
    if (stepRunIds.length > 0) await tx.update(automationActionReceipts).set({ output: {} }).where(inArray(automationActionReceipts.stepRunId, stepRunIds));
    await tx.execute(sql`
      update ${automationMessages} as message
      set content = 'Expired under the automation retention policy', metadata = '{}'::json
      from ${automationThreads} as thread
      join ${automationDefinitions} as definition on definition.id = thread.definition_id
      where message.thread_id = thread.id
        and message.created_at < ${nowIso}::timestamptz - (definition.retention_days || ' days')::interval
        and message.content <> 'Expired under the automation retention policy'
    `);
    await tx.insert(automationAuditEvents).values(expired.map((run) => ({ definitionId: run.definitionId, runId: run.id, eventType: "automation.payload.redacted", metadata: { retentionAppliedAt: now.toISOString() } })));
  });
  return { runsRedacted: runIds.length };
}
