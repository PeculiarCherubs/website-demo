const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const issues = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const admin = read('js/admin.js');
const service = read('js/contentService.js');
const migration = read('supabase/migrations/final-cms-security-hardening.sql');
const html = read('admin/index.html');

for (const required of [
  '/rest/v1/rpc/cms_upsert_site_content',
  'cms_permission_denied',
  'fetchCmsAccessProfile',
  'applyAccessProfile',
  'admins.manage',
  'Admin Access & Roles'
]) {
  const haystack = required === 'Admin Access & Roles' ? html : admin;
  if (!haystack.includes(required)) issues.push(`Missing Admin RBAC integration: ${required}`);
}

if (admin.includes('?on_conflict=key')) {
  issues.push('Legacy direct table upsert path is still present.');
}

if (!service.includes('getSectionVersion') || !service.includes('updated_at')) {
  issues.push('Optimistic concurrency metadata is not wired through ContentService.');
}

for (const required of [
  'cms_roles',
  'cms_permissions',
  'cms_role_permissions',
  'cms_has_permission',
  'cms_can_write_key',
  'cms_get_access_profile',
  'cms_assign_admin_role',
  'cms_set_admin_role',
  'cms_remove_admin',
  'content_history',
  'cms_upsert_site_content',
  'updated_at',
  'updated_by',
  'revoke all privileges on table public.site_content from anon, authenticated',
  'grant select on table public.site_content to anon, authenticated'
]) {
  if (!migration.includes(required)) issues.push(`Hardening migration missing: ${required}`);
}

if (/ADMIN_PASS|adminPasscode|passcode/i.test(admin)) {
  issues.push('Legacy passcode-based authentication appears to remain.');
}

if (issues.length) {
  console.error('Security integrity check FAILED');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('Security integrity check PASS');
