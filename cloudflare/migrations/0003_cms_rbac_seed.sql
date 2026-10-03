-- Peculiar Cherubs — Cloudflare D1 CMS RBAC Seed
-- Stage 2
--
-- Mirrors the stabilized Supabase role/permission intent and adds the
-- chapel-scoped and livestream permissions already introduced there.

PRAGMA foreign_keys = ON;

INSERT INTO cms_permissions (permission_key, label, description) VALUES
  ('publications.manage', 'Publications', 'Manage publications, Goodnews, devotion and Sunday School content.'),
  ('sermons.manage', 'Sermons', 'Manage sermon records and media.'),
  ('events.manage', 'Events', 'Manage events and event media/content.'),
  ('ministries.manage', 'Ministries & Chapels', 'Manage ministries, chapels, Bible College and house fellowships.'),
  ('chapel.content.manage', 'Chapel Page Content', 'Manage canonical content for assigned chapel pages.'),
  ('about.manage', 'About & Leadership', 'Manage About and Leadership content.'),
  ('quicklinks.manage', 'Quick Links & Schedule', 'Manage quick links, services and church rhythm.'),
  ('giving.manage', 'Giving & Payments', 'Manage public giving/payment destinations and messaging.'),
  ('site.manage', 'Site Settings', 'Manage site identity, home settings and navigation-related settings exposed by the CMS.'),
  ('livestream.manage', 'Broadcasts', 'Manage multi-chapel upcoming, live and recap broadcast configuration.'),
  ('advanced.manage', 'Advanced Content', 'Use advanced raw-content/system content management tools.'),
  ('history.view', 'Audit History', 'View recent CMS change history.'),
  ('admins.manage', 'Admin Access', 'Assign/remove CMS administrators, roles and scopes.'),
  ('export.manage', 'Export Content', 'Export the complete CMS content set.')
ON CONFLICT(permission_key) DO UPDATE SET
  label = excluded.label,
  description = excluded.description;

INSERT INTO cms_roles (role_key, label, description, sort_order) VALUES
  ('super_admin', 'Super Admin', 'Full CMS access, security-sensitive settings and Admin role management.', 10),
  ('content_manager', 'Content Manager', 'Manage general public content but not Giving, Advanced Content or Admin access.', 20),
  ('communications_editor', 'Communications Editor', 'Manage publications, sermons, events, quick links and broadcasts.', 30),
  ('ministry_editor', 'Ministry Editor', 'Manage ministries, chapels, Bible College, fellowships and leadership.', 40),
  ('chapel_content_manager', 'Chapel Content Manager', 'Manage assigned chapel page content, chapel sermons and chapel broadcasts only.', 45),
  ('giving_editor', 'Giving Editor', 'Manage Giving & Payments only.', 50),
  ('site_editor', 'Site Editor', 'Manage Site Settings only.', 60),
  ('viewer', 'CMS Viewer', 'Sign in to the CMS dashboard without content write permissions.', 90)
ON CONFLICT(role_key) DO UPDATE SET
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- Deterministic role-permission rebuild.
DELETE FROM cms_role_permissions
WHERE role_key IN (
  'super_admin',
  'content_manager',
  'communications_editor',
  'ministry_editor',
  'chapel_content_manager',
  'giving_editor',
  'site_editor',
  'viewer'
);

INSERT INTO cms_role_permissions (role_key, permission_key)
SELECT 'super_admin', permission_key
FROM cms_permissions;

INSERT INTO cms_role_permissions (role_key, permission_key) VALUES
  ('content_manager', 'publications.manage'),
  ('content_manager', 'sermons.manage'),
  ('content_manager', 'events.manage'),
  ('content_manager', 'ministries.manage'),
  ('content_manager', 'about.manage'),
  ('content_manager', 'quicklinks.manage'),
  ('content_manager', 'site.manage'),
  ('content_manager', 'history.view'),
  ('content_manager', 'livestream.manage'),

  ('communications_editor', 'publications.manage'),
  ('communications_editor', 'sermons.manage'),
  ('communications_editor', 'events.manage'),
  ('communications_editor', 'quicklinks.manage'),
  ('communications_editor', 'livestream.manage'),

  ('ministry_editor', 'ministries.manage'),
  ('ministry_editor', 'about.manage'),

  ('chapel_content_manager', 'chapel.content.manage'),
  ('chapel_content_manager', 'sermons.manage'),
  ('chapel_content_manager', 'livestream.manage'),

  ('giving_editor', 'giving.manage'),

  ('site_editor', 'site.manage')
ON CONFLICT(role_key, permission_key) DO NOTHING;

INSERT INTO schema_meta (key, value)
VALUES ('cms_rbac_seed', 'cloudflare-stage-2-v1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
