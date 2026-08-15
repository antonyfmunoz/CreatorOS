ALTER TABLE "community_memberships"
  ADD COLUMN "onboarding_completed_at" timestamp;

-- Existing members predate guided onboarding and retain uninterrupted access.
UPDATE "community_memberships"
SET "onboarding_completed_at" = COALESCE("joined_at", now());

CREATE TABLE "community_onboarding_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE cascade,
  "prompt" text NOT NULL,
  "kind" text NOT NULL,
  "options" json NOT NULL DEFAULT '[]'::json,
  "required" boolean NOT NULL DEFAULT true,
  "position" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "community_onboarding_questions_kind_check" CHECK ("kind" IN ('single_select','multi_select','text'))
);
CREATE INDEX "community_onboarding_questions_community_position_idx" ON "community_onboarding_questions"("community_id", "position");

CREATE TABLE "community_onboarding_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "membership_id" integer NOT NULL REFERENCES "community_memberships"("id") ON DELETE cascade,
  "question_id" uuid NOT NULL REFERENCES "community_onboarding_questions"("id") ON DELETE restrict,
  "answer" json NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "community_onboarding_responses_membership_question_unique" UNIQUE("membership_id", "question_id")
);

CREATE TABLE "community_point_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "points" integer NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "community_point_events_points_check" CHECK ("points" BETWEEN -1000000 AND 1000000),
  CONSTRAINT "community_point_events_source_unique" UNIQUE("community_id", "user_id", "source_type", "source_id")
);
CREATE INDEX "community_point_events_community_created_idx" ON "community_point_events"("community_id", "created_at");

CREATE TABLE "community_badges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "icon" text NOT NULL DEFAULT 'sparkles',
  "points_threshold" integer NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "community_badges_points_threshold_check" CHECK ("points_threshold" BETWEEN 0 AND 1000000),
  CONSTRAINT "community_badges_community_name_unique" UNIQUE("community_id", "name")
);

CREATE TABLE "community_member_badges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "badge_id" uuid NOT NULL REFERENCES "community_badges"("id") ON DELETE cascade,
  "awarded_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "community_member_badges_user_badge_unique" UNIQUE("user_id", "badge_id")
);

-- Every existing community gets a useful, editable baseline badge ladder.
INSERT INTO "community_badges" ("community_id", "name", "description", "icon", "points_threshold")
SELECT "id", 'First steps', 'Joined and started participating.', 'footprints', 10 FROM "communities"
UNION ALL
SELECT "id", 'Contributor', 'Made a consistent contribution to the community.', 'sparkles', 100 FROM "communities"
UNION ALL
SELECT "id", 'Community builder', 'Helped the community sustain meaningful momentum.', 'trophy', 300 FROM "communities";
