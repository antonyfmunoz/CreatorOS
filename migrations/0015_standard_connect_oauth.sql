ALTER TABLE "creator_payment_accounts" ALTER COLUMN "account_type" SET DEFAULT 'standard';
--> statement-breakpoint
CREATE TABLE "stripe_connect_oauth_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL,
  "state_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "stripe_connect_oauth_states_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
ALTER TABLE "stripe_connect_oauth_states" ADD CONSTRAINT "stripe_connect_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "stripe_connect_oauth_states_expires_at_idx" ON "stripe_connect_oauth_states" USING btree ("expires_at");
