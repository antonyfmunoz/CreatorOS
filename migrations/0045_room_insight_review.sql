ALTER TABLE "community_room_insights"
  ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" integer,
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "accepted_note_id" uuid,
  ADD COLUMN IF NOT EXISTS "accepted_action_item_id" uuid;

DO $$ BEGIN
  ALTER TABLE "community_room_insights"
    ADD CONSTRAINT "community_room_insights_reviewed_by_user_id_users_id_fk"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_room_insights"
    ADD CONSTRAINT "community_room_insights_accepted_note_id_community_room_notes_id_fk"
    FOREIGN KEY ("accepted_note_id") REFERENCES "public"."community_room_notes"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_room_insights"
    ADD CONSTRAINT "community_room_insights_accepted_action_item_id_community_room_action_items_id_fk"
    FOREIGN KEY ("accepted_action_item_id") REFERENCES "public"."community_room_action_items"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "community_room_insights_review_queue_idx"
  ON "community_room_insights" ("room_id", "status", "created_at");
