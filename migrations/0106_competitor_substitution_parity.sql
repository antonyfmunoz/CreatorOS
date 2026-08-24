ALTER TABLE "competitive_benchmark_definitions"
  ADD COLUMN "parity_requirements" json NOT NULL DEFAULT '[]'::json;

ALTER TABLE "competitive_benchmark_assessments"
  ADD COLUMN "requirement_results" json NOT NULL DEFAULT '[]'::json,
  ADD COLUMN "required_capability_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "passed_capability_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "failed_capability_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "competitive_benchmark_assessments"
  ADD CONSTRAINT "competitive_benchmark_assessment_capability_counts_check"
  CHECK (
    "required_capability_count" >= 0
    AND "passed_capability_count" >= 0
    AND "failed_capability_count" >= 0
    AND "passed_capability_count" + "failed_capability_count" = "required_capability_count"
  );
