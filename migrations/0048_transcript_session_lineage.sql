ALTER TABLE "community_room_transcript_segments"
  ADD COLUMN IF NOT EXISTS "agent_session_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_room_transcript_segments_agent_session_id_fkey'
  ) THEN
    ALTER TABLE "community_room_transcript_segments"
      ADD CONSTRAINT "community_room_transcript_segments_agent_session_id_fkey"
      FOREIGN KEY ("agent_session_id")
      REFERENCES "community_room_agent_sessions"("id")
      ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "community_room_transcript_segments" AS segment
SET "agent_session_id" = (
  SELECT candidate."id"
  FROM "community_room_agent_sessions" AS candidate
  WHERE candidate."room_id" = segment."room_id"
    AND candidate."kind" = 'transcription'
  ORDER BY candidate."created_at" DESC
  LIMIT 1
)
WHERE segment."agent_session_id" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "community_room_transcript_segments"
    WHERE "agent_session_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot bind existing transcript segments to a transcription session';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "community_room_transcript_segments"
  ALTER COLUMN "agent_session_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "community_room_transcript_segments"
  DROP CONSTRAINT IF EXISTS "community_room_transcript_room_segment_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_room_transcript_session_segment_unique"
  ON "community_room_transcript_segments" ("agent_session_id", "provider_segment_id");
