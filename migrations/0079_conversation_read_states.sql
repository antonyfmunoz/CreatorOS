CREATE TABLE "conversation_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"last_read_message_id" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_read_states_participant_unique" ON "conversation_read_states" USING btree ("conversation_id","user_id");
--> statement-breakpoint
CREATE INDEX "conversation_read_states_user_updated_idx" ON "conversation_read_states" USING btree ("user_id","updated_at");
--> statement-breakpoint
INSERT INTO "conversation_read_states" ("conversation_id", "user_id", "last_read_message_id", "updated_at")
SELECT cp."conversation_id", cp."user_id", COALESCE(MAX(dm."id"), 0), now()
FROM "conversation_participants" cp
LEFT JOIN "direct_messages" dm ON dm."conversation_id" = cp."conversation_id"
GROUP BY cp."conversation_id", cp."user_id"
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;
