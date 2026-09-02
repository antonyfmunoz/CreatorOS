import { and, eq, inArray, sql } from "drizzle-orm";
import { db, closeDatabase } from "../server/db";
import { claimCutStudioJob, cutWorkerIdentity, recoverInterruptedCutStudioJobs } from "../server/cut-studio";
import { qualifyCutWorkerAdmission } from "./qualify-cut-worker-admission";
import { qualifyMediaWorkerAdmission } from "./qualify-media-worker-admission";
import { qualifyCutJobCancellation } from "./qualify-cut-job-cancellation";
import { claimMediaJob, mediaWorkerIdentity, recoverInterruptedMediaJobs } from "../server/media-processing";
import { assets, businesses, cutStudioJobs, cutStudioProjects, mediaProcessingJobs, mediaWorkerNodes, users } from "../shared/schema";

const expired = new Date(Date.now() - 60_000);
const active = new Date(Date.now() + 5 * 60_000);
const workerNodeIds = ["iad-active", "sjc-stale", cutWorkerIdentity().id, mediaWorkerIdentity().id];
let qualificationPassed = false;
let admissionReceipt: Awaited<ReturnType<typeof qualifyCutWorkerAdmission>> | undefined;
let mediaAdmissionReceipt: Awaited<ReturnType<typeof qualifyMediaWorkerAdmission>> | undefined;
let cancellationReceipt: Awaited<ReturnType<typeof qualifyCutJobCancellation>> | undefined;

if (process.env.QUALIFICATION_ISOLATED_DATABASE !== "true") {
  throw new Error("Worker resilience qualification requires an isolated disposable database");
}

