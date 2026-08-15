ALTER TABLE "ugc_opportunities"
  ADD COLUMN "sample_terms" json NOT NULL DEFAULT '{"required":false,"items":[],"brandPaysShipping":true,"returnRequired":false,"returnWindowDays":0,"notes":""}'::json;

CREATE TABLE "ugc_sample_shipments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collaboration_id" uuid NOT NULL REFERENCES "ugc_collaborations"("id") ON DELETE cascade,
  "requested_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "recipient_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "direction" text NOT NULL DEFAULT 'brand_to_creator',
  "items" json NOT NULL DEFAULT '[]'::json,
  "recipient_address_ciphertext" text NOT NULL,
  "address_summary" json NOT NULL,
  "status" text NOT NULL DEFAULT 'requested',
  "carrier" text,
  "tracking_number_ciphertext" text,
  "status_history" json NOT NULL DEFAULT '[]'::json,
  "shipped_at" timestamp,
  "delivered_at" timestamp,
  "returned_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_sample_shipments_direction_check" CHECK ("direction" IN ('brand_to_creator','creator_to_brand')),
  CONSTRAINT "ugc_sample_shipments_status_check" CHECK ("status" IN ('requested','approved','shipped','delivered','return_requested','returned','cancelled','issue'))
);

CREATE INDEX "ugc_sample_shipments_collaboration_created_idx" ON "ugc_sample_shipments"("collaboration_id","created_at");
CREATE INDEX "ugc_sample_shipments_recipient_status_idx" ON "ugc_sample_shipments"("recipient_user_id","status");
