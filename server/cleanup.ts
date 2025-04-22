import { db } from "./fixed-db";
import { posts, stories } from "../shared/schema";
import { eq, or, like, ne, isNotNull } from "drizzle-orm";

/**
 * Cleanup orphaned stories - stories that no longer have associated posts
 * This function checks all stories and deletes any that don't have a corresponding post
 * with the same media URL
 */
export async function cleanupOrphanedStories(): Promise<number> {
  try {
    console.log("Running orphaned stories cleanup");
    
    // Get all stories
    const allStories = await db.select().from(stories);
    console.log(`Found ${allStories.length} total stories to check for orphaned status`);
    
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
        postsWithMedia = await db
          .select()
          .from(posts)
          .where(
            or(
              like(posts.imageUrl, `%${storyFilename}`),
              like(posts.videoUrl, `%${storyFilename}`),
              like(posts.audioUrl, `%${storyFilename}`)
            )
          ).where(
            or(
              ne(posts.imageUrl, null),
              ne(posts.videoUrl, null),
              ne(posts.audioUrl, null)
            )
          );
      }
      
      // If still no posts found with this media URL, delete the story
      if (postsWithMedia.length === 0) {
        console.log(`Orphaned story found: ID=${story.id}, no posts with media URL ${story.mediaUrl}`);
        await db.delete(stories).where(eq(stories.id, story.id));
        cleanupCount++;
      }
    }
    
    console.log(`Cleanup complete. Deleted ${cleanupCount} orphaned stories.`);
    return cleanupCount;
  } catch (error) {
    console.error("Error cleaning up orphaned stories:", error);
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
    console.log(`Initial cleanup completed: removed ${count} orphaned stories`);
  });
  
  // Schedule the cleanup to run every 5 minutes
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  setInterval(() => {
    cleanupOrphanedStories().then(count => {
      if (count > 0) {
        console.log(`Scheduled cleanup completed: removed ${count} orphaned stories`);
      }
    });
  }, FIVE_MINUTES_MS);
  
  console.log("Automated story cleanup scheduled to run every 5 minutes");
}