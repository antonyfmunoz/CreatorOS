CREATE TABLE IF NOT EXISTS "product_saves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_save_user_product_unique" UNIQUE("user_id", "product_id")
);

CREATE INDEX IF NOT EXISTS "product_save_user_created_idx"
  ON "product_saves" ("user_id", "created_at");
