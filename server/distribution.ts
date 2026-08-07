import { and, eq, inArray, lte } from "drizzle-orm";
import {
  assets,
  campaignDeliverables,
  distributionDeliveryAttempts,
  distributionJobs,
  socialConnections,
} from "../shared/schema";
import { socialProviderForPlatform } from "../shared/social-distribution";
import { db } from "./db";
import { decryptSocialToken, encryptSocialToken } from "./social-oauth";
import { storage } from "./storage";
import { emitProjectionEvent } from "./umh";
import {
  refreshYouTubeAccessToken,
  uploadYouTubeVideo,
} from "./youtube-delivery";

function nativeMediaType(format: string): "text" | "photo" | "video" {
  const normalized = format.toLowerCase();
  if (normalized === "image") return "photo";
  if (normalized === "video") return "video";
  return "text";
}

async function persistDeliveryAttempt(input: {
  distributionJobId: string;
  provider: string;
  connectionId: string | null;
  status: string;
  providerContentId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  incrementAttempt?: boolean;
}) {
  const existing = await db
    .select({ attemptCount: distributionDeliveryAttempts.attemptCount })
    .from(distributionDeliveryAttempts)
    .where(
      and(
        eq(
          distributionDeliveryAttempts.distributionJobId,
          input.distributionJobId,
        ),
        eq(distributionDeliveryAttempts.provider, input.provider),
      ),
    )
    .limit(1);
  const values = {
    connectionId: input.connectionId,
    status: input.status,
    attemptCount:
      (existing[0]?.attemptCount ?? 0) + (input.incrementAttempt ? 1 : 0),
    providerContentId: input.providerContentId ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    nextAttemptAt: null,
    updatedAt: new Date(),
  };
  await db
    .insert(distributionDeliveryAttempts)
    .values({
      distributionJobId: input.distributionJobId,
      provider: input.provider,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        distributionDeliveryAttempts.distributionJobId,
        distributionDeliveryAttempts.provider,
      ],
      set: values,
    });
}

async function usableYouTubeAccessToken(
  connection: typeof socialConnections.$inferSelect,
) {
  if (!connection.accessTokenCiphertext)
    throw new Error("Connected YouTube account has no access token");
  const expiresSoon =
    !connection.tokenExpiresAt ||
    connection.tokenExpiresAt.getTime() < Date.now() + 60_000;
  if (!expiresSoon) return decryptSocialToken(connection.accessTokenCiphertext);
  if (!connection.refreshTokenCiphertext)
    throw new Error("Connected YouTube account needs to be reconnected");
  const refreshed = await refreshYouTubeAccessToken(
    decryptSocialToken(connection.refreshTokenCiphertext),
  );
  await db
    .update(socialConnections)
    .set({
      accessTokenCiphertext: encryptSocialToken(refreshed.accessToken),
      tokenExpiresAt: refreshed.expiresAt,
      lastValidatedAt: new Date(),
      lastErrorCode: null,
      updatedAt: new Date(),
    })
    .where(eq(socialConnections.id, connection.id));
  return refreshed.accessToken;
}

/**
 * Publishes due native jobs and leaves unconnected external targets visible in
 * the queue. Claiming each job first makes the operation safe across retries
 * and multiple process instances.
 */
