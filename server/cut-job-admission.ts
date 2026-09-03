import { and, eq, sql } from "drizzle-orm";
import { cutStudioJobs, cutStudioProjectMedia, cutStudioProjects } from "@shared/schema";
import { db } from "./db";

/** Auxiliary jobs share the same owner cap as renders, batches and retries. */
export async function admitCutAuxiliaryJob(projectId: string, ownerUserId: number,
  kind: "proxy" | "highlights" | "transcribe", mediaId?: string) {
  return db.transaction(async transaction => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cutstudio.render-batch.owner.${ownerUserId}`}))`);
    const [project] = await transaction.select({ id: cutStudioProjects.id }).from(cutStudioProjects)
      .where(and(eq(cutStudioProjects.id, projectId), eq(cutStudioProjects.ownerUserId, ownerUserId))).for("share");
    if (!project) return { status: "not_found" as const };
    if (kind === "proxy") {
      if (!mediaId) return { status: "media_not_found" as const };
      const [media] = await transaction.select({ id: cutStudioProjectMedia.id, kind: cutStudioProjectMedia.mediaKind }).from(cutStudioProjectMedia)
        .where(and(eq(cutStudioProjectMedia.id, mediaId), eq(cutStudioProjectMedia.projectId, projectId), eq(cutStudioProjectMedia.ownerUserId, ownerUserId))).for("share");
      if (!media) return { status: "media_not_found" as const };
      if (media.kind !== "video") return { status: "not_video" as const };
      const [existing] = await transaction.select().from(cutStudioJobs).where(and(eq(cutStudioJobs.projectId, projectId),
        eq(cutStudioJobs.ownerUserId, ownerUserId), eq(cutStudioJobs.kind, "proxy"),
        sql`${cutStudioJobs.request}->>'mediaId' = ${mediaId}`,
        sql`(${cutStudioJobs.state} IN ('queued', 'running') OR (${cutStudioJobs.state} = 'done' AND ${cutStudioJobs.artifactAssetId} IS NOT NULL))`,
      )).limit(1);
      if (existing) return { status: "existing" as const, job: existing };
    }
    const [active] = await transaction.select({ count: sql<number>`count(*)::int` }).from(cutStudioJobs)
      .where(and(eq(cutStudioJobs.ownerUserId, ownerUserId), sql`${cutStudioJobs.state} IN ('queued', 'running')`));
    if (active.count >= 2) return { status: "busy" as const };
    const [job] = await transaction.insert(cutStudioJobs).values({ projectId, ownerUserId, kind,
      request: kind === "proxy" ? { mediaId } : {}, detail: kind === "proxy" ? "Editing proxy queued" : "Queued" }).returning();
    return { status: "created" as const, job };
  });
}
