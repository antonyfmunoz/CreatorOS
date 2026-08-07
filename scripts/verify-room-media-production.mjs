#!/usr/bin/env node
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to verify room media storage");
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const [column] = await client`
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'community_room_transcript_segments'
      and column_name = 'agent_session_id'
  `;
  const [index] = await client`
    select indexdef
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'community_room_transcript_session_segment_unique'
  `;
  const [counts] = await client`
    select
      (select count(*)::int from community_room_transcript_segments) as transcript_segments,
      (select count(*)::int from community_room_agent_sessions) as agent_sessions,
      (select count(*)::int
       from community_room_transcript_segments
       where agent_session_id is null) as orphan_segments,
      (select count(*)::int
       from community_room_recordings
       where status in ('starting', 'active', 'stopping')) as active_recordings,
      (select count(*)::int
       from community_room_agent_sessions
       where status in ('starting', 'active')) as active_agent_sessions
  `;
  const [ledger] = await client.unsafe(
    'select count(*)::int as count, max(created_at)::bigint as latest from "drizzle"."__drizzle_migrations"',
  );

  const passed =
    column?.is_nullable === "NO"
    && typeof index?.indexdef === "string"
    && index.indexdef.includes("agent_session_id")
    && index.indexdef.includes("provider_segment_id")
    && counts?.orphan_segments === 0;

  console.log(JSON.stringify({
    status: passed ? "verified" : "failed",
    transcriptSessionLineage: {
      columnRequired: column?.is_nullable === "NO",
      sessionScopedIdempotency: Boolean(index?.indexdef),
      orphanSegments: counts?.orphan_segments ?? null,
    },
    runtimeCounts: {
      transcriptSegments: counts?.transcript_segments ?? null,
      agentSessions: counts?.agent_sessions ?? null,
      activeRecordings: counts?.active_recordings ?? null,
      activeAgentSessions: counts?.active_agent_sessions ?? null,
    },
    migrationLedger: {
      count: ledger?.count ?? null,
      latest: ledger?.latest ? Number(ledger.latest) : null,
    },
  }));

  if (!passed) process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
