-- Peculiar Cherubs — Final CMS Security Hardening + RBAC
--
-- Adds:
--   * role-based CMS access
--   * section-level server-side write authorization
--   * Admin role assignment for existing Supabase Auth users
--   * optimistic concurrency
--   * append-only audit history
--   * removal of direct browser table writes
--
-- IMPORTANT:
-- Run AFTER Minimum CMS Write Security.
-- Existing rows in cms_admins are promoted to `super_admin` so the current
-- approved Admin account does not lose access.

begin;

-- ===========================================================================
-- 1. RBAC catalog
-- ===========================================================================

create table if not exists public.cms_roles (
  role_key text primary key,
  label text not null,
  description text not null default '',
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.cms_permissions (
  permission_key text primary key,
  label text not null,
  description text not null default ''
);

create table if not exists public.cms_role_permissions (
  role_key text not null references public.cms_roles(role_key) on delete cascade,
  permission_key text not null references public.cms_permissions(permission_key) on delete cascade,
  primary key (role_key, permission_key)
);

alter table public.cms_roles enable row level security;
alter table public.cms_permissions enable row level security;
alter table public.cms_role_permissions enable row level security;

revoke all privileges on table public.cms_roles from anon, authenticated;
revoke all privileges on table public.cms_permissions from anon, authenticated;
revoke all privileges on table public.cms_role_permissions from anon, authenticated;

insert into public.cms_permissions (permission_key, label, description)
values
  ('publications.manage', 'Publications', 'Manage publications, Goodnews, devotion and Sunday School content.'),
  ('sermons.manage', 'Sermons', 'Manage sermon records and media.'),
  ('events.manage', 'Events', 'Manage events and event media/content.'),
  ('ministries.manage', 'Ministries & Chapels', 'Manage ministries, chapels, Bible College and house fellowships.'),
  ('about.manage', 'About & Leadership', 'Manage About/Leadership content.'),
  ('quicklinks.manage', 'Quick Links & Schedule', 'Manage quick links, services and church rhythm.'),
  ('giving.manage', 'Giving & Payments', 'Manage public giving/payment destinations and messaging.'),
  ('site.manage', 'Site Settings', 'Manage site identity, home settings and navigation-related settings exposed by the CMS.'),
  ('advanced.manage', 'Advanced Content', 'Use the raw Advanced Content editor.'),
  ('history.view', 'Audit History', 'View recent CMS change history.'),
  ('admins.manage', 'Admin Access', 'Assign/remove CMS administrators and roles.'),
  ('export.manage', 'Export Content', 'Export the complete CMS content JSON.')
on conflict (permission_key) do update
set label = excluded.label,
    description = excluded.description;

insert into public.cms_roles (role_key, label, description, sort_order)
values
  ('super_admin', 'Super Admin', 'Full CMS access, security-sensitive settings and Admin role management.', 10),
  ('content_manager', 'Content Manager', 'Manage general public content but not Giving, Advanced Content or Admin access.', 20),
  ('communications_editor', 'Communications Editor', 'Manage publications, sermons, events and quick links.', 30),
  ('ministry_editor', 'Ministry Editor', 'Manage ministries, chapels, Bible College, fellowships and leadership.', 40),
  ('giving_editor', 'Giving Editor', 'Manage Giving & Payments only.', 50),
  ('site_editor', 'Site Editor', 'Manage Site Settings only.', 60),
  ('viewer', 'CMS Viewer', 'Sign in to the CMS dashboard without content write permissions.', 90)
on conflict (role_key) do update
set label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

-- Rebuild seeded role permissions deterministically.
delete from public.cms_role_permissions
where role_key in (
  'super_admin',
  'content_manager',
  'communications_editor',
  'ministry_editor',
  'giving_editor',
  'site_editor',
  'viewer'
);

insert into public.cms_role_permissions (role_key, permission_key)
select 'super_admin', permission_key
from public.cms_permissions;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('content_manager', 'publications.manage'),
  ('content_manager', 'sermons.manage'),
  ('content_manager', 'events.manage'),
  ('content_manager', 'ministries.manage'),
  ('content_manager', 'about.manage'),
  ('content_manager', 'quicklinks.manage'),
  ('content_manager', 'site.manage'),
  ('content_manager', 'history.view'),

  ('communications_editor', 'publications.manage'),
  ('communications_editor', 'sermons.manage'),
  ('communications_editor', 'events.manage'),
  ('communications_editor', 'quicklinks.manage'),

  ('ministry_editor', 'ministries.manage'),
  ('ministry_editor', 'about.manage'),

  ('giving_editor', 'giving.manage'),

  ('site_editor', 'site.manage')
on conflict do nothing;

-- ===========================================================================
-- 2. Upgrade existing allowlist to role-bearing Admin accounts
-- ===========================================================================

alter table public.cms_admins
  add column if not exists role_key text;

update public.cms_admins
set role_key = 'super_admin'
where role_key is null or btrim(role_key) = '';

alter table public.cms_admins
  alter column role_key set default 'super_admin';

alter table public.cms_admins
  alter column role_key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cms_admins_role_key_fkey'
      and conrelid = 'public.cms_admins'::regclass
  ) then
    alter table public.cms_admins
      add constraint cms_admins_role_key_fkey
      foreign key (role_key)
      references public.cms_roles(role_key);
  end if;
