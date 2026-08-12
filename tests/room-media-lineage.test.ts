import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("room transcript session lineage migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "migrations/0048_transcript_session_lineage.sql"),
    "utf8",
  );

  it("binds every transcript segment to a transcription session", () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "agent_session_id" uuid');
    expect(migration).toContain('REFERENCES "community_room_agent_sessions"("id")');
    expect(migration).toContain('ALTER COLUMN "agent_session_id" SET NOT NULL');
    expect(migration).toContain("Cannot bind existing transcript segments to a transcription session");
  });

  it("scopes provider idempotency to the exact agent session", () => {
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "community_room_transcript_room_segment_unique"');
    expect(migration).toContain('"community_room_transcript_session_segment_unique"');
    expect(migration).toContain('("agent_session_id", "provider_segment_id")');
  });
});
