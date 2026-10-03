-- Peculiar Cherubs — Cloudflare Foundation
-- Stage 1
--
-- This migration deliberately creates only a schema metadata table.
-- Application content/auth tables arrive in Stage 2 after staging D1 is confirmed.

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_meta (key, value)
VALUES ('architecture', 'cloudflare-foundation-v1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
