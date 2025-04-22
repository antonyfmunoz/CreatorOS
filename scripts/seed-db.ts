import { db } from "../server/fixed-db";
import * as schema from "../shared/schema";
import bcrypt from "bcrypt";

async function seedDatabase() {
  try {
    console.log("Starting database seeding...");

    // Check if we already have users
    const existingUsers = await db.select().from(schema.users).limit(1);
    if (existingUsers.length > 0) {
      console.log("Database already has users, skipping seeding.");
      return;
    }

    // Create test users
    console.log("Creating test users...");
    const hashedPassword = await bcrypt.hash("Password123", 10);
    
    // Create main user: antonyfmunoz
    const [antonyfmunoz] = await db.insert(schema.users).values({
      username: "antonyfmunoz",
      password: hashedPassword,
      displayName: "Antony Munoz",
      bio: "Creator | Developer | Designer",
      profileImageUrl: "/uploads/profile-antonyfmunoz.jpg",
      role: "creator",
      xpPoints: 500,
      level: 5,
      createdAt: new Date()
    }).returning();
    
    // Create second user
    const [testUser] = await db.insert(schema.users).values({
      username: "testuser",
      password: hashedPassword,
      displayName: "Test User",
      bio: "Just a test account",
      profileImageUrl: "/uploads/profile-testuser.jpg",
      role: "user",
      xpPoints: 100,
      level: 2,
      createdAt: new Date()
    }).returning();

    // Create some posts
    console.log("Creating posts...");
    const posts = [
      {
        userId: antonyfmunoz.id,
        content: "Just launched my new project! Check it out 🚀",
        imageUrl: "/uploads/post1.jpg",
        mediaType: "photo",
        likes: 42,
        comments: 7,
        createdAt: new Date(Date.now() - 3600 * 1000 * 24 * 2) // 2 days ago
      },
      {
        userId: antonyfmunoz.id,
        content: "Working on some new features for the platform",
        imageUrl: "/uploads/post2.jpg",
        mediaType: "photo",
        likes: 27,
        comments: 3,
        createdAt: new Date(Date.now() - 3600 * 1000 * 24) // 1 day ago
      },
      {
        userId: testUser.id,
        content: "Testing out this new platform. Looks promising!",
        mediaType: "text",
        likes: 15,
        comments: 2,
        createdAt: new Date(Date.now() - 3600 * 1000 * 12) // 12 hours ago
      },
      {
        userId: antonyfmunoz.id,
        content: "Just shared a new tutorial on my profile. Let me know what you think!",
        videoUrl: "/uploads/tutorial.mp4",
        mediaType: "video",
        likes: 56,
        comments: 12,
        createdAt: new Date(Date.now() - 3600 * 1000 * 6) // 6 hours ago
      },
      {
        userId: testUser.id,
        content: "This is my latest project. Feedback welcome!",
        imageUrl: "/uploads/project.jpg",
        mediaType: "photo",
        likes: 38,
        comments: 5,
        createdAt: new Date(Date.now() - 3600 * 1000 * 3) // 3 hours ago
      }
    ];

    for (const post of posts) {
      await db.insert(schema.posts).values(post);
    }

    // Create comments
    console.log("Creating comments...");
    const comments = [
      {
        postId: 1,
        userId: testUser.id,
        content: "Amazing work! 👏",
        likes: 3,
        createdAt: new Date(Date.now() - 3600 * 1000 * 23) // 23 hours ago
      },
      {
        postId: 1,
        userId: antonyfmunoz.id,
        content: "Thanks for the support!",
        likes: 1,
        createdAt: new Date(Date.now() - 3600 * 1000 * 22) // 22 hours ago
      },
      {
        postId: 3,
        userId: antonyfmunoz.id,
        content: "Welcome to the platform! Let me know if you need help.",
        likes: 2,
        createdAt: new Date(Date.now() - 3600 * 1000 * 10) // 10 hours ago
      },
      {
        postId: 4,
        userId: testUser.id,
        content: "This tutorial was super helpful. Thanks for sharing!",
        likes: 5,
        createdAt: new Date(Date.now() - 3600 * 1000 * 5) // 5 hours ago
      }
    ];

    for (const comment of comments) {
      await db.insert(schema.comments).values(comment);
    }

    // Create follow relationship
    console.log("Creating follow relationship...");
    await db.insert(schema.followers).values({
      followerId: testUser.id,
      followedId: antonyfmunoz.id,
      createdAt: new Date(Date.now() - 3600 * 1000 * 48) // 48 hours ago
    });

    // Create notifications
    console.log("Creating notifications...");
    await db.insert(schema.notifications).values([
      {
        userId: antonyfmunoz.id,
        type: "like",
        message: "Test User liked your post",
        read: false,
        linkTo: "/posts/1",
        relatedUserId: testUser.id,
        relatedUserImage: "/uploads/profile-testuser.jpg",
        createdAt: new Date(Date.now() - 3600 * 1000 * 4) // 4 hours ago
      },
      {
        userId: antonyfmunoz.id,
        type: "comment",
        message: "Test User commented on your post",
        read: false,
        linkTo: "/posts/4",
        relatedUserId: testUser.id,
        relatedUserImage: "/uploads/profile-testuser.jpg",
        createdAt: new Date(Date.now() - 3600 * 1000 * 2) // 2 hours ago
      },
      {
        userId: testUser.id,
        type: "follow",
        message: "Antony Munoz started following you",
        read: false,
        linkTo: "/profile/antonyfmunoz",
        relatedUserId: antonyfmunoz.id,
        relatedUserImage: "/uploads/profile-antonyfmunoz.jpg",
        createdAt: new Date(Date.now() - 3600 * 1000 * 1) // 1 hour ago
      }
    ]);

    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    process.exit(0);
  }
}

seedDatabase();