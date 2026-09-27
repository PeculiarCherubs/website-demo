-- Peculiar Cherubs — Final Security & RBAC Audit
-- READ ONLY.
--
-- This version verifies anonymous write denial without intentionally
-- attempting an UPDATE, so the audit can complete cleanly in Supabase SQL Editor.

-- A. RLS enabled on protected tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'site_content',
    'cms_admins',
    'cms_roles',
    'cms_permissions',
    'cms_role_permissions',
    'content_history'
  )
order by c.relname;

-- B. Browser grants on site_content.
-- Expected: SELECT only for anon and authenticated.
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'site_content'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

-- C. No direct client grants on sensitive RBAC/history support tables.
-- Expected: no rows.
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'cms_admins',
    'cms_roles',
    'cms_permissions',
    'cms_role_permissions',
    'content_history'
  )
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- D. Roles and effective permissions.
select
  r.role_key,
  r.label,
  coalesce(
    array_agg(rp.permission_key order by rp.permission_key)
      filter (where rp.permission_key is not null),
    '{}'
  ) as permissions
from public.cms_roles r
left join public.cms_role_permissions rp
  on rp.role_key = r.role_key
group by r.role_key, r.label, r.sort_order
order by r.sort_order, r.label;

-- E. Authorized Admin accounts and assigned roles.
select
  a.user_id,
  u.email,
  a.role_key,
  a.created_at
from public.cms_admins a
join auth.users u
  on u.id = a.user_id
order by a.created_at;

-- F. RPC execute grants.
-- Expected: authenticated EXECUTE for the CMS/RBAC RPCs; no anon EXECUTE.
select
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in (
    'is_cms_admin',
    'cms_has_permission',
    'cms_can_write_key',
    'cms_get_access_profile',
    'cms_upsert_site_content',
    'cms_recent_content_history',
    'cms_list_roles',
    'cms_list_admins',
    'cms_assign_admin_role',
    'cms_set_admin_role',
    'cms_remove_admin'
  )
  and grantee in ('anon', 'authenticated')
order by routine_name, grantee;

-- G. Version metadata exists.
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'site_content'
  and column_name in ('updated_at', 'updated_by')
order by column_name;

-- H. Audit-history table exists and is queryable from SQL Editor.
select
  count(*) as history_rows
from public.content_history;

-- I. Verify anonymous direct-write privileges WITHOUT attempting a write.
-- Expected: all FALSE.
select
  has_table_privilege('anon', 'public.site_content', 'INSERT') as anon_can_insert,
  has_table_privilege('anon', 'public.site_content', 'UPDATE') as anon_can_update,
  has_table_privilege('anon', 'public.site_content', 'DELETE') as anon_can_delete;

-- J. Authenticated users also have no direct table-write grants.
-- Expected: all FALSE.
select
  has_table_privilege('authenticated', 'public.site_content', 'INSERT') as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.site_content', 'UPDATE') as authenticated_can_update,
  has_table_privilege('authenticated', 'public.site_content', 'DELETE') as authenticated_can_delete;

-- Approved CMS writes are expected to occur through
-- cms_upsert_site_content(), not through direct table UPDATE/INSERT/DELETE.
