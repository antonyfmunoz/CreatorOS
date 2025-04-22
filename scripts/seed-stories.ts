import { db } from "../server/fixed-db";
import * as schema from "../shared/schema";

async function seedStories() {
  try {
    console.log("Starting stories seeding...");

    // Check if we already have stories
    const existingStories = await db.select().from(schema.stories).limit(1);
    if (existingStories.length > 0) {
      console.log("Database already has stories, skipping seeding.");
      return;
    }

    // Get users (we need their IDs)
    const users = await db.select().from(schema.users);
    if (users.length === 0) {
      console.log("No users found, can't seed stories without users.");
      return;
    }

    // Find antonyfmunoz user
    const antonyfmunoz = users.find(user => user.username === 'antonyfmunoz');
    const testUser = users.find(user => user.username === 'testuser');

    if (!antonyfmunoz || !testUser) {
      console.log("Could not find required users, skipping story creation.");
      return;
    }

    // Create expiration dates
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

    // Create stories
    console.log("Creating stories...");
    const stories = [
      {
        userId: antonyfmunoz.id,
        mediaUrl: "/uploads/story1.jpg",
        mediaType: "image",
        caption: "Working on a new project!",
        createdAt: now,
        expiresAt,
        viewCount: 12
      },
      {
        userId: antonyfmunoz.id,
        mediaUrl: "/uploads/story2.jpg",
        mediaType: "image",
        caption: "Check out this new feature",
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        expiresAt: new Date(expiresAt.getTime() - 2 * 60 * 60 * 1000),
        viewCount: 8
      },
      {
        userId: testUser.id,
        mediaUrl: "/uploads/story3.jpg",
        mediaType: "image",
        caption: "Just joined this awesome platform!",
        createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000), // 4 hours ago
        expiresAt: new Date(expiresAt.getTime() - 4 * 60 * 60 * 1000),
        viewCount: 5
      }
    ];

    // Insert stories
    for (const story of stories) {
      await db.insert(schema.stories).values(story);
    }

    console.log("Stories seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding stories:", error);
  } finally {
    process.exit(0);
  }
}

seedStories();