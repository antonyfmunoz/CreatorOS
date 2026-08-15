CREATE TABLE "developer_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "scopes" json NOT NULL DEFAULT '[]'::json,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "developer_api_keys_business_created_idx" ON "developer_api_keys"("business_id", "created_at");

CREATE TABLE "developer_api_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "api_key_id" uuid REFERENCES "developer_api_keys"("id") ON DELETE set null,
  "request_id" text NOT NULL,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "status_code" integer NOT NULL,
  "duration_ms" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "developer_api_requests_business_created_idx" ON "developer_api_requests"("business_id", "created_at");

CREATE TABLE "developer_webhook_endpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "events" json NOT NULL DEFAULT '[]'::json,
  "secret_ciphertext" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "last_delivery_at" timestamp,
  "disabled_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "developer_webhook_endpoints_status_check" CHECK ("status" IN ('active','disabled','revoked'))
);
CREATE INDEX "developer_webhook_endpoints_business_status_idx" ON "developer_webhook_endpoints"("business_id", "status");

CREATE TABLE "developer_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "event_type" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "developer_webhook_events_business_idempotency_unique" UNIQUE("business_id", "idempotency_key")
);

CREATE TABLE "developer_webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "developer_webhook_events"("id") ON DELETE cascade,
  "endpoint_id" uuid NOT NULL REFERENCES "developer_webhook_endpoints"("id") ON DELETE cascade,
  "attempt" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending',
  "response_code" integer,
  "error_code" text,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "delivered_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "developer_webhook_deliveries_status_check" CHECK ("status" IN ('pending','delivering','delivered','retrying','dead_letter')),
  CONSTRAINT "developer_webhook_deliveries_attempt_check" CHECK ("attempt" BETWEEN 0 AND 10),
  CONSTRAINT "developer_webhook_deliveries_event_endpoint_unique" UNIQUE("event_id", "endpoint_id")
);
CREATE INDEX "developer_webhook_deliveries_retry_idx" ON "developer_webhook_deliveries"("status", "next_attempt_at");
