CREATE TABLE "relationship_native_action_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL,
  "action_type" text NOT NULL,
  "request_hash" text NOT NULL,
  "target_direct_message_id" integer REFERENCES "direct_messages"("id") ON DELETE SET NULL,
  "result" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "relationship_native_action_receipts_business_key_unique"
  ON "relationship_native_action_receipts" ("business_id", "idempotency_key");

CREATE INDEX "relationship_native_action_receipts_target_idx"
  ON "relationship_native_action_receipts" ("business_id", "target_direct_message_id");
