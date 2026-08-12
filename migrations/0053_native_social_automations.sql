CREATE TABLE "automation_contact_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" text DEFAULT 'native' NOT NULL,
  "conversation_id" integer REFERENCES "conversations"("id") ON DELETE SET NULL,
  "opted_out" boolean DEFAULT false NOT NULL,
  "opted_out_at" timestamp,
  "last_inbound_at" timestamp,
  "last_outbound_at" timestamp,
  "cooldown_until" timestamp,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_contact_states_owner_contact_channel_unique" UNIQUE("owner_user_id", "contact_user_id", "channel")
);
--> statement-breakpoint
CREATE INDEX "automation_contact_states_owner_updated_idx" ON "automation_contact_states" ("owner_user_id", "updated_at");
