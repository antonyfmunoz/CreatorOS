import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { cutJobLeaseIsOwned, updateCutJobProgress } from "../server/cut-studio";
import { watchCutJobLease } from "../server/cut-job-lease-watch";
import { runCutNativeProcess } from "../server/cut-native-process";
import { cutStudioJobs, cutStudioProjects } from "../shared/schema";

/** Actual SQL authority changes and an actual trusted child process. */
export async function qualifyCutJobCancellation(project: typeof cutStudioProjects.$inferSelect) {
  assert.equal(process.env.QUALIFICATION_ISOLATED_DATABASE, "true");
  const outcomes: unknown[] = [];
  for (const reason of ["cancelled", "reassigned", "expired"] as const) {
    const token = crypto.randomUUID();
    const [job] = await db.insert(cutStudioJobs).values({ projectId: project.id, ownerUserId: project.ownerUserId, kind: "render", state: "running", detail: "cancellation proof", leaseToken: token, leaseExpiresAt: new Date(Date.now() + 60_000) }).returning();
    const controller = new AbortController();
    const stop = watchCutJobLease(controller, () => cutJobLeaseIsOwned(job.id, token));
    let ready!: () => void, pid: number | undefined;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    const child = runCutNativeProcess(process.execPath, ["-e", 'process.stdout.write("ready");setInterval(() => {},1000)'], {
      timeoutMs: 10_000, signal: controller.signal,
      started(process) { pid = process.pid; process.stdout.once("data", ready); },
    }).then(() => null, (error: Error) => error);
    try {
      await Promise.race([started, child.then(() => { throw new Error("Cancellation child exited before readiness"); })]);
      assert.equal(await cutJobLeaseIsOwned(job.id, token), true);
      await updateCutJobProgress(job.id, token, .35, "Owned preparation");
      // A database update represents another application/worker instance; no
      // direct call to this process's AbortController is made here.
      await db.update(cutStudioJobs).set(reason === "cancelled" ? { state: "cancelled", leaseExpiresAt: null } : reason === "reassigned" ? { leaseToken: crypto.randomUUID() } : { leaseExpiresAt: new Date(Date.now() - 1_000) }).where(eq(cutStudioJobs.id, job.id));
      assert.equal(await cutJobLeaseIsOwned(job.id, token), false);
      await assert.rejects(updateCutJobProgress(job.id, token, .4, "Must not advance"), /cancelled or lease lost/);
      const failure = await child;
      assert.match(failure?.message ?? "", /cancelled or lease lost/);
      assert.equal(controller.signal.aborted, true);
      assert(pid && pid > 0);
      assert.throws(() => process.kill(pid!, 0));
      const [remaining] = await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, job.id));
      assert.equal(remaining.progress, .35);
      outcomes.push({ reason, childExited: true, stalePreparationRejected: true, noProgressOverwrite: true });
    } finally {
      stop(); controller.abort(); await child;
      await db.delete(cutStudioJobs).where(eq(cutStudioJobs.id, job.id));
    }
  }
  return { databaseAuthorityAndRealChild: true, outcomes };
}
