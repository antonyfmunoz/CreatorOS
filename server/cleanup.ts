import { db } from "./db";
import { posts, stories } from "../shared/schema";
import { eq, or, like, and, isNull, not } from "drizzle-orm";
import { cleanupExpiredRoomMedia } from "./room-media-retention";
import { reconcileRoomMediaRuntime } from "./room-media-reconciliation";
import { redactExpiredAutomationPayloads } from "./automation-retention";
import { cleanupRelationshipHubRetention } from "./relationship-retention";
import { processDueAccountPrivacyRequests } from "./account-privacy";
import { captureServerException, structuredLog } from "./observability";

function recordCleanupFailure(event: string, error: unknown) {
  captureServerException(error, { event });
}

/**
 * Cleanup orphaned stories - stories that no longer have associated posts
 * This function checks all stories and deletes any that don't have a corresponding post
 * with the same media URL
 */
export async function cleanupOrphanedStories(): Promise<number> {
  try {
    // Get all stories
    const allStories = await db.select().from(stories);
    
    let cleanupCount = 0;
    
    // For each story, check if its associated post still exists
    for (const story of allStories) {
      // Skip stories without mediaUrl
      if (!story.mediaUrl) continue;
      
      // Extract the base filename for more flexible matching
      const storyFilename = story.mediaUrl.split('/').pop();
      
      // Try to find any post with matching media URL
      let postsWithMedia = await db
        .select()
        .from(posts)
        .where(
          or(
            eq(posts.imageUrl, story.mediaUrl),
            eq(posts.videoUrl, story.mediaUrl),
            eq(posts.audioUrl, story.mediaUrl)
          )
        );
      
      // If no exact match was found, try to match by filename
      if (postsWithMedia.length === 0 && storyFilename) {
        // Create a query with proper Drizzle syntax
        postsWithMedia = await db
          .select()
          .from(posts)
          .where(
            or(
              // Check for both filename match and non-null values
              and(like(posts.imageUrl, `%${storyFilename}`), not(isNull(posts.imageUrl))),
              and(like(posts.videoUrl, `%${storyFilename}`), not(isNull(posts.videoUrl))),
              and(like(posts.audioUrl, `%${storyFilename}`), not(isNull(posts.audioUrl)))
            )
          );
      }
      
      // If still no posts found with this media URL, delete the story
      if (postsWithMedia.length === 0) {
        await db.delete(stories).where(eq(stories.id, story.id));
        cleanupCount++;
      }
    }
    
    if (cleanupCount > 0) {
      structuredLog("info", "cleanup.orphaned_stories.completed", { deleted: cleanupCount });
    }
    return cleanupCount;
  } catch (error) {
    recordCleanupFailure("cleanup.orphaned_stories.failed", error);
    return 0;
  }
}

/**
 * Schedule the cleanup to run every hour
 * This ensures that any orphaned stories are eventually cleaned up
 */
export function scheduleCleanupTasks() {
  // Run the cleanup immediately when the server starts
  cleanupOrphanedStories().then(count => {
    structuredLog("info", "cleanup.orphaned_stories.initialized", { deleted: count });
  });
  cleanupExpiredRoomMedia()
    .then((result) => structuredLog("info", "cleanup.room_media_retention.initialized", result))
    .catch((error) => recordCleanupFailure("cleanup.room_media_retention.failed", error));
  redactExpiredAutomationPayloads()
    .then((result) => structuredLog("info", "cleanup.automation_retention.initialized", result))
    .catch((error) => recordCleanupFailure("cleanup.automation_retention.failed", error));
  cleanupRelationshipHubRetention()
    .then((result) => structuredLog("info", "cleanup.relationship_retention.initialized", result))
    .catch((error) => recordCleanupFailure("cleanup.relationship_retention.failed", error));
  reconcileRoomMediaRuntime()
    .then((result) => structuredLog("info", "cleanup.room_media_recovery.initialized", result))
    .catch((error) => recordCleanupFailure("cleanup.room_media_recovery.failed", error));
  processDueAccountPrivacyRequests()
    .then((result) => structuredLog("info", "cleanup.account_privacy.initialized", result))
    .catch((error) => recordCleanupFailure("cleanup.account_privacy.failed", error));
  
  // Schedule the cleanup to run every 5 minutes
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  setInterval(() => {
    cleanupOrphanedStories().then(count => {
      if (count > 0) {
        structuredLog("info", "cleanup.orphaned_stories.scheduled", { deleted: count });
      }
    });
    reconcileRoomMediaRuntime()
      .then((result) => {
        if (
          result.recordingsReconciled ||
          result.staleRecordingsFailed ||
          result.staleAgentSessionsFailed
        )
          structuredLog("info", "cleanup.room_media_recovery.scheduled", result);
      })
      .catch((error) =>
        recordCleanupFailure("cleanup.room_media_recovery.failed", error),
      );
  }, FIVE_MINUTES_MS);

  const ONE_HOUR_MS = 60 * 60 * 1000;
  setInterval(() => {
    cleanupExpiredRoomMedia()
      .then((result) => {
        if (
          result.recordingsDeleted ||
          result.transcriptSegmentsDeleted ||
          result.agentSessionsDeleted
        )
          structuredLog("info", "cleanup.room_media_retention.scheduled", result);
      })
      .catch((error) =>
        recordCleanupFailure("cleanup.room_media_retention.failed", error),
      );
    redactExpiredAutomationPayloads()
      .then((result) => {
        if (result.runsRedacted) structuredLog("info", "cleanup.automation_retention.scheduled", result);
      })
      .catch((error) => recordCleanupFailure("cleanup.automation_retention.failed", error));
    cleanupRelationshipHubRetention()
      .then((result) => {
        if (Object.values(result).some((value) => value > 0)) structuredLog("info", "cleanup.relationship_retention.scheduled", result);
      })
      .catch((error) => recordCleanupFailure("cleanup.relationship_retention.failed", error));
    processDueAccountPrivacyRequests()
      .then((result) => {
        if (Object.values(result).some((value) => value > 0)) structuredLog("info", "cleanup.account_privacy.scheduled", result);
      })
      .catch((error) => recordCleanupFailure("cleanup.account_privacy.failed", error));
  }, ONE_HOUR_MS);
  
  structuredLog("info", "cleanup.scheduler.started", {
    orphanedStoryIntervalMs: FIVE_MINUTES_MS,
    retentionIntervalMs: ONE_HOUR_MS,
  });
}
