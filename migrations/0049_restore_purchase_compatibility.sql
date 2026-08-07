-- The original production database already had this compatibility table, but
-- it was never represented in the forward migration chain. Keep existing
-- installations unchanged while making a clean CreativesOS installation
-- match the application schema.
CREATE TABLE IF NOT EXISTS "purchases" (
  "id" serial PRIMARY KEY NOT NULL,
  "buyer_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "payment_provider" text DEFAULT 'demo' NOT NULL,
  "purchased_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "buyer_product_unique" UNIQUE("buyer_id", "product_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_buyer_id_users_id_fk'
  ) THEN
    ALTER TABLE "purchases"
      ADD CONSTRAINT "purchases_buyer_id_users_id_fk"
      FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_product_id_products_id_fk'
  ) THEN
    ALTER TABLE "purchases"
      ADD CONSTRAINT "purchases_product_id_products_id_fk"
      FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
