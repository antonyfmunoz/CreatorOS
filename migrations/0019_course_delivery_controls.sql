ALTER TABLE "course_lessons"
  ADD COLUMN IF NOT EXISTS "available_after_days" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "course_assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lesson_id" uuid NOT NULL REFERENCES "course_lessons"("id") ON DELETE CASCADE,
  "passing_score_percent" integer NOT NULL DEFAULT 70,
  "questions" json NOT NULL DEFAULT '[]'::json,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "course_assessments_lesson_id_unique" UNIQUE("lesson_id")
);

CREATE TABLE IF NOT EXISTS "course_assessment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assessment_id" uuid NOT NULL REFERENCES "course_assessments"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "score_percent" integer NOT NULL,
  "passed" boolean NOT NULL,
  "answers" json NOT NULL DEFAULT '{}'::json,
  "completed_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "course_assessment_attempts_assessment_user_completed_idx"
  ON "course_assessment_attempts" ("assessment_id", "user_id", "completed_at");
