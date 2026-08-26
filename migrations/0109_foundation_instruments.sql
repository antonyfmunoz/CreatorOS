CREATE TABLE "foundation_instruments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "current_revision" integer DEFAULT 1 NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "authority_scope" text DEFAULT 'business' NOT NULL,
  "extension" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "foundation_instruments_kind_check" CHECK ("kind" IN ('document','spreadsheet','presentation','database','form','calendar','finance_ledger')),
  CONSTRAINT "foundation_instruments_status_check" CHECK ("status" IN ('draft','in_review','approved','published','archived')),
  CONSTRAINT "foundation_instruments_revision_check" CHECK ("current_revision" > 0),
  CONSTRAINT "foundation_instruments_title_check" CHECK (length(btrim("title")) BETWEEN 1 AND 160)
);

CREATE INDEX "foundation_instruments_business_kind_idx" ON "foundation_instruments" ("business_id", "kind");
CREATE INDEX "foundation_instruments_business_status_idx" ON "foundation_instruments" ("business_id", "status");

CREATE TABLE "foundation_instrument_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "instrument_id" uuid NOT NULL REFERENCES "foundation_instruments"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "title" text NOT NULL,
  "content" json NOT NULL,
  "actor_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "change_summary" text NOT NULL,
  "base_revision" integer,
  "evidence" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "foundation_instrument_revisions_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "foundation_instrument_revisions_base_check" CHECK ("base_revision" IS NULL OR "base_revision" > 0),
  CONSTRAINT "foundation_instrument_revision_unique" UNIQUE ("instrument_id", "revision")
);

CREATE INDEX "foundation_instrument_revision_idx" ON "foundation_instrument_revisions" ("instrument_id", "revision");

CREATE TABLE "foundation_instrument_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "instrument_id" uuid NOT NULL REFERENCES "foundation_instruments"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "actor_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "payload" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "foundation_instrument_events_created_idx" ON "foundation_instrument_events" ("instrument_id", "created_at");

CREATE TABLE "foundation_form_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "form_instrument_id" uuid NOT NULL REFERENCES "foundation_instruments"("id") ON DELETE CASCADE,
  "database_instrument_id" uuid NOT NULL REFERENCES "foundation_instruments"("id") ON DELETE RESTRICT,
  "submitted_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "idempotency_key" text NOT NULL,
  "values" json NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "foundation_form_submission_idempotency_unique" UNIQUE ("form_instrument_id", "idempotency_key")
);

CREATE INDEX "foundation_form_submissions_database_idx" ON "foundation_form_submissions" ("database_instrument_id", "created_at");

-- Preserve the legacy document surface as a migration alias. The canonical
-- UUID and revision ledger become authoritative while the source integer ID is
-- retained as provenance for support, audit, and rollback analysis.
INSERT INTO "foundation_instruments" (
  "business_id",
  "kind",
  "title",
  "status",
  "current_revision",
  "owner_user_id",
  "authority_scope",
  "extension",
  "created_at",
  "updated_at"
)
SELECT
  business."id",
  'document',
  document."title",
  'draft',
  1,
  document."user_id",
  'business',
  json_build_object('legacyDocumentId', document."id", 'migrationAlias', 'documents.v1'),
  document."created_at",
  document."updated_at"
FROM "documents" document
JOIN LATERAL (
  SELECT candidate."id"
  FROM "businesses" candidate
  WHERE candidate."owner_user_id" = document."user_id"
  ORDER BY candidate."is_default" DESC, candidate."created_at" ASC
  LIMIT 1
) business ON true;

INSERT INTO "foundation_instrument_revisions" (
  "instrument_id",
  "revision",
  "title",
  "content",
  "actor_user_id",
  "change_summary",
  "base_revision",
  "evidence",
  "created_at"
)
SELECT
  instrument."id",
  1,
  instrument."title",
  json_build_object('format', 'plain_text', 'body', document."content"),
  instrument."owner_user_id",
  'Imported from legacy CreativesOS documents',
  NULL,
  json_build_object('source', 'legacy_document', 'legacyDocumentId', document."id"),
  instrument."created_at"
FROM "foundation_instruments" instrument
JOIN "documents" document
  ON (instrument."extension"->>'legacyDocumentId')::integer = document."id"
WHERE instrument."extension"->>'migrationAlias' = 'documents.v1';

INSERT INTO "foundation_instrument_events" (
  "instrument_id",
  "business_id",
  "event_type",
  "to_status",
  "actor_user_id",
  "payload",
  "created_at"
)
SELECT
  instrument."id",
  instrument."business_id",
  'instrument.migrated',
  'draft',
  instrument."owner_user_id",
  json_build_object('source', 'documents.v1', 'revision', 1),
  instrument."created_at"
FROM "foundation_instruments" instrument
WHERE instrument."extension"->>'migrationAlias' = 'documents.v1';
