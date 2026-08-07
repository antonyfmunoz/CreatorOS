-- Preserve previously granted access while moving reads to the entitlement
-- ledger. Some early deployments did not use a purchases table, so only
-- backfill when that legacy source actually exists.
DO $$
BEGIN
  IF to_regclass('public.purchases') IS NOT NULL THEN
    INSERT INTO "entitlements" (
      "user_id",
      "product_id",
      "resource_type",
      "resource_id",
      "status",
      "starts_at"
    )
    SELECT
      "buyer_id",
      "product_id",
      'product',
      "product_id"::text,
      'active',
      "purchased_at"
    FROM "purchases"
    WHERE "status" = 'active'
    ON CONFLICT ("user_id", "resource_type", "resource_id") DO NOTHING;
  END IF;
END $$;
