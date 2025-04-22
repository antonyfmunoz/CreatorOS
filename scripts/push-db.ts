import { db } from "../server/fixed-db";
import * as schema from "../shared/schema";
import { sql } from "drizzle-orm";

async function pushDatabaseSchema() {
  try {
    console.log("Starting database schema push...");
    
    // Create users table
    console.log("Creating users table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        display_name TEXT NOT NULL,
        bio TEXT,
        profile_image_url TEXT,
        role TEXT NOT NULL DEFAULT 'creator',
        xp_points INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    // Create posts table
    console.log("Creating posts table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        image_url TEXT,
        audio_url TEXT,
        video_url TEXT,
        media_type TEXT DEFAULT 'text',
        likes INTEGER NOT NULL DEFAULT 0,
        comments INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    // Create comments table
    console.log("Creating comments table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER,
        content TEXT NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    // Create saved_posts table
    console.log("Creating saved_posts table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, post_id)
      )
    `);
    
    // Create stories table
    console.log("Creating stories table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_url TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'image',
        caption TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP,
        view_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    // Create tagged_users table
    console.log("Creating tagged_users table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tagged_users (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        position_x DOUBLE PRECISION NOT NULL,
        position_y DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(post_id, user_id, position_x, position_y)
      )
    `);
    
    // Create followers table
    console.log("Creating followers table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS followers (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(follower_id, followed_id)
      )
    `);
    
    // Create notifications table
    console.log("Creating notifications table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT false,
        link_to TEXT,
        related_user_id INTEGER REFERENCES users(id),
        related_user_image TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    console.log("Database schema push completed successfully!");
  } catch (error) {
    console.error("Error pushing database schema:", error);
  } finally {
    process.exit(0);
  }
}

pushDatabaseSchema();