export async function processDueDistributionJobs(
  now = new Date(),
): Promise<number> {
  if (process.env.CREATOROS_DEMO_MODE === "true") return 0;
  const due = await db
    .select()
    .from(distributionJobs)
    .where(
      and(
        eq(distributionJobs.status, "scheduled"),
        lte(distributionJobs.scheduledFor, now),
      ),
    );

  let processed = 0;
  for (const candidate of due) {
    const [job] = await db
      .update(distributionJobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(distributionJobs.id, candidate.id),
          eq(distributionJobs.status, "scheduled"),
        ),
      )
      .returning();
    if (!job) continue;

    const platforms = Array.isArray(job.platforms) ? job.platforms : [];
    const externalProviders = Array.from(
      new Set(
        platforms
          .map(socialProviderForPlatform)
          .filter((provider): provider is NonNullable<typeof provider> =>
            Boolean(provider),
          ),
      ),
    );
    try {
      const selectedAssetIds = Array.isArray(job.assetIds) ? job.assetIds : [];
      const selectedAssets = selectedAssetIds.length
        ? await db
            .select()
            .from(assets)
            .where(
              and(
                eq(assets.ownerUserId, job.userId),
                eq(assets.status, "ready"),
                eq(assets.visibility, "public"),
                inArray(assets.id, selectedAssetIds),
              ),
            )
        : [];
      let publishedPostId: number | undefined;
      if (platforms.includes("CreativesOS")) {
        const imageUrl =
          selectedAssets.find((asset) => asset.kind === "image")?.publicUrl ??
          "";
        const videoUrl =
          selectedAssets.find((asset) => asset.kind === "video")?.publicUrl ??
          "";
        const audioUrl =
          selectedAssets.find((asset) => asset.kind === "audio")?.publicUrl ??
          "";
        const publishedPost = await storage.createPost({
          userId: job.userId,
          content: job.content,
          mediaType: nativeMediaType(job.format),
          imageUrl,
          videoUrl,
          audioUrl,
        });
        publishedPostId = publishedPost.id;
      }
      const connectedAccounts = externalProviders.length
        ? await db
            .select()
            .from(socialConnections)
            .where(
              and(
                eq(socialConnections.userId, job.userId),
                inArray(socialConnections.provider, externalProviders),
                eq(socialConnections.status, "active"),
              ),
            )
        : [];
      const connectionByProvider = new Map(
        connectedAccounts.map((connection) => [
          connection.provider,
          connection,
        ]),
      );

      const deliveryStatuses = new Map<string, string>();
      for (const provider of externalProviders) {
        const connection = connectionByProvider.get(provider);
        if (!connection) {
          await persistDeliveryAttempt({
            distributionJobId: job.id,
            provider,
            connectionId: null,
            status: "waiting_for_connection",
            errorCode: "social_account_not_connected",
          });
          deliveryStatuses.set(provider, "waiting_for_connection");
          continue;
        }

        if (provider !== "youtube") {
          await persistDeliveryAttempt({
            distributionJobId: job.id,
            provider,
            connectionId: connection.id,
            status: "waiting_for_provider",
            errorCode: "provider_adapter_not_enabled",
          });
          deliveryStatuses.set(provider, "waiting_for_provider");
          continue;
        }

        const video = selectedAssets.find(
          (asset) =>
            asset.kind === "video" &&
            asset.publicUrl &&
            asset.mimeType?.startsWith("video/") &&
            asset.sizeBytes &&
            asset.sizeBytes > 0,
        );
        const mimeType = video?.mimeType;
        const sizeBytes = video?.sizeBytes;
        if (!video || !video.publicUrl || !mimeType || !sizeBytes) {
          await persistDeliveryAttempt({
            distributionJobId: job.id,
            provider,
            connectionId: connection.id,
            status: "failed",
            errorCode: "youtube_video_required",
            errorMessage:
              "YouTube delivery requires one ready public video asset.",
          });
          deliveryStatuses.set(provider, "failed");
          continue;
        }

        try {
          const providerContentId = await uploadYouTubeVideo({
            accessToken: await usableYouTubeAccessToken(connection),
            title: job.content,
            description: job.content,
            mimeType,
            sizeBytes,
            mediaUrl: video.publicUrl,
          });
          await persistDeliveryAttempt({
            distributionJobId: job.id,
            provider,
            connectionId: connection.id,
            status: "published",
            providerContentId,
            incrementAttempt: true,
          });
          deliveryStatuses.set(provider, "published");
        } catch (error) {
          console.error(`YouTube delivery failed for ${job.id}:`, error);
          await db
            .update(socialConnections)
            .set({
              lastErrorCode: "youtube_delivery_failed",
              updatedAt: new Date(),
            })
            .where(eq(socialConnections.id, connection.id));
          await persistDeliveryAttempt({
            distributionJobId: job.id,
            provider,
            connectionId: connection.id,
            status: "failed",
            errorCode: "youtube_delivery_failed",
            errorMessage:
              "YouTube did not confirm this upload. Reconnect the channel or review the provider error before retrying.",
            incrementAttempt: true,
          });
          deliveryStatuses.set(provider, "failed");
        }
      }
      const nextStatus =
        deliveryStatuses.has("youtube") &&
        deliveryStatuses.get("youtube") === "failed"
          ? "failed"
          : deliveryStatuses.size === 0 ||
              Array.from(deliveryStatuses.values()).every(
                (status) => status === "published",
              )
            ? "published"
            : Array.from(deliveryStatuses.values()).some(
                  (status) => status === "waiting_for_connection",
                )
              ? "needs_connection"
              : "needs_provider";
      await db
        .update(distributionJobs)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(distributionJobs.id, job.id));
      // A campaign deliverable is an operating commitment, not a disconnected
      // checklist item. Keep it synchronized when its linked queue item ships.
      await db
        .update(campaignDeliverables)
        .set({
          status: nextStatus === "published" ? "published" : "ready",
          updatedAt: new Date(),
        })
        .where(eq(campaignDeliverables.distributionJobId, job.id));
      void emitProjectionEvent({
        aggregateType: "distribution_job",
        aggregateId: job.id,
        eventType:
          nextStatus === "published"
            ? "distribution.published"
            : `distribution.${nextStatus}`,
        actorUserId: job.userId,
        payload: { platforms, publishedPostId },
        idempotencyKey: `distribution.${nextStatus}:${job.id}`,
      }).catch((error) =>
        console.error(
          `Failed to enqueue distribution projection ${job.id}:`,
          error,
        ),
      );
      processed += 1;
    } catch (error) {
      console.error(`Failed to process distribution job ${job.id}:`, error);
      await db
        .update(distributionJobs)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(distributionJobs.id, job.id));
    }
  }
  return processed;
}

export function scheduleDistributionProcessing() {
  if (process.env.CREATOROS_DEMO_MODE === "true") return;
  // This keeps interactive publishing responsive while the process is awake.
  // The durable source of truth is the Cloudflare Cron scheduler, which calls
  // the protected dispatch endpoint even when Fly has suspended this app.
  const run = () => {
    void processDueDistributionJobs().catch((error) => {
      console.error("Distribution scheduler failed:", error);
    });
  };
  run();
  const timer = setInterval(run, 30_000);
  timer.unref();
}
