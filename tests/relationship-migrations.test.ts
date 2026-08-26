import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationFiles = [
  "0054_relationship_hub_foundation.sql",
  "0055_relationship_native_delivery_idempotency.sql",
  "0056_relationship_audit_events.sql",
  "0108_native_relationship_actions.sql",
];

const allowedNewTables = new Set([
  "relationship_agent_authority_policies",
  "relationship_agent_suggestions",
  "relationship_audit_events",
  "relationship_channel_connections",
  "relationship_consents",
  "relationship_conversation_bindings",
  "relationship_conversation_notes",
  "relationship_conversation_participants",
  "relationship_conversations",
  "relationship_delivery_jobs",
  "relationship_external_identities",
  "relationship_memory_facts",
  "relationship_merge_candidates",
  "relationship_message_attachments",
  "relationship_message_receipts",
  "relationship_messages",
  "relationship_native_delivery_receipts",
  "relationship_native_action_receipts",
  "relationship_notes",
  "relationship_provider_events",
  "relationship_sync_cursors",
  "relationship_tag_assignments",
  "relationship_tags",
  "relationship_tasks",
  "relationship_voice_consents",
  "relationship_voice_generation_jobs",
  "relationship_voice_profiles",
  "relationships",
]);

function migrationText(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), "migrations", file), "utf8");
}

describe("Relationship Hub migrations", () => {
  it("remain additive and scoped to the canonical relationship tables", () => {
    const sql = migrationFiles.map(migrationText).join("\n");
    expect(sql).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im);
    expect(sql).not.toMatch(/ALTER\s+COLUMN|DROP\s+CONSTRAINT|RENAME\s+/i);

    const created = [...sql.matchAll(/CREATE TABLE\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(created)).toEqual(allowedNewTables);

    for (const match of sql.matchAll(/ALTER TABLE\s+"([^"]+)"/g)) {
      expect(allowedNewTables.has(match[1])).toBe(true);
    }
    for (const match of sql.matchAll(/CREATE(?: UNIQUE)? INDEX\s+"[^"]+"\s+ON\s+"([^"]+)"/g)) {
      expect(allowedNewTables.has(match[1])).toBe(true);
    }
  });
});
