ALTER TABLE "products" ADD COLUMN "payout_mode" text DEFAULT 'platform' NOT NULL;
--> statement-breakpoint
CREATE TABLE "creator_payment_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL,
  "stripe_account_id" text NOT NULL,
  "account_type" text DEFAULT 'express' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "details_submitted" boolean DEFAULT false NOT NULL,
  "charges_enabled" boolean DEFAULT false NOT NULL,
  "payouts_enabled" boolean DEFAULT false NOT NULL,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "creator_payment_accounts_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "creator_payment_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
ALTER TABLE "creator_payment_accounts" ADD CONSTRAINT "creator_payment_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "creator_earnings_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "seller_user_id" integer NOT NULL,
  "stripe_connected_account_id" text NOT NULL,
  "currency" text DEFAULT 'usd' NOT NULL,
  "gross_amount" double precision NOT NULL,
  "platform_fee_amount" double precision NOT NULL,
  "creator_net_amount" double precision NOT NULL,
  "payment_intent_reference" text,
  "status" text DEFAULT 'payment_required' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "creator_earnings_allocations_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "creator_earnings_allocations" ADD CONSTRAINT "creator_earnings_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creator_earnings_allocations" ADD CONSTRAINT "creator_earnings_allocations_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "creator_earnings_allocations_seller_user_id_idx" ON "creator_earnings_allocations" USING btree ("seller_user_id");
