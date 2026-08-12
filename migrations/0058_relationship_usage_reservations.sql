CREATE TABLE "relationship_usage_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "metric" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'reserved' NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "period_start" timestamp NOT NULL,
  "expires_at" timestamp NOT NULL,
  "finalized_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "relationship_usage_reservations" ADD CONSTRAINT "relationship_usage_reservations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_usage_reservation_business_key_unique" ON "relationship_usage_reservations" USING btree ("business_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "relationship_usage_reservation_capacity_idx" ON "relationship_usage_reservations" USING btree ("business_id","period_start","metric","status","expires_at");
