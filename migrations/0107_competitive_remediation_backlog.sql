ALTER TABLE "creative_work_items"
  DROP CONSTRAINT "creative_work_items_kind_check";

ALTER TABLE "creative_work_items"
  ADD CONSTRAINT "creative_work_items_kind_check"
  CHECK ("kind" IN ('content','campaign','broadcast','cut','ugc','distribution','event','podcast','design','newsletter','site','product_gap'));

CREATE TABLE "competitive_benchmark_remediations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "definition_id" uuid NOT NULL REFERENCES "competitive_benchmark_definitions"("id") ON DELETE RESTRICT,
  "comparison_product" text NOT NULL,
  "requirement_id" text NOT NULL,
  "capability" text NOT NULL,
  "acceptance_criterion" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "assignee_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "due_at" timestamp,
  "operator_note" text DEFAULT '' NOT NULL,
  "last_failure_note" text NOT NULL,
  "failure_count" integer DEFAULT 1 NOT NULL,
  "work_item_id" uuid REFERENCES "creative_work_items"("id") ON DELETE SET NULL,
  "last_failed_assessment_id" uuid NOT NULL REFERENCES "competitive_benchmark_assessments"("id") ON DELETE RESTRICT,
  "resolved_by_assessment_id" uuid REFERENCES "competitive_benchmark_assessments"("id") ON DELETE RESTRICT,
  "opened_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "opened_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "competitive_benchmark_remediations_status_check"
    CHECK ("status" IN ('open', 'in_progress', 'ready_for_retest', 'resolved')),
  CONSTRAINT "competitive_benchmark_remediations_priority_check"
    CHECK ("priority" BETWEEN 0 AND 100),
  CONSTRAINT "competitive_benchmark_remediations_failure_count_check"
    CHECK ("failure_count" > 0),
  CONSTRAINT "competitive_benchmark_remediations_resolution_check"
    CHECK (
      ("status" = 'resolved' AND "resolved_by_assessment_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
      OR
      ("status" <> 'resolved' AND "resolved_by_assessment_id" IS NULL AND "resolved_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "competitive_benchmark_remediations_requirement_unique"
  ON "competitive_benchmark_remediations" (
    "business_id",
    "definition_id",
    "comparison_product",
    "requirement_id"
  );

CREATE INDEX "competitive_benchmark_remediations_business_status_idx"
  ON "competitive_benchmark_remediations" ("business_id", "status", "priority");
