#!/usr/bin/env node
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const roomId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(roomId ?? ""))
  throw new Error("Provide a room UUID");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const rows = await sql.unsafe(
    `select id, status, provider_recording_id, storage_key, duration_ms,
            size_bytes, error_message, created_at, stopped_at
       from community_room_recordings
      where room_id = $1
      order by created_at desc
      limit 10`,
    [roomId],
  );
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
