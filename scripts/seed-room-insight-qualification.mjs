#!/usr/bin/env node
import postgres from "postgres";

const roomId = process.env.QUALIFICATION_ROOM_ID;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!roomId) throw new Error("QUALIFICATION_ROOM_ID is required");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const [room] = await sql`
    select id from community_rooms where id = ${roomId} limit 1
  `;
  if (!room) throw new Error("Qualification room was not found");

  const [profile] = await sql`
    select id
    from community_room_ai_profiles
    where room_id = ${roomId} and status <> 'removed'
    order by created_at
    limit 1
  `;
  if (!profile) throw new Error("Configure a room AI profile before seeding a review fixture");

  const [insight] = await sql`
    insert into community_room_insights (
      room_id,
      agent_profile_id,
      insight_type,
      title,
      body,
      evidence,
      confidence,
      status
    ) values (
      ${roomId},
      ${profile.id},
      'qualification_follow_up',
      'Send the room qualification recap',
      'The meeting workspace test established a concrete follow-up: preserve the verified review result in the durable room record.',
      ${sql.json([
        {
          source: "manual_qualification",
          reference: "CreativesOS production field test",
        },
      ])},
      1,
      'draft'
    )
    returning id
  `;
  console.log(JSON.stringify({ status: "seeded", insightId: insight.id }));
} finally {
  await sql.end({ timeout: 5 });
}
