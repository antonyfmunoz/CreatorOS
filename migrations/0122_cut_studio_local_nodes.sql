CREATE TABLE "cut_studio_local_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "capabilities" json NOT NULL,
  "device_secret_hash" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'ready',
  "last_sequence" integer NOT NULL DEFAULT 0,
  "last_seen_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cut_studio_local_nodes_status_check" CHECK ("status" IN ('ready', 'busy', 'paused', 'revoked'))
);
CREATE INDEX "cut_studio_local_nodes_owner_updated_idx" ON "cut_studio_local_nodes" ("owner_user_id", "updated_at");
CREATE TABLE "cut_studio_local_node_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "cut_studio_local_node_invitations_owner_expires_idx" ON "cut_studio_local_node_invitations" ("owner_user_id", "expires_at");
