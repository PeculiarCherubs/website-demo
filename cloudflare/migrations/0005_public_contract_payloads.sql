-- Peculiar Cherubs — Public Content Contract Payloads
-- Stage 4
--
-- D1 remains relational/queryable, while these JSON payloads preserve
-- fields from the existing public contract that do not yet have dedicated
-- relational columns.

ALTER TABLE sermons
ADD COLUMN public_json TEXT NOT NULL DEFAULT '{}'
CHECK (json_valid(public_json));

ALTER TABLE broadcasts
ADD COLUMN public_json TEXT NOT NULL DEFAULT '{}'
CHECK (json_valid(public_json));

INSERT INTO schema_meta (key, value)
VALUES ('public_content_contract', 'cloudflare-stage-4-v1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
