-- Communities created before the bootstrap channel existed should remain usable.
INSERT INTO "channels" ("community_id", "name")
SELECT "communities"."id", 'general'
FROM "communities"
WHERE NOT EXISTS (
  SELECT 1
  FROM "channels"
  WHERE "channels"."community_id" = "communities"."id"
);
