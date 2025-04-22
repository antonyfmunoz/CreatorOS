import { db } from "../server/db";
import { sql } from "drizzle-orm";
import * as schema from "../shared/schema";

async function main() {
  console.log("Creating database tables...");
  try {
    // Create users table first
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "username" text NOT NULL,
        "password" text NOT NULL,
        "display_name" text NOT NULL,
        "bio" text,
        "profile_image_url" text,
        "role" text DEFAULT 'creator' NOT NULL,
        "xp_points" integer DEFAULT 0 NOT NULL,
        "level" integer DEFAULT 1 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_username_unique" UNIQUE("username")
      );
    `);
    
    // Create posts table next
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "posts" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "content" text NOT NULL,
        "image_url" text,
        "audio_url" text,
        "video_url" text,
        "media_type" text DEFAULT 'text',
        "likes" integer DEFAULT 0 NOT NULL,
        "comments" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    // Create stories table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "stories" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "media_url" text NOT NULL,
        "media_type" text DEFAULT 'image' NOT NULL,
        "caption" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "expires_at" timestamp,
        "view_count" integer DEFAULT 0 NOT NULL,
        CONSTRAINT "stories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    // Create session table for auth
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    // Add a test user for login
    await db.execute(sql`
      INSERT INTO users (username, password, display_name, role)
      VALUES (
        'testuser', 
        '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 
        'Test User',
        'creator'
      )
      ON CONFLICT (username) DO NOTHING;
    `);

    console.log("Database setup completed successfully!");
  } catch (error) {
    console.error("Error setting up database:", error);
  }
}

main();