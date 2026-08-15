import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";

if (process.env.CREATOROS_QUALIFICATION_MODE !== "true" || process.env.QUALIFICATION_ISOLATED_DATABASE !== "true") {
  throw new Error("Media Cloud qualification requires an isolated qualification database");
}
if ((process.env.ASSET_STORAGE_PROVIDER ?? "local") !== "local") {
  throw new Error("Media Cloud qualification must use disposable local asset storage");
}

const [{ db, closeDatabase }, schema, storage, cloud, processing, analytics] = await Promise.all([
  import("../server/db"),
  import("../shared/schema"),
  import("../server/asset-storage"),
  import("../server/media-cloud"),
  import("../server/media-processing"),
  import("../server/analytics"),
]);

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-media-field-"));
try {
  const sourcePath = path.join(temp, "field-test.mp4");
  const generated = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", sourcePath,
  ], { encoding: "utf8", timeout: 60_000, windowsHide: true });
  if (generated.status !== 0) throw new Error(`Unable to generate qualification media: ${generated.stderr}`);

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, 1)).limit(1);
  if (!user) throw new Error("Qualification user was not seeded");
  const stored = await storage.persistManagedFile({ sourcePath, ownerUserId: user.id, kind: "video", filename: "field-test.mp4", mimeType: "video/mp4", visibility: "public" });
  const [asset] = await db.insert(schema.assets).values({
    ownerUserId: user.id,
    kind: "video",
    storageProvider: "local",
    storageKey: stored.storageKey,
    publicUrl: stored.publicUrl,
    mimeType: "video/mp4",
    sizeBytes: stored.sizeBytes,
    visibility: "public",
    status: "ready",
    originalFilename: "field-test.mp4",
    metadata: { qualification: true },
  }).returning();
  await cloud.queueMediaIngestJobs(asset);
  await processing.processDueMediaJobs(4);

  const [jobs, renditions, refreshed] = await Promise.all([
    db.select().from(schema.mediaProcessingJobs).where(eq(schema.mediaProcessingJobs.assetId, asset.id)),
    db.select().from(schema.mediaRenditions).where(eq(schema.mediaRenditions.assetId, asset.id)),
    db.select().from(schema.assets).where(and(eq(schema.assets.id, asset.id), eq(schema.assets.status, "ready"))).limit(1).then((rows) => rows[0]),
  ]);
  const failures = jobs.filter((job) => job.state !== "succeeded");
  if (failures.length) throw new Error(`Media jobs did not succeed: ${failures.map((job) => `${job.kind}:${job.state}:${job.errorCode}`).join(", ")}`);
  for (const key of ["source-v1", "poster-1280-v1", "video-720p-v1", "hls-master-v1"]) {
    if (!renditions.some((rendition) => rendition.renditionKey === key && rendition.status === "ready")) throw new Error(`Missing ready rendition ${key}`);
  }
  if (!refreshed?.metadata?.mediaProbe) throw new Error("Media probe metadata was not persisted");
  if (!refreshed.sha256 || !/^[0-9a-f]{64}$/.test(refreshed.sha256)) throw new Error("Source checksum was not persisted");
  const manifest = renditions.find((rendition) => rendition.renditionKey === "hls-master-v1");
  if (!manifest?.publicUrl || manifest.manifestType !== "hls") throw new Error("Adaptive HLS delivery was not registered");

  const initialRights = await db.select().from(schema.assetRights).where(eq(schema.assetRights.assetId, asset.id));
  if (initialRights.length !== 1 || initialRights[0].status !== "active") throw new Error("Asset rights were not seeded atomically");
  await cloud.recordAssetUsage({ assetId: asset.id, actorUserId: user.id, surfaceType: "post", surfaceId: "qualification-post", useType: "native_publish" });
  const usage = await db.select().from(schema.assetUsageRecords).where(eq(schema.assetUsageRecords.assetId, asset.id));
  if (usage.length !== 1 || usage[0].state !== "active") throw new Error("Asset usage history was not persisted");
  await db.update(schema.assetRights).set({ status: "revoked", revokedAt: new Date() }).where(eq(schema.assetRights.id, initialRights[0].id));
  if (await cloud.assetRightsAllowUse(asset.id, "playback")) throw new Error("Revoked rights did not fail closed");
  await db.update(schema.assetRights).set({ status: "active", revokedAt: null }).where(eq(schema.assetRights.id, initialRights[0].id));

  const [derived] = await db.insert(schema.assets).values({
    ownerUserId: user.id, kind: "video", storageProvider: "local", storageKey: stored.storageKey,
    publicUrl: stored.publicUrl, mimeType: "video/mp4", sizeBytes: stored.sizeBytes, visibility: "public",
    status: "ready", originalFilename: "field-test-derived.mp4", metadata: { qualification: true },
  }).returning();
  await cloud.registerAssetLineage({ parentAssetId: asset.id, childAssetId: derived.id, relationship: "derived_from", createdByUserId: user.id });
  const derivedRights = await db.select().from(schema.assetRights).where(eq(schema.assetRights.assetId, derived.id));
  if (derivedRights.length !== 1 || !derivedRights[0].notes.startsWith("Inherited through derived_from")) throw new Error("Rights did not follow derivative lineage");

  const [touch] = await db.insert(schema.attributionTouches).values({ userId: user.id, assetId: asset.id, source: "creativesos", medium: "native_feed", touchType: "engagement", confidence: 1, deduplicationKey: `qualification-touch:${asset.id}`, occurredAt: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) }).returning();
  const [order] = await db.insert(schema.orders).values({ buyerId: user.id, status: "paid", financialStatus: "paid", currency: "usd", subtotalAmount: 25, totalAmount: 25, idempotencyKey: `qualification-order:${asset.id}`, attributionContext: { touchId: touch.id, model: "last_touch_30d" } }).returning();
  await analytics.attributeOrderConversion(order);
  const conversion = await db.select().from(schema.conversionAttributions).where(eq(schema.conversionAttributions.orderId, order.id));
  if (conversion.length !== 1 || conversion[0].attributedRevenueCents !== 2_500) throw new Error("Content-to-revenue attribution was not persisted correctly");
  const firstEvent = await analytics.emitAnalyticsEvent({ userId: user.id, eventName: "content.engaged", sessionId: "qualification-session", deduplicationKey: `qualification-event:${asset.id}`, objectType: "asset", objectId: asset.id, properties: { action: "qualification" } });
  const duplicateEvent = await analytics.emitAnalyticsEvent({ userId: user.id, eventName: "content.engaged", sessionId: "qualification-session", deduplicationKey: `qualification-event:${asset.id}`, objectType: "asset", objectId: asset.id, properties: { action: "duplicate" } });
  if (!firstEvent || duplicateEvent) throw new Error("Analytics event deduplication failed");

  console.log(JSON.stringify({
    status: "qualified",
    assetId: asset.id,
    jobStates: Object.fromEntries(jobs.map((job) => [job.kind, job.state])),
    renditionKeys: renditions.map((rendition) => rendition.renditionKey).sort(),
    adaptiveManifest: manifest.publicUrl,
    checksum: refreshed.sha256,
    rightsPropagation: "qualified",
    usageHistory: "qualified",
    attribution: "qualified",
    eventDeduplication: "qualified",
  }));
} finally {
  await closeDatabase();
  await fs.rm(temp, { recursive: true, force: true });
}