end $$;

alter table public.cms_admins enable row level security;
revoke all privileges on table public.cms_admins from anon, authenticated;

-- ===========================================================================
-- 3. RBAC helper functions
-- ===========================================================================

create or replace function public.is_cms_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cms_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_cms_admin() from public;
grant execute on function public.is_cms_admin() to authenticated;

create or replace function public.cms_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cms_admins a
    join public.cms_role_permissions rp
      on rp.role_key = a.role_key
    where a.user_id = auth.uid()
      and rp.permission_key = p_permission
  );
$$;

revoke all on function public.cms_has_permission(text) from public;
grant execute on function public.cms_has_permission(text) to authenticated;

create or replace function public.cms_can_write_key(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_permission text;
begin
  if not public.is_cms_admin() then
    return false;
  end if;

  -- Advanced Content is intentionally the escape hatch for Super Admins.
  if public.cms_has_permission('advanced.manage') then
    return true;
  end if;

  v_permission := case p_key
    when 'publications' then 'publications.manage'
    when 'sermons' then 'sermons.manage'
    when 'events' then 'events.manage'
    when 'ministries' then 'ministries.manage'
    when 'chapels' then 'ministries.manage'
    when 'bibleCollege' then 'ministries.manage'
    when 'about' then 'about.manage'
    when 'quickLinks' then 'quicklinks.manage'
    when 'give' then 'giving.manage'
    when 'site' then 'site.manage'
    when 'navigation' then 'site.manage'
    when 'home' then 'site.manage'
    else null
  end;

  return v_permission is not null
     and public.cms_has_permission(v_permission);
end;
$$;

revoke all on function public.cms_can_write_key(text) from public;
grant execute on function public.cms_can_write_key(text) to authenticated;

create or replace function public.cms_get_access_profile()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'user_id', a.user_id,
    'email', u.email,
    'role_key', a.role_key,
    'role_label', r.label,
    'permissions', coalesce(
      (
        select jsonb_agg(rp.permission_key order by rp.permission_key)
        from public.cms_role_permissions rp
        where rp.role_key = a.role_key
      ),
      '[]'::jsonb
    )
  )
  from public.cms_admins a
  join public.cms_roles r on r.role_key = a.role_key
  join auth.users u on u.id = a.user_id
  where a.user_id = auth.uid();
$$;

revoke all on function public.cms_get_access_profile() from public;
grant execute on function public.cms_get_access_profile() to authenticated;

-- ===========================================================================
-- 4. Super-Admin role management RPCs
-- ===========================================================================

