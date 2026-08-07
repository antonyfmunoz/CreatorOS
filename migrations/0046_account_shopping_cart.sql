CREATE TABLE IF NOT EXISTS "shopping_cart_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "shopping_cart_user_product_unique" UNIQUE("user_id", "product_id")
);

DO $$ BEGIN
  ALTER TABLE "shopping_cart_items"
    ADD CONSTRAINT "shopping_cart_items_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shopping_cart_items"
    ADD CONSTRAINT "shopping_cart_items_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "shopping_cart_user_created_idx"
  ON "shopping_cart_items" ("user_id", "created_at");
