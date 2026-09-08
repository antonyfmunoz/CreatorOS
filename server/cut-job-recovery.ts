import { and, eq, isNull, sql } from "drizzle-orm";
import { cutStudioJobs, cutStudioLocalNodes } from "@shared/schema";
import { removeStoredAsset } from "./asset-storage";
import { db } from "./db";

/** One canonical recovery path for the worker tick and owner status polling.
 * Cancellation is terminal; an expired attempt never receives a fresh budget. */
export async function recoverCutJobs(jobId?: string) {
  const now = sql`clock_timestamp() AT TIME ZONE 'UTC'`;
  const cancelled = sql`${cutStudioJobs.cancellationRequestedAt} IS NOT NULL`;
  const exhausted = sql`${cutStudioJobs.attempt} >= ${cutStudioJobs.maxAttempts}`;
  // The final accepted start retains its complete window before it can fail.
  const dispatchExhausted = sql`(${cutStudioJobs.state} = 'queued' AND ${cutStudioJobs.dispatchAttempt} >= ${cutStudioJobs.maxDispatchAttempts} AND (${cutStudioJobs.dispatchExpiresAt} IS NULL OR ${cutStudioJobs.dispatchExpiresAt} <= (${now})))`;
  const terminal = sql`(${exhausted} OR ${dispatchExhausted})`;
  const recoverable = sql`((${cutStudioJobs.state} = 'running' AND (
      ${cutStudioJobs.leaseExpiresAt} <= (${now}) OR
      (${cutStudioJobs.leaseExpiresAt} IS NULL AND ${cutStudioJobs.startedAt} <= (${now}) - interval '35 minutes')
    )) OR (${cutStudioJobs.state} = 'queued' AND (${cancelled} OR ${terminal})))`;
  // Retain pre-update worker/output values. PostgreSQL RETURNING reflects the
  // cleared lease fields, while a paired local node needs its old identity and
  // temporary object key for safe recovery cleanup.
  const candidates = await db.select({ id: cutStudioJobs.id, workerId: cutStudioJobs.workerId, output: cutStudioJobs.output })
    .from(cutStudioJobs).where(and(jobId ? eq(cutStudioJobs.id, jobId) : undefined, recoverable));
  const rows = await db.update(cutStudioJobs).set({
    state: sql`CASE WHEN ${cancelled} THEN 'cancelled' WHEN ${terminal} THEN 'error' ELSE 'queued' END`,
    detail: sql`CASE WHEN ${cancelled} THEN 'Cancelled by user' WHEN ${exhausted} THEN 'Automatic recovery limit reached. Review the failure before retrying.' WHEN ${dispatchExhausted} THEN 'Worker start limit reached. Review the failure before retrying.' ELSE 'Recovering interrupted worker lease' END`,
    errorCode: sql`CASE WHEN ${cancelled} THEN NULL WHEN ${exhausted} THEN 'worker_retry_exhausted' WHEN ${dispatchExhausted} THEN 'cloud_dispatch_exhausted' ELSE NULL END`,
    progress: 0, workerId: null, workerRegion: null, leaseToken: null, leaseExpiresAt: null,
    heartbeatAt: null, startedAt: null,
    finishedAt: sql`CASE WHEN ${cancelled} OR ${terminal} THEN ${now} ELSE NULL END`,
  }).where(and(jobId ? eq(cutStudioJobs.id, jobId) : undefined, recoverable)).returning({ id: cutStudioJobs.id, state: cutStudioJobs.state });
  const recoveredIds = new Set(rows.map(row => row.id));
  const released = candidates.filter(candidate => recoveredIds.has(candidate.id));
  const localNodeIds = new Set<string>();
  await Promise.all(released.map(async candidate => {
    const nodeId = candidate.workerId?.match(/^cut-local-node:([^:]+)$/)?.[1];
    if (nodeId) localNodeIds.add(nodeId);
    const localNode = candidate.output && typeof candidate.output === "object" && !Array.isArray(candidate.output) ? (candidate.output as Record<string, unknown>).localNode : null;
    let temporaryStorageKey: string | null = null;
    if (localNode && typeof localNode === "object" && !Array.isArray(localNode)) {
      const value = (localNode as Record<string, unknown>).temporaryStorageKey;
      if (typeof value === "string") temporaryStorageKey = value;
    }
    if (temporaryStorageKey) await removeStoredAsset(temporaryStorageKey, "private").catch(() => undefined);
  }));
  await Promise.all(Array.from(localNodeIds).map(nodeId => db.update(cutStudioLocalNodes).set({ status: "ready", updatedAt: new Date() }).where(and(
    eq(cutStudioLocalNodes.id, nodeId), eq(cutStudioLocalNodes.status, "busy"), isNull(cutStudioLocalNodes.revokedAt),
    sql`not exists (select 1 from ${cutStudioJobs} where ${cutStudioJobs.workerId} = ${`cut-local-node:${nodeId}`} and ${cutStudioJobs.state} = 'running' and ${cutStudioJobs.leaseExpiresAt} > clock_timestamp())`,
  )).catch(() => undefined)));
  return rows;
}

/** Repeated clicks on the same failed job resolve to one child job. A failed
 * child may be explicitly retried in turn; it is never an automatic new budget. */
export async function retryCutJob(jobId: string, ownerUserId: number) {
  return db.transaction(async transaction => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    // Same owner lock as ordinary and composition-batch render admission.
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cutstudio.render-batch.owner.${ownerUserId}`}))`);
    const [job] = await transaction.select().from(cutStudioJobs)
      .where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.ownerUserId, ownerUserId))).for("update");
    if (!job) return { status: "not_found" as const };
    if (job.state !== "error") return { status: "not_failed" as const };
    const [existing] = await transaction.select().from(cutStudioJobs)
      .where(and(eq(cutStudioJobs.retryOfJobId, job.id), eq(cutStudioJobs.ownerUserId, ownerUserId)));
    if (existing) return { status: "existing" as const, job: existing };
    const [active] = await transaction.select({ count: sql<number>`count(*)::int` }).from(cutStudioJobs)
      .where(and(eq(cutStudioJobs.ownerUserId, ownerUserId), sql`${cutStudioJobs.state} IN ('queued', 'running')`));
    if (active.count >= 2) return { status: "busy" as const };
    // A retry is a new, explicitly approved attempt, not a chance to silently
    // widen the original worker-dispatch budget (especially for paired local
    // code execution, which intentionally has one claim per request).
    const [retry] = await transaction.insert(cutStudioJobs).values({ projectId: job.projectId, ownerUserId,
      kind: job.kind, request: job.request, retryOfJobId: job.id, maxAttempts: job.maxAttempts,
      maxDispatchAttempts: job.maxDispatchAttempts, detail: "Retry queued" }).returning();
    return { status: "created" as const, job: retry };
  });
}