try {
  const [user] = await db.insert(users).values({ clerkId: "worker_resilience", username: "worker_resilience", displayName: "Worker resilience" }).returning();
  const [business] = await db.insert(businesses).values({ ownerUserId: user.id, name: "Worker resilience", handle: "worker-resilience", isDefault: true }).returning();
  const [asset] = await db.insert(assets).values({ ownerUserId: user.id, businessId: business.id, kind: "video", storageProvider: "local", storageKey: "qualification/source.mp4", mimeType: "video/mp4", sizeBytes: 1, visibility: "private", status: "ready", originalFilename: "source.mp4" }).returning();
  const [project] = await db.insert(cutStudioProjects).values({ ownerUserId: user.id, businessId: business.id, sourceAssetId: asset.id, name: "Lease recovery", duration: 10, mediaKind: "video", edl: { version: 3, clips: [{ id: "clip", start: 0, end: 10, timelineStart: 0, trackId: "video-1", assetId: asset.id }], tracks: [{ id: "video-1", kind: "video", name: "Video 1", order: 0, locked: false, hidden: false, muted: false, solo: false, gain: 1 }], graphics: [], audioBuses: [], markers: [] } }).returning();

  admissionReceipt = await qualifyCutWorkerAdmission(project);
  mediaAdmissionReceipt = await qualifyMediaWorkerAdmission(asset);
  cancellationReceipt = await qualifyCutJobCancellation(project);

  await db.insert(mediaWorkerNodes).values([
    { id: "iad-active", region: "iad", capabilities: ["transcode"], maxConcurrency: 2, activeJobs: 1, status: "active", heartbeatAt: new Date() },
    { id: "sjc-stale", region: "sjc", capabilities: ["cut_render"], maxConcurrency: 1, activeJobs: 1, status: "active", heartbeatAt: expired },
  ]);
  await db.insert(mediaProcessingJobs).values([
    { assetId: asset.id, ownerUserId: user.id, businessId: business.id, kind: "transcode", state: "running", idempotencyKey: "expired-media-job", workerId: "sjc-stale", workerRegion: "sjc", leaseToken: crypto.randomUUID(), leaseExpiresAt: expired, heartbeatAt: expired },
    { assetId: asset.id, ownerUserId: user.id, businessId: business.id, kind: "transcode", state: "running", idempotencyKey: "active-media-job", workerId: "iad-active", workerRegion: "iad", leaseToken: crypto.randomUUID(), leaseExpiresAt: active, heartbeatAt: new Date() },
  ]);
  await db.insert(cutStudioJobs).values([
    { projectId: project.id, ownerUserId: user.id, kind: "render", state: "running", detail: "expired", workerId: "sjc-stale", workerRegion: "sjc", leaseToken: crypto.randomUUID(), leaseExpiresAt: expired, heartbeatAt: expired, startedAt: expired },
    { projectId: project.id, ownerUserId: user.id, kind: "render", state: "running", detail: "active", workerId: "iad-active", workerRegion: "iad", leaseToken: crypto.randomUUID(), leaseExpiresAt: active, heartbeatAt: new Date(), startedAt: new Date() },
  ]);

  const [contendedMedia] = await db.insert(mediaProcessingJobs).values({ assetId: asset.id, ownerUserId: user.id, businessId: business.id, kind: "transcode", state: "queued", idempotencyKey: "contended-media-job" }).returning();
  const [contendedCut] = await db.insert(cutStudioJobs).values({ projectId: project.id, ownerUserId: user.id, kind: "render", state: "queued", detail: "contended" }).returning();
  const mediaContenders = ["iad-claimant", "sjc-claimant"].map((id) => ({ id, region: id.slice(0, 3), capabilities: ["transcode"], maxConcurrency: 1, version: "qualification" }));
  const cutContenders = ["creativesos-qualification-first", "creativesos-qualification-second"].map((execution) => cutWorkerIdentity({
    CLOUD_RUN_EXECUTION: execution, CLOUD_RUN_TASK_INDEX: "0", CLOUD_RUN_TASK_ATTEMPT: "0", CUT_WORKER_REGION: "us-central1", CUT_WORKER_CONCURRENCY: "1", CUT_WORKER_CAPABILITIES: "cut_render", RELEASE_COMMIT: "qualification",
  }));
  if (cutContenders[0].id === cutContenders[1].id) throw new Error("Independent cloud executions share a worker identity");
  const [mediaClaims, cutClaims] = await Promise.all([
    Promise.all(mediaContenders.map((identity) => claimMediaJob(contendedMedia.id, identity, crypto.randomUUID()))),
    Promise.all(cutContenders.map((identity) => claimCutStudioJob(contendedCut.id, identity, crypto.randomUUID()))),
  ]);
  if (mediaClaims.filter(Boolean).length !== 1 || cutClaims.filter(Boolean).length !== 1) throw new Error("Concurrent worker claims were not serialized");
  const claimedCut = cutClaims.find(Boolean);
  if (!claimedCut || !cutContenders.some((identity) => identity.id === claimedCut.workerId)) throw new Error("Cloud claim lost its execution-specific identity");
  await Promise.all([
    db.update(mediaProcessingJobs).set({ state: "cancelled", leaseExpiresAt: null }).where(eq(mediaProcessingJobs.id, contendedMedia.id)),
    db.update(cutStudioJobs).set({ state: "cancelled", leaseExpiresAt: null }).where(eq(cutStudioJobs.id, contendedCut.id)),
  ]);

  const [mediaRecovered, cutRecovered] = await Promise.all([recoverInterruptedMediaJobs(), recoverInterruptedCutStudioJobs()]);
  if (mediaRecovered !== 1 || cutRecovered !== 1) throw new Error(`Expected one recovery per queue, received media=${mediaRecovered}, cut=${cutRecovered}`);
  const [mediaRows, cutRows] = await Promise.all([
    db.select({ key: mediaProcessingJobs.idempotencyKey, state: mediaProcessingJobs.state, workerId: mediaProcessingJobs.workerId, lease: mediaProcessingJobs.leaseExpiresAt }).from(mediaProcessingJobs),
    db.select({ detail: cutStudioJobs.detail, state: cutStudioJobs.state, workerId: cutStudioJobs.workerId, lease: cutStudioJobs.leaseExpiresAt }).from(cutStudioJobs),
  ]);
  const recoveredMedia = mediaRows.find((row) => row.key === "expired-media-job");
  const activeMedia = mediaRows.find((row) => row.key === "active-media-job");
  const recoveredCut = cutRows.find((row) => row.detail.includes("Recovering"));
  const activeCut = cutRows.find((row) => row.detail === "active");
  if (recoveredMedia?.state !== "queued" || recoveredMedia.workerId !== null || recoveredMedia.lease !== null) throw new Error("Expired Media Cloud lease was not safely released");
  if (activeMedia?.state !== "running" || activeMedia.workerId !== "iad-active") throw new Error("Active Media Cloud lease was incorrectly recovered");
  if (recoveredCut?.state !== "queued" || recoveredCut.workerId !== null || recoveredCut.lease !== null) throw new Error("Expired CutStudio lease was not safely released");
  if (activeCut?.state !== "running" || activeCut.workerId !== "iad-active") throw new Error("Active CutStudio lease was incorrectly recovered");
  const activeNode = await db.select().from(mediaWorkerNodes).where(and(eq(mediaWorkerNodes.id, "iad-active"), eq(mediaWorkerNodes.status, "active"))).limit(1);
  if (!activeNode.length) throw new Error("Worker registry lost the active node");
  qualificationPassed = true;
} finally {
  try {
    const [fixtureUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, "worker_resilience"))
      .limit(1);
    if (fixtureUser) {
      await db.delete(cutStudioJobs).where(eq(cutStudioJobs.ownerUserId, fixtureUser.id));
      await db.delete(mediaProcessingJobs).where(eq(mediaProcessingJobs.ownerUserId, fixtureUser.id));
      await db.delete(cutStudioProjects).where(eq(cutStudioProjects.ownerUserId, fixtureUser.id));
      await db.delete(assets).where(eq(assets.ownerUserId, fixtureUser.id));
      await db.delete(businesses).where(eq(businesses.ownerUserId, fixtureUser.id));
      await db.delete(users).where(eq(users.id, fixtureUser.id));
    }
    await db.delete(mediaWorkerNodes).where(inArray(mediaWorkerNodes.id, workerNodeIds));
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM users`);
    const leakedFixtures = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, "worker_resilience"));
    if (leakedFixtures.length) throw new Error("Worker resilience qualification leaked browser-visible fixtures");
    if (qualificationPassed) {
      console.log(JSON.stringify({ status: "qualified", mediaRecovered: 1, cutRecovered: 1, activeLeasesPreserved: 2, serializedClaims: 2, cloudExecutionClaimIdentity: true, workerRegistryPreserved: true, fixtureLeakage: 0, admission: admissionReceipt, mediaAdmission: mediaAdmissionReceipt, cancellation: cancellationReceipt }));
    }
  } finally {
    await closeDatabase();
  }
}
