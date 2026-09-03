import { eq, sql } from "drizzle-orm";
import { mediaProcessingJobs, type MediaProcessingJob } from "@shared/schema";
import { db } from "./db";

type MediaTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
      || !current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= Date.now()) {
      throw Object.assign(new Error("Media processing cancelled or lease lost"), { code: "media_lease_lost" });
    }
    const result = await write(transaction);
    // A local abort during the write rolls back, rather than publishing a result
    // after the owning attempt was disposed. A remote cancel takes this row lock.
    signal.throwIfAborted();
    if (current.leaseExpiresAt.getTime() <= Date.now()) {
      throw Object.assign(new Error("Media processing lease expired before publication"), { code: "media_lease_lost" });
    }
    return result;
  });
}
