CREATE TABLE "product_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "rating" integer NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "is_verified_purchase" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_reviews_user_product_unique" UNIQUE("user_id", "product_id")
);
--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "product_reviews_product_id_updated_at_idx" ON "product_reviews" USING btree ("product_id", "updated_at");
