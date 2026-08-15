ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "posts_user_client_mutation_unique"
  ON "posts" ("user_id", "client_mutation_id")
  WHERE "client_mutation_id" IS NOT NULL;

ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "direct_messages_sender_client_mutation_unique"
  ON "direct_messages" ("sender_id", "client_mutation_id")
  WHERE "client_mutation_id" IS NOT NULL;

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "assets_owner_client_mutation_unique"
  ON "assets" ("owner_user_id", "client_mutation_id")
  WHERE "client_mutation_id" IS NOT NULL;
