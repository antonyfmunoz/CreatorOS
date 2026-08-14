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
  "relationship_tenant_policies",
  "relationship_usage_ledger",
  "relationship_usage_reservations",
  "relationship_operational_alerts",
  "relationship_room_bindings",
  "account_privacy_requests",
  "commerce_provider_events",
  "creator_payout_events",
  "production_backups",
  "cut_studio_projects",
  "cut_studio_audio_templates",
  "cut_studio_project_media",
  "cut_studio_jobs",
  "cut_studio_versions",
  "cut_studio_review_links",
  "cut_studio_review_comments",
  "cut_studio_review_decisions",
  "broadcast_studios",
  "broadcast_studio_collaborators",
  "broadcast_studio_versions",
  "broadcast_brand_kits",
  "broadcast_destinations",
  "broadcast_sessions",
  "broadcast_session_tracks",
  "broadcast_session_markers",
  "broadcast_destination_receipts",
  "broadcast_audience_messages",
  "broadcast_template_catalog",
  "broadcast_capture_nodes",
  "broadcast_capture_invitations",
  "broadcast_capture_telemetry",
  "ugc_creator_profiles",
  "ugc_portfolio_items",
  "ugc_opportunities",
  "ugc_applications",
  "ugc_collaborations",
  "ugc_submissions",
  "ugc_performance_snapshots",
  "ugc_earnings_ledger",
];

const requiredColumns = {
  users: ["profile_links", "push_notifications_enabled", "color_mode"],
  products: ["product_type", "billing_model", "billing_interval"],
  orders: ["provider_payment_reference", "provider_subscription_reference", "subscription_status", "subscription_cancel_at", "subscription_cancel_at_period_end", "financial_status", "refunded_amount", "disputed_amount", "last_provider_event_at"],
  order_items: ["product_type_snapshot", "billing_model_snapshot", "billing_interval_snapshot"],
  creator_payment_accounts: ["disabled_reason", "requirements_currently_due", "requirements_past_due", "country", "default_currency"],
  creator_earnings_allocations: ["provider_event_reference", "refunded_amount", "disputed_amount", "reversed_amount"],
};

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
  const columnRows = await client.unsafe(
    `select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  );
  const presentColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = Object.entries(requiredColumns).flatMap(([table, columns]) =>
    columns.filter((column) => !presentColumns.has(`${table}.${column}`)).map((column) => `${table}.${column}`),
  );
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
  if (missingColumns.length > 0) {
    throw new Error(`Required columns are missing after migration: ${missingColumns.join(", ")}`);
  }

  console.log(JSON.stringify({
    status: "qualified",
    migrationCount: migrationFiles.length,
    latestMigration: expectedLatest,
    requiredTableCount: requiredTables.length,
    requiredColumnCount: Object.values(requiredColumns).flat().length,
  }));
} finally {
  await client.end({ timeout: 5 });
}
