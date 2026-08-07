ALTER TABLE "channel_messages" ADD COLUMN IF NOT EXISTS "parent_message_id" integer REFERENCES "channel_messages"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_messages_channel_parent_created_idx" ON "channel_messages" ("channel_id", "parent_message_id", "created_at");