create or replace function public.cms_list_roles()
returns table (
  role_key text,
  label text,
  description text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.cms_has_permission('admins.manage') then
    raise exception using errcode = '42501', message = 'admin_management_required';
  end if;

  return query
  select r.role_key, r.label, r.description
  from public.cms_roles r
  order by r.sort_order, r.label;
end;
$$;

revoke all on function public.cms_list_roles() from public;
grant execute on function public.cms_list_roles() to authenticated;

create or replace function public.cms_list_admins()
returns table (
  user_id uuid,
  email text,
  role_key text,
  role_label text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.cms_has_permission('admins.manage') then
    raise exception using errcode = '42501', message = 'admin_management_required';
  end if;

  return query
  select a.user_id, u.email::text, a.role_key, r.label, a.created_at
  from public.cms_admins a
  join auth.users u on u.id = a.user_id
  join public.cms_roles r on r.role_key = a.role_key
  order by lower(u.email);
end;
$$;

revoke all on function public.cms_list_admins() from public;
grant execute on function public.cms_list_admins() to authenticated;

create or replace function public.cms_assign_admin_role(
  p_email text,
  p_role_key text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  if not public.cms_has_permission('admins.manage') then
    raise exception using errcode = '42501', message = 'admin_management_required';
  end if;

  if not exists (select 1 from public.cms_roles where role_key = p_role_key) then
    raise exception using errcode = '22023', message = 'unknown_cms_role';
  end if;

  select id
  into v_user_id
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'auth_user_not_found',
      hint = 'Create the user in Supabase Authentication first.';
  end if;

  insert into public.cms_admins (user_id, role_key)
  values (v_user_id, p_role_key)
  on conflict (user_id)
  do update set role_key = excluded.role_key;
end;
$$;

revoke all on function public.cms_assign_admin_role(text, text) from public;
grant execute on function public.cms_assign_admin_role(text, text) to authenticated;

create or replace function public.cms_set_admin_role(
  p_user_id uuid,
  p_role_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
  v_super_admin_count integer;
begin
  if not public.cms_has_permission('admins.manage') then
    raise exception using errcode = '42501', message = 'admin_management_required';
  end if;

  if not exists (select 1 from public.cms_roles where role_key = p_role_key) then
    raise exception using errcode = '22023', message = 'unknown_cms_role';
  end if;

  select role_key into v_current_role
  from public.cms_admins
  where user_id = p_user_id
  for update;

  if v_current_role is null then
    raise exception using errcode = '22023', message = 'cms_admin_not_found';
  end if;

  if v_current_role = 'super_admin' and p_role_key <> 'super_admin' then
    select count(*) into v_super_admin_count
    from public.cms_admins
    where role_key = 'super_admin';

    if v_super_admin_count <= 1 then
      raise exception using errcode = '42501', message = 'last_super_admin_required';
    end if;
  end if;

  update public.cms_admins
  set role_key = p_role_key
  where user_id = p_user_id;
end;
$$;

revoke all on function public.cms_set_admin_role(uuid, text) from public;
grant execute on function public.cms_set_admin_role(uuid, text) to authenticated;

create or replace function public.cms_remove_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_super_admin_count integer;
begin
  if not public.cms_has_permission('admins.manage') then
    raise exception using errcode = '42501', message = 'admin_management_required';
  end if;

  if p_user_id = auth.uid() then
    raise exception using errcode = '42501', message = 'cannot_remove_current_admin';
  end if;

  select role_key into v_role
  from public.cms_admins
  where user_id = p_user_id
  for update;

  if v_role = 'super_admin' then
    select count(*) into v_super_admin_count
    from public.cms_admins
    where role_key = 'super_admin';

    if v_super_admin_count <= 1 then
      raise exception using errcode = '42501', message = 'last_super_admin_required';
    end if;
  end if;

  delete from public.cms_admins
  where user_id = p_user_id;
end;
$$;

revoke all on function public.cms_remove_admin(uuid) from public;
grant execute on function public.cms_remove_admin(uuid) to authenticated;

-- ===========================================================================
-- 5. Version metadata + audit history
-- ===========================================================================

alter table public.site_content
  add column if not exists updated_at timestamptz not null default now();

alter table public.site_content
  add column if not exists updated_by uuid null references auth.users(id) on delete set null;

create table if not exists public.content_history (
  id bigint generated by default as identity primary key,
  content_key text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_at timestamptz not null default now(),
  changed_by uuid null references auth.users(id) on delete set null,
  old_data jsonb null,
  new_data jsonb null,
  old_updated_at timestamptz null,
  new_updated_at timestamptz null
);

create index if not exists content_history_key_changed_at_idx
  on public.content_history (content_key, changed_at desc);

alter table public.content_history enable row level security;
revoke all privileges on table public.content_history from anon, authenticated;

create or replace function public.touch_site_content_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.touch_site_content_metadata() from public;

drop trigger if exists site_content_touch_metadata on public.site_content;
create trigger site_content_touch_metadata
before insert or update on public.site_content
for each row execute function public.touch_site_content_metadata();

create or replace function public.audit_site_content_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.content_history (
      content_key, action, changed_by, new_data, new_updated_at
    )
    values (
      new.key, 'INSERT', auth.uid(), new.data, new.updated_at
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.content_history (
      content_key, action, changed_by, old_data, new_data,
      old_updated_at, new_updated_at
    )
    values (
      new.key, 'UPDATE', auth.uid(), old.data, new.data,
      old.updated_at, new.updated_at
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.content_history (
      content_key, action, changed_by, old_data, old_updated_at
    )
    values (
      old.key, 'DELETE', auth.uid(), old.data, old.updated_at
    );
    return old;
  end if;

  return null;
end;
$$;

revoke all on function public.audit_site_content_change() from public;

drop trigger if exists site_content_audit_change on public.site_content;
create trigger site_content_audit_change
after insert or update or delete on public.site_content
for each row execute function public.audit_site_content_change();

-- ===========================================================================
-- 6. Remove direct browser writes
-- ===========================================================================

revoke all privileges on table public.site_content from anon, authenticated;
grant select on table public.site_content to anon, authenticated;

alter table public.site_content enable row level security;

drop policy if exists "Allow public all operations" on public.site_content;
drop policy if exists "Allow public read access" on public.site_content;
drop policy if exists "Public can read site content" on public.site_content;
drop policy if exists "CMS admins can insert site content" on public.site_content;
drop policy if exists "CMS admins can update site content" on public.site_content;
drop policy if exists "CMS admins can delete site content" on public.site_content;

create policy "Public can read site content"
on public.site_content
for select
to anon, authenticated
using (true);

-- ===========================================================================
-- 7. Permission-aware, conflict-aware write RPC
-- ===========================================================================

create or replace function public.cms_upsert_site_content(
  p_key text,
  p_data jsonb,
  p_expected_updated_at timestamptz default null
)
returns table (
  key text,
  data jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_updated_at timestamptz;
begin
  if not public.is_cms_admin() then
    raise exception using errcode = '42501', message = 'cms_admin_required';
  end if;

  if not public.cms_can_write_key(p_key) then
    raise exception using errcode = '42501', message = 'cms_permission_denied';
  end if;

  if p_key is null or btrim(p_key) = '' then
    raise exception using errcode = '22023', message = 'content_key_required';
  end if;

  if p_data is null then
    raise exception using errcode = '22023', message = 'content_data_required';
  end if;

  select sc.updated_at
  into v_current_updated_at
  from public.site_content sc
  where sc.key = p_key
  for update;

  if found then
    if p_expected_updated_at is null then
      raise exception using errcode = '40001', message = 'content_version_required';
    end if;

    if v_current_updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'content_conflict';
    end if;

    update public.site_content sc
    set data = p_data
    where sc.key = p_key;
  else
    if p_expected_updated_at is not null then
      raise exception using errcode = '40001', message = 'content_conflict';
    end if;

    insert into public.site_content (key, data)
    values (p_key, p_data);
  end if;

  return query
  select sc.key, sc.data, sc.updated_at
  from public.site_content sc
  where sc.key = p_key;
end;
$$;

revoke all on function public.cms_upsert_site_content(text, jsonb, timestamptz) from public;
grant execute on function public.cms_upsert_site_content(text, jsonb, timestamptz) to authenticated;

-- ===========================================================================
-- 8. Permission-aware history RPC
-- ===========================================================================

create or replace function public.cms_recent_content_history(
  p_limit integer default 50
)
returns table (
  id bigint,
  content_key text,
  action text,
  changed_at timestamptz,
  changed_by uuid,
  old_updated_at timestamptz,
  new_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.cms_has_permission('history.view') then
    raise exception using errcode = '42501', message = 'cms_permission_denied';
  end if;

  return query
  select
    h.id, h.content_key, h.action, h.changed_at, h.changed_by,
    h.old_updated_at, h.new_updated_at
  from public.content_history h
  order by h.changed_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.cms_recent_content_history(integer) from public;
grant execute on function public.cms_recent_content_history(integer) to authenticated;

commit;

-- ===========================================================================
-- Verification
-- ===========================================================================

select user_id, role_key, created_at
from public.cms_admins
order by created_at;

select r.role_key, r.label, array_agg(rp.permission_key order by rp.permission_key) as permissions
from public.cms_roles r
left join public.cms_role_permissions rp on rp.role_key = r.role_key
group by r.role_key, r.label, r.sort_order
order by r.sort_order, r.label;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'site_content'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
