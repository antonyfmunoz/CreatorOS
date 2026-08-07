CREATE TABLE "asset_product_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL,
  "product_id" integer NOT NULL,
  "created_by_user_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "asset_product_access_unique" UNIQUE("asset_id", "product_id")
);
--> statement-breakpoint
ALTER TABLE "asset_product_access" ADD CONSTRAINT "asset_product_access_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset_product_access" ADD CONSTRAINT "asset_product_access_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset_product_access" ADD CONSTRAINT "asset_product_access_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "asset_product_access_product_idx" ON "asset_product_access" USING btree ("product_id");
