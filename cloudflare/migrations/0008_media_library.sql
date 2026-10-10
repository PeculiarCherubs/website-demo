-- Peculiar Cherubs — Cloudflare Stage 6B
-- R2-backed CMS media library metadata and RBAC.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  public_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  etag TEXT,
  alt_text TEXT,
  scope_type TEXT NOT NULL DEFAULT 'global'
    CHECK (scope_type IN ('global', 'chapel')),
  chapel_id TEXT,
  uploaded_by_subject TEXT NOT NULL,
  uploaded_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (chapel_id) REFERENCES chapels(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CHECK (
    (scope_type = 'global' AND chapel_id IS NULL)
    OR
    (scope_type = 'chapel' AND chapel_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_media_assets_active
  ON media_assets(deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_scope
  ON media_assets(scope_type, chapel_id, deleted_at, created_at DESC);

INSERT INTO cms_permissions (permission_key, label, description)
VALUES (
  'media.manage',
  'Media Library',
  'Upload, browse and delete approved website media within the administrator scope.'
)
ON CONFLICT(permission_key) DO UPDATE SET
  label = excluded.label,
  description = excluded.description;

INSERT INTO cms_role_permissions (role_key, permission_key) VALUES
  ('super_admin', 'media.manage'),
  ('content_manager', 'media.manage'),
  ('communications_editor', 'media.manage'),
  ('ministry_editor', 'media.manage'),
  ('chapel_content_manager', 'media.manage'),
  ('site_editor', 'media.manage')
ON CONFLICT(role_key, permission_key) DO NOTHING;

INSERT INTO schema_meta (key, value)
VALUES ('media_library', 'cloudflare-stage-6b-v1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
