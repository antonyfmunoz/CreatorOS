import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cutStudioJobs } from "@shared/schema";
import { db } from "./db";

type CutTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
class CutLeaseLost extends Error {}

async function boundTransaction(transaction: CutTransaction) {
  await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
  await transaction.execute(sql`SET LOCAL statement_timeout = '5s'`);
  await transaction.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
}

/** A delayed heartbeat cannot resurrect an expired native-render attempt. */
export async function renewCutJobLease(jobId: string, leaseToken: string, leaseMs: number) {
  if (!leaseToken || !Number.isInteger(leaseMs) || leaseMs <= 0) return false;
  return db.transaction(async transaction => {
    await boundTransaction(transaction);
    await transaction.select({ id: cutStudioJobs.id }).from(cutStudioJobs)
      .where(eq(cutStudioJobs.id, jobId)).for("update");
    const rows = await transaction.update(cutStudioJobs).set({
      heartbeatAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`,
      leaseExpiresAt: sql`(clock_timestamp() AT TIME ZONE 'UTC') + ${leaseMs} * interval '1 millisecond'`,
    }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "running"),
      eq(cutStudioJobs.leaseToken, leaseToken), isNull(cutStudioJobs.cancellationRequestedAt),
      gt(cutStudioJobs.leaseExpiresAt, sql`clock_timestamp() AT TIME ZONE 'UTC'`),
    )).returning({ id: cutStudioJobs.id });
    return rows.length === 1;
  });
}

/** Serialize progress/result writes against cancellation and reassignment.
 * Return undefined for lost authority; genuine database failures propagate.
 * The callback may change terminal state, but may not extend its own lease. */
export async function withCutJobLeaseWrite<T>(jobId: string, leaseToken: string,
  write: (transaction: CutTransaction) => Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
  const checkAbort = () => { if (signal?.aborted) throw new CutLeaseLost(); };
  try {
    checkAbort();
    return await db.transaction(async transaction => {
      await boundTransaction(transaction);
      const [current] = await transaction.select().from(cutStudioJobs)
        .where(eq(cutStudioJobs.id, jobId)).for("update");
      checkAbort();
      if (!leaseToken || !current || current.state !== "running" || current.leaseToken !== leaseToken
        || current.cancellationRequestedAt || !current.leaseExpiresAt) throw new CutLeaseLost();
      const expires = current.leaseExpiresAt.toISOString();
      const checkClock = async () => {
        const rows = await transaction.execute(sql`SELECT clock_timestamp() < ${expires}::timestamptz AS live`);
        if (rows[0].live !== true) throw new CutLeaseLost();
        checkAbort();
      };
      await checkClock();
      const result = await write(transaction);
      await checkClock();
      return result;
    });
  } catch (error) {
    if (error instanceof CutLeaseLost) return undefined;
    throw error;
  }
}
