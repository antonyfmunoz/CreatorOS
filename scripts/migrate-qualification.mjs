#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to qualify migrations");
}

const requiredTables = [
  "users",
  "posts",
  "products",
  "businesses",
  "purchases",
  "distribution_jobs",
  "social_connections",
  "communities",
  "community_memberships",
  "community_rooms",
  "community_room_recordings",
  "community_room_transcript_segments",
  "projection_events",
  "umh_commands",
  "umh_approvals",
  "automation_definitions",
  "automation_runs",
  "automation_approvals",
  "automation_action_receipts",
  "automation_audit_events",
  "automation_contact_states",
  "relationship_channel_connections",
  "relationships",
  "relationship_external_identities",
  "relationship_conversations",
  "relationship_conversation_bindings",
  "relationship_conversation_participants",
  "relationship_messages",
  "relationship_message_attachments",
  "relationship_message_receipts",
  "relationship_provider_events",
  "relationship_delivery_jobs",
  "relationship_native_delivery_receipts",
  "relationship_agent_authority_policies",
  "relationship_agent_suggestions",
  "relationship_memory_facts",
  "relationship_voice_profiles",
  "relationship_voice_consents",
  "relationship_voice_generation_jobs",
  "relationship_audit_events",
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(scriptDirectory, "../migrations");
const migrationFiles = readMigrationFiles({ migrationsFolder });
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

try {
  const existingTables = await client.unsafe(
    `select table_name from information_schema.tables where table_schema = 'public' limit 1`,
  );
  if (existingTables.length > 0) {
    throw new Error("Qualification requires an empty public schema");
  }

  await migrate(db, { migrationsFolder });

  const migrationRows = await client.unsafe(
    'select count(*)::int as count, max(created_at)::bigint as latest from "drizzle"."__drizzle_migrations"',
  );
  const tables = await client.unsafe(
    `select table_name from information_schema.tables where table_schema = 'public'`,
  );
  const present = new Set(tables.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !present.has(table));
  const expectedLatest = migrationFiles.at(-1)?.folderMillis ?? null;
  const actualLatest = migrationRows[0]?.latest == null ? null : Number(migrationRows[0].latest);

  if (migrationRows[0]?.count !== migrationFiles.length) {
    throw new Error(
      `Migration ledger mismatch: expected ${migrationFiles.length}, received ${migrationRows[0]?.count ?? 0}`,
    );
  }
  if (actualLatest !== expectedLatest) {
    throw new Error(`Latest migration mismatch: expected ${expectedLatest}, received ${actualLatest}`);
  }
  if (missing.length > 0) {
    throw new Error(`Required tables are missing after migration: ${missing.join(", ")}`);
  }

  console.log(JSON.stringify({
    status: "qualified",
    migrationCount: migrationFiles.length,
    latestMigration: expectedLatest,
    requiredTableCount: requiredTables.length,
  }));
} finally {
  await client.end({ timeout: 5 });
}
