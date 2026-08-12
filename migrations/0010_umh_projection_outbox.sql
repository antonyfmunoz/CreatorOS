CREATE TABLE "projection_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "projection" text DEFAULT 'creativesos' NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" text NOT NULL,
  "event_type" text NOT NULL,
  "actor_user_id" integer,
  "payload" json DEFAULT '{}' NOT NULL,
  "idempotency_key" text NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "delivered_at" timestamp,
  CONSTRAINT "projection_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "projection_events" ADD CONSTRAINT "projection_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
