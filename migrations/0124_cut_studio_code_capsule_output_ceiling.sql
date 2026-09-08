-- Older local code-composition records could have been saved before the
-- isolated node's 64 MiB artifact ceiling was made authoritative. Preserve
-- their pinned source and all other limits, but lower only an oversized output
-- budget so a valid local video request is admitted instead of failing schema
-- validation before it can be queued.
UPDATE "cut_studio_compositions"
SET "code_capsule" = jsonb_set(
  "code_capsule"::jsonb,
  '{maximumOutputBytes}',
  to_jsonb(67108864),
  true
)::json
WHERE "code_capsule" IS NOT NULL
  AND json_typeof("code_capsule") = 'object'
  AND ("code_capsule"::jsonb ? 'maximumOutputBytes')
  AND ("code_capsule"::jsonb ->> 'maximumOutputBytes') ~ '^[0-9]+$'
  AND ("code_capsule"::jsonb ->> 'maximumOutputBytes')::numeric > 67108864;
