ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_type" text NOT NULL DEFAULT 'digital_download';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "billing_model" text NOT NULL DEFAULT 'one_time';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "billing_interval" text;

UPDATE "products"
SET "product_type" = CASE
  WHEN lower("category") LIKE '%course%' THEN 'course'
  WHEN lower("category") LIKE '%community%' THEN 'community'
  WHEN lower("category") LIKE '%membership%' THEN 'membership'
  ELSE 'digital_download'
END
WHERE "product_type" = 'digital_download';

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "provider_subscription_reference" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "subscription_status" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "subscription_cancel_at" timestamp;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "subscription_cancel_at_period_end" boolean DEFAULT false NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "orders_provider_subscription_reference_unique"
  ON "orders" ("provider_subscription_reference")
  WHERE "provider_subscription_reference" IS NOT NULL;

ALTER TABLE "creator_earnings_allocations"
  DROP CONSTRAINT IF EXISTS "creator_earnings_allocations_order_id_unique";
ALTER TABLE "creator_earnings_allocations"
  ADD COLUMN IF NOT EXISTS "provider_event_reference" text;
CREATE INDEX IF NOT EXISTS "creator_earnings_allocations_order_id_idx"
  ON "creator_earnings_allocations" ("order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "creator_earnings_allocations_provider_event_unique"
  ON "creator_earnings_allocations" ("provider_event_reference")
  WHERE "provider_event_reference" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "creator_earnings_allocations_pending_order_unique"
  ON "creator_earnings_allocations" ("order_id")
  WHERE "provider_event_reference" IS NULL;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "product_type_snapshot" text NOT NULL DEFAULT 'digital_download';
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "billing_model_snapshot" text NOT NULL DEFAULT 'one_time';
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "billing_interval_snapshot" text;

UPDATE "order_items" AS oi
SET
  "product_type_snapshot" = p."product_type",
  "billing_model_snapshot" = p."billing_model",
  "billing_interval_snapshot" = p."billing_interval"
FROM "products" AS p
WHERE p."id" = oi."product_id";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_mvp_product_type_check') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_mvp_product_type_check"
      CHECK ("product_type" IN ('digital_download', 'course', 'community', 'membership'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_billing_model_check') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_billing_model_check"
      CHECK ("billing_model" IN ('one_time', 'recurring'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_billing_interval_check') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_billing_interval_check"
      CHECK (
        ("billing_model" = 'one_time' AND "billing_interval" IS NULL)
        OR
        ("billing_model" = 'recurring' AND "billing_interval" IN ('month', 'year') AND "product_type" IN ('community', 'membership'))
      );
  END IF;
END $$;
