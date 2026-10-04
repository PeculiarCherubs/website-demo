-- Peculiar Cherubs — Cloudflare CMS Write API Foundation
-- Stage 5
--
-- Adds:
--   * one optimistic-concurrency version per public CMS section;
--   * request IDs for atomic write/audit correlation;
--   * pending Cloudflare Access CMS invitations;
--   * richer durable audit metadata.
--
-- D1 remains the transactional source of truth for Cloudflare staging.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cms_section_versions (
  section_key TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  last_request_id TEXT
);

INSERT INTO cms_section_versions (section_key, version)
VALUES
  ('site', 1),
  ('navigation', 1),
  ('home', 1),
  ('about', 1),
  ('ministries', 1),
  ('publications', 1),
  ('events', 1),
  ('bibleCollege', 1),
  ('quickLinks', 1),
  ('give', 1),
  ('chapels', 1),
  ('sermons', 1),
  ('livestream', 1)
ON CONFLICT(section_key) DO NOTHING;

ALTER TABLE site_sections ADD COLUMN last_request_id TEXT;
ALTER TABLE chapels ADD COLUMN last_request_id TEXT;
ALTER TABLE sermons ADD COLUMN last_request_id TEXT;
ALTER TABLE broadcasts ADD COLUMN last_request_id TEXT;

ALTER TABLE content_history ADD COLUMN request_id TEXT;
ALTER TABLE content_history ADD COLUMN from_version INTEGER;
ALTER TABLE content_history ADD COLUMN to_version INTEGER;
ALTER TABLE content_history ADD COLUMN metadata_json TEXT
  CHECK (metadata_json IS NULL OR json_valid(metadata_json));

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_history_request_id
  ON content_history(request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE publish_jobs ADD COLUMN request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_jobs_request_resource
  ON publish_jobs(request_id, resource_type, resource_key, target_version)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cms_admin_invites (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  role_key TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'global'
    CHECK (scope_type IN ('global', 'chapel')),
  chapel_keys_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(chapel_keys_json)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  invited_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_key) REFERENCES cms_roles(role_key)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_cms_admin_invites_enabled
  ON cms_admin_invites(enabled, email);

INSERT INTO schema_meta (key, value)
VALUES ('cms_write_api', 'cloudflare-stage-5-v1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
