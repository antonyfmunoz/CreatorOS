#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";

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

try {
  const result = await client.begin(async (transaction) => {
    // Transaction-scoped advisory locks are safe through transaction-pooling
    // proxies: the lock, baseline and every migration stay on one backend and
    // PostgreSQL releases the lock automatically on commit or rollback.
    await transaction.unsafe("select pg_advisory_xact_lock(84231859)");

    const rows = await transaction.unsafe(
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

    await transaction.unsafe('create schema if not exists "drizzle"');
    await transaction.unsafe(
      `create table if not exists "drizzle"."__drizzle_migrations" (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`,
    );

    const appliedRows = await transaction.unsafe('select created_at from "drizzle"."__drizzle_migrations"');
    const appliedTimestamps = new Set(appliedRows.map((row) => Number(row.created_at)));
    let established = 0;
    for (const baseline of migrationFiles.slice(0, 1)) {
      if (!appliedTimestamps.has(baseline.folderMillis)) {
        await transaction.unsafe(
          'insert into "drizzle"."__drizzle_migrations" (hash, created_at) values ($1, $2)',
          [baseline.hash, baseline.folderMillis],
        );
        appliedTimestamps.add(baseline.folderMillis);
        established += 1;
      }
    }

    // This is the same ordered, all-or-nothing behavior as Drizzle's PG
    // migrator, kept in the outer transaction so the advisory lock cannot
    // leak through the production transaction pooler.
    for (const migration of migrationFiles) {
      if (appliedTimestamps.has(migration.folderMillis)) continue;
      for (const statement of migration.sql) {
        await transaction.unsafe(statement);
      }
      await transaction.unsafe(
        'insert into "drizzle"."__drizzle_migrations" (hash, created_at) values ($1, $2)',
        [migration.hash, migration.folderMillis],
      );
      appliedTimestamps.add(migration.folderMillis);
    }

    const [finalRow] = await transaction.unsafe(
      'select count(*)::int as count from "drizzle"."__drizzle_migrations"',
    );
    return { status: "migrated", baselineEstablished: established, migrationCount: finalRow.count };
  });
  console.log(JSON.stringify(result));
} finally {
  await client.end({ timeout: 5 });
}
