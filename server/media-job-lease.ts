import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { mediaProcessingJobs, type MediaProcessingJob } from "@shared/schema";
import { db } from "./db";

type MediaTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Evaluate expiry AFTER any database lock wait, using the database clock. A
 * timestamp captured by the caller could otherwise revive an expired lease. */
export async function renewMediaJobLease(
  claim: Pick<MediaProcessingJob, "id" | "leaseToken">,
  leaseMs: number,
) {
  const leaseToken = claim.leaseToken;
  if (!leaseToken || !Number.isInteger(leaseMs) || leaseMs <= 0) return false;
  return db.transaction(async transaction => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    // Lock separately: a predicate evaluated before waiting for an unchanged
    // row is not enough. The following UPDATE starts only after lock acquisition.
    await transaction.select({ id: mediaProcessingJobs.id }).from(mediaProcessingJobs)
      .where(eq(mediaProcessingJobs.id, claim.id)).for("update");
    const rows = await transaction.update(mediaProcessingJobs).set({
      // These existing columns store UTC WITHOUT a timezone. Do not allow
      // PostgreSQL's session timezone to reinterpret expiry or heartbeat data.
      heartbeatAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`,
      leaseExpiresAt: sql`(clock_timestamp() AT TIME ZONE 'UTC') + ${leaseMs} * interval '1 millisecond'`,
      updatedAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`,
    }).where(and(
      eq(mediaProcessingJobs.id, claim.id), eq(mediaProcessingJobs.state, "running"),
      eq(mediaProcessingJobs.leaseToken, leaseToken), isNull(mediaProcessingJobs.cancellationRequestedAt),
      gt(mediaProcessingJobs.leaseExpiresAt, sql`clock_timestamp() AT TIME ZONE 'UTC'`),
    )).returning({ id: mediaProcessingJobs.id });
    return rows.length === 1;
  });
}

/** Serialize publication with cancellation/reassignment of the same durable job.
 * Object storage happens beforehand under unique attempt keys; only this short
 * transaction may publish its database metadata/rendition reference. */
export async function withMediaLeaseWrite<T>(
  claim: Pick<MediaProcessingJob, "id" | "leaseToken">,
  signal: AbortSignal,
  write: (transaction: MediaTransaction) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  return db.transaction(async transaction => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    const [current] = await transaction.select().from(mediaProcessingJobs)
      .where(eq(mediaProcessingJobs.id, claim.id)).for("update");
    signal.throwIfAborted();
    if (!claim.leaseToken || !current || current.state !== "running"
      || current.leaseToken !== claim.leaseToken || current.cancellationRequestedAt
      || !current.leaseExpiresAt) {
      throw Object.assign(new Error("Media processing cancelled or lease lost"), { code: "media_lease_lost" });
    }
    const leaseIsLive = async () => {
      const rows = await transaction.execute(sql`SELECT clock_timestamp() < ${current.leaseExpiresAt!.toISOString()}::timestamptz AS live`);
      return rows[0].live === true;
    };
    if (!await leaseIsLive()) throw Object.assign(new Error("Media processing cancelled or lease lost"), { code: "media_lease_lost" });
    signal.throwIfAborted();
    const result = await write(transaction);
    // A local abort during the write rolls back, rather than publishing a result
    // after the owning attempt was disposed. A remote cancel takes this row lock.
    signal.throwIfAborted();
    if (!await leaseIsLive()) {
      throw Object.assign(new Error("Media processing lease expired before publication"), { code: "media_lease_lost" });
    }
    signal.throwIfAborted();
    return result;
  });
}
