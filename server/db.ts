import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Create postgres connection
const connectionString = process.env.DATABASE_URL;
const configuredPoolMaximum = Number(process.env.DATABASE_POOL_MAX ?? 10);
const client = postgres(connectionString as string, {
  max: Number.isFinite(configuredPoolMaximum) ? Math.max(1, Math.min(50, configuredPoolMaximum)) : 10,
  connect_timeout: 10,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});

// Create drizzle instance
export const db = drizzle(client, { schema });

export async function closeDatabase() {
  await client.end({ timeout: 5 });
}
