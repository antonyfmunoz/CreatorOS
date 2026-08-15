CREATE TABLE "broadcast_brand_kits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL,
  "business_id" uuid NOT NULL,
  "name" text NOT NULL,
  "primary_color" text NOT NULL,
  "surface_color" text NOT NULL,
  "text_color" text NOT NULL,
  "logo_asset_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_brand_kits_owner_name_unique" UNIQUE("owner_user_id", "name"),
  CONSTRAINT "broadcast_brand_kits_primary_color_check" CHECK ("primary_color" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "broadcast_brand_kits_surface_color_check" CHECK ("surface_color" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "broadcast_brand_kits_text_color_check" CHECK ("text_color" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "broadcast_brand_kits_name_check" CHECK (char_length(trim("name")) BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "broadcast_brand_kits" ADD CONSTRAINT "broadcast_brand_kits_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_brand_kits" ADD CONSTRAINT "broadcast_brand_kits_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_brand_kits" ADD CONSTRAINT "broadcast_brand_kits_logo_asset_id_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_brand_kits_owner_updated_idx" ON "broadcast_brand_kits" USING btree ("owner_user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "broadcast_brand_kits_business_updated_idx" ON "broadcast_brand_kits" USING btree ("business_id", "updated_at");
