CREATE TABLE "operational_service_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "service" text NOT NULL,
  "success" boolean NOT NULL,
  "duration_ms" integer NOT NULL,
  "status_code" integer,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "operational_service_events_duration_check" CHECK ("duration_ms" >= 0),
  CONSTRAINT "operational_service_events_source_unique" UNIQUE("source_type", "source_id")
);
CREATE INDEX "operational_service_events_business_service_occurred_idx" ON "operational_service_events"("business_id", "service", "occurred_at");

CREATE TABLE "operational_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "service" text NOT NULL,
  "metric" text NOT NULL,
  "quantity" bigint NOT NULL DEFAULT 0,
  "unit" text NOT NULL,
  "estimated_cost_micros" bigint NOT NULL DEFAULT 0,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "operational_usage_events_values_check" CHECK ("quantity" >= 0 AND "estimated_cost_micros" >= 0),
  CONSTRAINT "operational_usage_events_source_unique" UNIQUE("source_type", "source_id", "metric")
);
CREATE INDEX "operational_usage_events_business_service_occurred_idx" ON "operational_usage_events"("business_id", "service", "occurred_at");

CREATE TABLE "operational_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "service" text NOT NULL,
  "soft_limit_micros" bigint NOT NULL DEFAULT 0,
  "hard_limit_micros" bigint NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "operational_budgets_limits_check" CHECK ("soft_limit_micros" >= 0 AND "hard_limit_micros" >= "soft_limit_micros"),
  CONSTRAINT "operational_budgets_business_service_unique" UNIQUE("business_id", "service")
);

CREATE TABLE "developer_api_rate_windows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "api_key_id" uuid NOT NULL REFERENCES "developer_api_keys"("id") ON DELETE cascade,
  "window_started_at" timestamp NOT NULL,
  "request_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp NOT NULL,
  CONSTRAINT "developer_api_rate_windows_count_check" CHECK ("request_count" >= 0),
  CONSTRAINT "developer_api_rate_windows_key_window_unique" UNIQUE("api_key_id", "window_started_at")
);
CREATE INDEX "developer_api_rate_windows_expires_idx" ON "developer_api_rate_windows"("expires_at");
