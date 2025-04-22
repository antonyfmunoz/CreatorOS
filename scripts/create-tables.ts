import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../shared/schema";

// For migrations
const migrationClient = postgres(process.env.DATABASE_URL as string, { max: 1 });

// Create db client
const db = drizzle(migrationClient, { schema });

async function main() {
  console.log("Running migrations...");
  
  try {
    // This will automatically run needed migrations on the database
    await migrate(db, { migrationsFolder: "migrations" });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await migrationClient.end();
  }
}

main();