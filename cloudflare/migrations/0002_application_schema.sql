-- Peculiar Cherubs — Cloudflare D1 Application Schema
-- Stage 2
--
-- This migration creates the canonical website/CMS storage model.
-- It intentionally does NOT import Supabase content yet.
--
-- Source of truth after cutover:
--   D1 = transactional source of truth
--   R2 = derived public/media/backup storage
--   Git JSON = explicit emergency read-only fallback

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Page-oriented content that remains naturally JSON-shaped.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_sections (
  key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

-- ---------------------------------------------------------------------------
-- Canonical chapels.
-- Chapel records are relational because they participate in scoped CMS access,
-- sermons and broadcasts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chapels (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  short_title TEXT,
  page_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(page_json)),
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_chapels_published
  ON chapels(published, title);

-- ---------------------------------------------------------------------------
-- Unified sermon archive.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sermons (
  id TEXT PRIMARY KEY,
  chapel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  speaker TEXT,
  service_type TEXT,
  sermon_date TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  source_broadcast_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  FOREIGN KEY (chapel_id) REFERENCES chapels(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sermons_chapel_date
  ON sermons(chapel_id, sermon_date DESC);

CREATE INDEX IF NOT EXISTS idx_sermons_published_date
  ON sermons(published, sermon_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sermons_source_broadcast
  ON sermons(source_broadcast_id)
  WHERE source_broadcast_id IS NOT NULL
    AND source_broadcast_id <> '';

-- ---------------------------------------------------------------------------
-- One active/configurable broadcast record per chapel.
-- Later stages can split historical broadcast events if required.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  chapel_id TEXT NOT NULL UNIQUE,
  title TEXT,
  speaker TEXT,
  service_type TEXT,
  platform TEXT NOT NULL DEFAULT 'youtube'
    CHECK (platform IN ('youtube', 'facebook')),
  video_url TEXT,
  youtube_channel_url TEXT,
  facebook_video_url TEXT,
  facebook_page_url TEXT,
  starts_at TEXT,
  ends_at TEXT,
  status_override TEXT NOT NULL DEFAULT 'auto'
    CHECK (status_override IN ('auto', 'live', 'upcoming', 'recap', 'hidden')),
  bulletin TEXT,
  schedule_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(schedule_json)),
  recap_url TEXT,
  published_sermon_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  FOREIGN KEY (chapel_id) REFERENCES chapels(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  FOREIGN KEY (published_sermon_id) REFERENCES sermons(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_state
  ON broadcasts(status_override, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- CMS roles and permissions.
-- Cloudflare Access authenticates identity.
-- D1 decides application authorization.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cms_roles (
  role_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS cms_permissions (
  permission_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS cms_role_permissions (
  role_key TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (role_key, permission_key),
  FOREIGN KEY (role_key) REFERENCES cms_roles(role_key)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (permission_key) REFERENCES cms_permissions(permission_key)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- access_subject is the validated Cloudflare Access JWT `sub` claim.
CREATE TABLE IF NOT EXISTS cms_admins (
  access_subject TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role_key TEXT NOT NULL,
  display_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_key) REFERENCES cms_roles(role_key)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_cms_admins_role
  ON cms_admins(role_key, enabled);

CREATE TABLE IF NOT EXISTS cms_admin_scopes (
  access_subject TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'chapel')),
  scope_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (access_subject, scope_type, scope_key),
  FOREIGN KEY (access_subject) REFERENCES cms_admins(access_subject)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cms_admin_scopes_lookup
  ON cms_admin_scopes(access_subject, scope_type, scope_key);

-- ---------------------------------------------------------------------------
-- Durable application audit trail.
-- Browser/client code never writes this table directly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_email TEXT,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_history_resource
  ON content_history(resource_type, resource_key, id DESC);

CREATE INDEX IF NOT EXISTS idx_content_history_actor
  ON content_history(actor_subject, id DESC);

-- ---------------------------------------------------------------------------
-- D1 -> R2 publication outbox.
-- D1 and R2 are deliberately not treated as one atomic datastore.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publish_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  target_version INTEGER NOT NULL CHECK (target_version >= 1),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_status
  ON publish_jobs(status, id);

-- Record application schema version.
INSERT INTO schema_meta (key, value)
VALUES ('application_schema', 'cloudflare-stage-2-v1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
