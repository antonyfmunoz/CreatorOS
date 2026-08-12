ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "provider_payment_reference" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "financial_status" text NOT NULL DEFAULT 'open';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refunded_amount" double precision NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "disputed_amount" double precision NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "last_provider_event_at" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_provider_payment_reference_unique"
  ON "orders" ("provider_payment_reference")
  WHERE "provider_payment_reference" IS NOT NULL;

ALTER TABLE "creator_payment_accounts" ADD COLUMN IF NOT EXISTS "disabled_reason" text;
ALTER TABLE "creator_payment_accounts" ADD COLUMN IF NOT EXISTS "requirements_currently_due" json NOT NULL DEFAULT '[]'::json;
ALTER TABLE "creator_payment_accounts" ADD COLUMN IF NOT EXISTS "requirements_past_due" json NOT NULL DEFAULT '[]'::json;
ALTER TABLE "creator_payment_accounts" ADD COLUMN IF NOT EXISTS "country" text;
ALTER TABLE "creator_payment_accounts" ADD COLUMN IF NOT EXISTS "default_currency" text;

ALTER TABLE "creator_earnings_allocations" ADD COLUMN IF NOT EXISTS "refunded_amount" double precision NOT NULL DEFAULT 0;
ALTER TABLE "creator_earnings_allocations" ADD COLUMN IF NOT EXISTS "disputed_amount" double precision NOT NULL DEFAULT 0;
ALTER TABLE "creator_earnings_allocations" ADD COLUMN IF NOT EXISTS "reversed_amount" double precision NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "commerce_provider_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "livemode" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'processing',
  "order_id" uuid REFERENCES "orders"("id") ON DELETE SET NULL,
  "connected_account_id" text,
  "provider_object_reference" text,
  "amount" double precision,
  "currency" text,
  "payload_sha256" text NOT NULL,
  "error_code" text,
  "error_message" text,
  "received_at" timestamp NOT NULL DEFAULT now(),
  "processed_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_provider_event_unique" UNIQUE ("provider", "provider_event_id")
);
CREATE INDEX IF NOT EXISTS "commerce_provider_events_order_created_idx"
  ON "commerce_provider_events" ("order_id", "received_at");
CREATE INDEX IF NOT EXISTS "commerce_provider_events_status_updated_idx"
  ON "commerce_provider_events" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "creator_payout_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seller_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "stripe_connected_account_id" text NOT NULL,
  "provider_payout_id" text NOT NULL UNIQUE,
  "amount" double precision NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL,
  "arrival_at" timestamp,
  "failure_code" text,
  "failure_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "creator_payout_events_seller_updated_idx"
  ON "creator_payout_events" ("seller_user_id", "updated_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_financial_status_check') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_financial_status_check"
      CHECK ("financial_status" IN ('open', 'paid', 'partially_refunded', 'refunded', 'disputed', 'dispute_won', 'dispute_lost'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commerce_provider_events_status_check') THEN
    ALTER TABLE "commerce_provider_events" ADD CONSTRAINT "commerce_provider_events_status_check"
      CHECK ("status" IN ('processing', 'processed', 'ignored', 'failed'));
  END IF;
END $$;

UPDATE "orders"
SET "financial_status" = CASE WHEN "status" = 'paid' THEN 'paid' ELSE 'open' END
WHERE "financial_status" = 'open';
