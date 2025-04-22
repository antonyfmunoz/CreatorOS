import { db } from "../server/db";
import { sql } from "drizzle-orm";
import * as schema from "../shared/schema";
import bcrypt from "bcrypt";

const saltRounds = 10;

async function hashPassword(password: string) {
  return bcrypt.hash(password, saltRounds);
}

async function main() {
  console.log("Testing login...");
  
  // Check if testuser exists
  const [existingUser] = await db.select().from(schema.users)
    .where(sql`${schema.users.username} = 'testuser'`);
  
  if (existingUser) {
    console.log("Test user already exists:", existingUser);
  } else {
    // Create a test user with bcrypt hashed password
    const hashedPassword = await hashPassword("password123");
    
    console.log("Creating test user with hashed password:", hashedPassword);
    
    const [newUser] = await db.insert(schema.users)
      .values({
        username: "testuser",
        password: hashedPassword,
        displayName: "Test User",
        role: "creator",
        xpPoints: 0,
        level: 1,
        createdAt: new Date(),
      })
      .returning();
    
    console.log("Created new test user:", newUser);
  }
  
  console.log("Done!");
}

main().catch(console.error);