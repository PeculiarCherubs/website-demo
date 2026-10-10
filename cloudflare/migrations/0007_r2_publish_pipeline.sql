-- Peculiar Cherubs — Cloudflare Stage 6A
-- R2 public snapshot publication state + retry metadata.

ALTER TABLE publish_jobs
  ADD COLUMN processing_started_at TEXT;

ALTER TABLE publish_jobs
  ADD COLUMN last_attempt_at TEXT;

CREATE TABLE IF NOT EXISTS publication_state (
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  published_version INTEGER NOT NULL CHECK (published_version >= 1),
  object_key TEXT NOT NULL,
  etag TEXT,
  request_id TEXT,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_type, resource_key)
);

CREATE INDEX IF NOT EXISTS idx_publication_state_published_at
  ON publication_state(published_at DESC);

INSERT INTO schema_meta (key, value)
VALUES ('publication_pipeline', 'cloudflare-stage-6a-v1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
