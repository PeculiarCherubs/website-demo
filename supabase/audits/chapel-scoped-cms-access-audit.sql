-- Peculiar Cherubs — Chapel-Scoped CMS Access Audit

-- 1. Scope records.
select
  a.user_id,
  u.email,
  a.role_key,
  s.scope_type,
  s.scope_key
from public.cms_admins a
join auth.users u on u.id = a.user_id
left join public.cms_admin_scopes s on s.user_id = a.user_id
order by lower(u.email), s.scope_type, s.scope_key;

-- 2. Chapel Content Manager permissions.
select
  r.role_key,
  r.label,
  array_agg(rp.permission_key order by rp.permission_key) as permissions
from public.cms_roles r
left join public.cms_role_permissions rp on rp.role_key = r.role_key
where r.role_key = 'chapel_content_manager'
group by r.role_key, r.label;

-- 3. Current signed-in Admin profile (run while authenticated through RPC if needed).
select
  proname
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
  and proname in (
    'cms_has_global_scope',
    'cms_can_access_chapel',
    'cms_set_admin_scopes',
    'cms_update_chapel_content',
    'cms_update_chapel_broadcast',
    'cms_upsert_chapel_sermon',
    'cms_delete_chapel_sermon'
  )
order by proname;

-- 4. Scope table direct browser grants.
-- Expected: no rows.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cms_admin_scopes'
  and grantee in ('anon', 'authenticated');
