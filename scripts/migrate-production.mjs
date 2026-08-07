#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations");
}

// These tables predate the migration ledger in the deployed application. They
// must all be present before this script is allowed to establish the original
// (0000) baseline. Later migrations remain executable and are never assumed.
const originalSchemaTables = [
  "ai_agents",
  "ai_chats",
  "channel_messages",
  "channels",
  "comments",
  "communities",
  "contacts",
  "conversation_participants",
  "conversations",
  "direct_messages",
  "documents",
  "followers",
  "notifications",
  "posts",
  "products",
  "revenue",
  "saved_posts",
  "stories",
  "tagged_users",
  "users",
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(scriptDirectory, "../migrations");
const migrationFiles = readMigrationFiles({ migrationsFolder });
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

try {
  // Serialize rollout migrations even if Fly wakes a second machine.
  await client.unsafe("select pg_advisory_lock(84231859)");

  const rows = await client.unsafe(
    `select table_name from information_schema.tables
     where table_schema = 'public'
       and table_name in (${originalSchemaTables.map((table) => `'${table}'`).join(", ")})`,
  );
  const present = new Set(rows.map((row) => row.table_name));
  const missing = originalSchemaTables.filter((table) => !present.has(table));

  if (missing.length > 0) {
    throw new Error(
      `Refusing to establish a migration baseline; required existing tables are missing: ${missing.join(", ")}`,
    );
  }

  await client.unsafe('create schema if not exists "drizzle"');
  await client.unsafe(
    `create table if not exists "drizzle"."__drizzle_migrations" (
      id serial primary key,
      hash text not null,
      created_at bigint
    )`,
  );

  const appliedRows = await client.unsafe('select created_at from "drizzle"."__drizzle_migrations"');
  const appliedTimestamps = new Set(appliedRows.map((row) => Number(row.created_at)));
  let established = 0;

  // Only 0000 is the verified existing base. The exact hash and timestamp
  // come from the checked migration journal, not hard-coded values. Migration
  // 0001 and everything after it is applied by Drizzle below.
  for (const baseline of migrationFiles.slice(0, 1)) {
    if (!appliedTimestamps.has(baseline.folderMillis)) {
      await client.unsafe(
        'insert into "drizzle"."__drizzle_migrations" (hash, created_at) values ($1, $2)',
        [baseline.hash, baseline.folderMillis],
      );
      established += 1;
    }
  }

  await migrate(db, { migrationsFolder });
  const finalRows = await client.unsafe('select count(*)::int as count from "drizzle"."__drizzle_migrations"');
  console.log(JSON.stringify({ status: "migrated", baselineEstablished: established, migrationCount: finalRows[0].count }));
} finally {
  try {
    await client.unsafe("select pg_advisory_unlock(84231859)");
  } catch {
    // The connection may already be closed after a failed startup.
  }
  await client.end({ timeout: 5 });
}
