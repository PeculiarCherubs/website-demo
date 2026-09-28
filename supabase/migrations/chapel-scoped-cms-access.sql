-- Peculiar Cherubs — Chapel-Scoped CMS Access
--
-- Run AFTER:
--   1. final-cms-security-hardening.sql
--   2. multi-chapel-broadcast-foundation.sql
--
-- Purpose:
--   * introduce one reusable Chapel Content Manager role
--   * scope that role to one or more chapels
--   * enforce scope in Supabase, not only in the Admin UI
--   * provide chapel-safe RPCs for chapel content, broadcasts and sermons
--
-- Existing Admins are migrated to GLOBAL scope so no existing access is lost.

begin;

-- ===========================================================================
-- 1. Scope catalog
-- ===========================================================================

create table if not exists public.cms_admin_scopes (
  user_id uuid not null references public.cms_admins(user_id) on delete cascade,
  scope_type text not null check (scope_type in ('global', 'chapel')),
  scope_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, scope_type, scope_key)
);

alter table public.cms_admin_scopes enable row level security;
revoke all privileges on table public.cms_admin_scopes from anon, authenticated;

-- Preserve all current Admin access exactly as it is today.
insert into public.cms_admin_scopes (user_id, scope_type, scope_key)
select user_id, 'global', '*'
from public.cms_admins
on conflict do nothing;

-- ===========================================================================
-- 2. Chapel manager permission + role
-- ===========================================================================

insert into public.cms_permissions (permission_key, label, description)
values (
  'chapel.content.manage',
  'Chapel Page Content',
  'Manage canonical content for assigned chapel pages.'
)
on conflict (permission_key) do update
set label = excluded.label,
    description = excluded.description;

insert into public.cms_roles (role_key, label, description, sort_order)
values (
  'chapel_content_manager',
  'Chapel Content Manager',
  'Manage assigned chapel page content, chapel sermons and chapel broadcasts only.',
  45
)
on conflict (role_key) do update
set label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

delete from public.cms_role_permissions
where role_key = 'chapel_content_manager';

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('chapel_content_manager', 'chapel.content.manage'),
  ('chapel_content_manager', 'sermons.manage'),
  ('chapel_content_manager', 'livestream.manage')
on conflict do nothing;

-- ===========================================================================
-- 3. Scope helpers
-- ===========================================================================

create or replace function public.cms_has_global_scope()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cms_admin_scopes s
    where s.user_id = auth.uid()
      and s.scope_type = 'global'
      and s.scope_key = '*'
  );
$$;

revoke all on function public.cms_has_global_scope() from public;
grant execute on function public.cms_has_global_scope() to authenticated;

create or replace function public.cms_is_known_chapel(p_chapel_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.site_content sc
    where sc.key = 'chapels'
      and coalesce(sc.data -> 'details', '{}'::jsonb) ? p_chapel_key
  );
$$;

revoke all on function public.cms_is_known_chapel(text) from public;
grant execute on function public.cms_is_known_chapel(text) to authenticated;

create or replace function public.cms_can_access_chapel(p_chapel_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.cms_has_global_scope()
    or exists (
      select 1
      from public.cms_admin_scopes s
      where s.user_id = auth.uid()
        and s.scope_type = 'chapel'
        and s.scope_key = p_chapel_key
    );
$$;

revoke all on function public.cms_can_access_chapel(text) from public;
grant execute on function public.cms_can_access_chapel(text) to authenticated;

-- ===========================================================================
-- 4. Access profile now includes resource scope
-- ===========================================================================

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
    ),
    'scope_type',
      case
        when exists (
          select 1
          from public.cms_admin_scopes s
          where s.user_id = a.user_id
            and s.scope_type = 'global'
            and s.scope_key = '*'
        ) then 'global'
        else 'chapel'
      end,
    'chapel_scopes', coalesce(
      (
        select jsonb_agg(s.scope_key order by s.scope_key)
        from public.cms_admin_scopes s
        where s.user_id = a.user_id
          and s.scope_type = 'chapel'
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
-- 5. Admin Access management with scope information
-- ===========================================================================

drop function if exists public.cms_list_admins();

create function public.cms_list_admins()
returns table (
  user_id uuid,
  email text,
  role_key text,
  role_label text,
  scope_type text,
  chapel_scopes text[],
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
  select
    a.user_id,
    u.email::text,
    a.role_key,
    r.label,
    case
      when exists (
        select 1
        from public.cms_admin_scopes sg
        where sg.user_id = a.user_id
          and sg.scope_type = 'global'
          and sg.scope_key = '*'
      ) then 'global'::text
      else 'chapel'::text
    end,
    coalesce(
      (
        select array_agg(sc.scope_key order by sc.scope_key)
        from public.cms_admin_scopes sc
        where sc.user_id = a.user_id
          and sc.scope_type = 'chapel'
      ),
      array[]::text[]
    ),
    a.created_at
  from public.cms_admins a
  join auth.users u on u.id = a.user_id
  join public.cms_roles r on r.role_key = a.role_key
  order by lower(u.email);
end;
$$;

revoke all on function public.cms_list_admins() from public;
grant execute on function public.cms_list_admins() to authenticated;

create or replace function public.cms_set_admin_scopes(
  p_user_id uuid,
  p_scope_type text,
  p_chapel_keys text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_key text;
  v_key text;
begin
  if not public.cms_has_permission('admins.manage') then
    raise exception using errcode = '42501', message = 'admin_management_required';
  end if;

  select role_key
  into v_role_key
  from public.cms_admins
  where user_id = p_user_id
  for update;

  if v_role_key is null then
    raise exception using errcode = '22023', message = 'cms_admin_not_found';
  end if;

  if p_scope_type not in ('global', 'chapel') then
    raise exception using errcode = '22023', message = 'invalid_scope_type';
  end if;

  -- Resource-scoped access is intentionally limited to the dedicated role.
  if v_role_key = 'chapel_content_manager' and p_scope_type <> 'chapel' then
    raise exception using errcode = '22023', message = 'chapel_manager_requires_chapel_scope';
  end if;

  if v_role_key <> 'chapel_content_manager' and p_scope_type <> 'global' then
    raise exception using errcode = '22023', message = 'non_chapel_role_requires_global_scope';
  end if;

  if p_scope_type = 'chapel' then
    if coalesce(array_length(p_chapel_keys, 1), 0) = 0 then
      raise exception using errcode = '22023', message = 'chapel_scope_required';
    end if;

    foreach v_key in array p_chapel_keys loop
      if not public.cms_is_known_chapel(v_key) then
        raise exception using errcode = '22023', message = 'unknown_chapel_scope';
      end if;
    end loop;
  end if;

  delete from public.cms_admin_scopes
  where user_id = p_user_id;

  if p_scope_type = 'global' then
    insert into public.cms_admin_scopes (user_id, scope_type, scope_key)
    values (p_user_id, 'global', '*');
  else
    insert into public.cms_admin_scopes (user_id, scope_type, scope_key)
    select p_user_id, 'chapel', key
    from unnest(p_chapel_keys) as key
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.cms_set_admin_scopes(uuid, text, text[]) from public;
grant execute on function public.cms_set_admin_scopes(uuid, text, text[]) to authenticated;

-- Keep role changes safe: switching into Chapel Content Manager clears any
-- previous global scope until explicit chapel assignment is made.
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

  delete from public.cms_admin_scopes where user_id = v_user_id;

  if p_role_key <> 'chapel_content_manager' then
    insert into public.cms_admin_scopes (user_id, scope_type, scope_key)
    values (v_user_id, 'global', '*');
  end if;
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

  delete from public.cms_admin_scopes where user_id = p_user_id;

  if p_role_key <> 'chapel_content_manager' then
    insert into public.cms_admin_scopes (user_id, scope_type, scope_key)
    values (p_user_id, 'global', '*');
  end if;
end;
$$;

revoke all on function public.cms_set_admin_role(uuid, text) from public;
grant execute on function public.cms_set_admin_role(uuid, text) to authenticated;

-- ===========================================================================
-- 6. Generic write RPC is GLOBAL-only for shared multi-resource sections
-- ===========================================================================

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

  if public.cms_has_permission('advanced.manage') then
    return true;
  end if;

  -- Shared multi-resource sections can only be replaced wholesale by users
  -- with GLOBAL scope. Chapel managers must use the scoped RPCs below.
  if p_key = 'chapels' then
    return public.cms_has_global_scope()
       and public.cms_has_permission('ministries.manage');
  elsif p_key = 'sermons' then
    return public.cms_has_global_scope()
       and public.cms_has_permission('sermons.manage');
  elsif p_key = 'livestream' then
    return public.cms_has_global_scope()
       and public.cms_has_permission('livestream.manage');
  end if;

  v_permission := case p_key
    when 'publications' then 'publications.manage'
    when 'events' then 'events.manage'
    when 'ministries' then 'ministries.manage'
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

-- ===========================================================================
-- 7. Chapel-safe content RPC
-- ===========================================================================

create or replace function public.cms_update_chapel_content(
  p_chapel_key text,
  p_chapel_data jsonb,
  p_expected_updated_at timestamptz
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
  v_data jsonb;
  v_updated_at timestamptz;
  v_current jsonb;
begin
  if not public.is_cms_admin() then
    raise exception using errcode = '42501', message = 'cms_admin_required';
  end if;

  if not (
    public.cms_can_access_chapel(p_chapel_key)
    and (
      public.cms_has_permission('chapel.content.manage')
      or public.cms_has_permission('ministries.manage')
    )
  ) then
    raise exception using errcode = '42501', message = 'chapel_scope_denied';
  end if;

  if not public.cms_is_known_chapel(p_chapel_key) then
    raise exception using errcode = '22023', message = 'unknown_chapel_scope';
  end if;

  if p_chapel_data is null or jsonb_typeof(p_chapel_data) <> 'object' then
    raise exception using errcode = '22023', message = 'chapel_data_required';
  end if;

  select sc.data, sc.updated_at
  into v_data, v_updated_at
  from public.site_content sc
  where sc.key = 'chapels'
  for update;

  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'content_version_required';
  end if;

  if v_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'content_conflict';
  end if;

  v_data := jsonb_set(
    v_data,
    array['details', p_chapel_key],
    p_chapel_data || jsonb_build_object('id', p_chapel_key),
    true
  );

  if jsonb_typeof(v_data -> 'current') = 'array' then
    select coalesce(
      jsonb_agg(
        case
          when elem ->> 'id' = p_chapel_key then
            elem || jsonb_build_object(
              'name', coalesce(p_chapel_data ->> 'title', elem ->> 'name'),
              'subtitle', coalesce(p_chapel_data ->> 'summary', p_chapel_data ->> 'subtitle', elem ->> 'subtitle'),
              'logo', coalesce(p_chapel_data ->> 'image', elem ->> 'logo'),
              'href', coalesce(p_chapel_data ->> 'href', elem ->> 'href')
            )
          else elem
        end
        order by ord
      ),
      '[]'::jsonb
    )
    into v_current
    from jsonb_array_elements(v_data -> 'current') with ordinality as t(elem, ord);

    v_data := jsonb_set(v_data, '{current}', v_current, true);
  end if;

  update public.site_content sc
  set data = v_data
  where sc.key = 'chapels';

  return query
  select sc.key, sc.data, sc.updated_at
  from public.site_content sc
  where sc.key = 'chapels';
end;
$$;

revoke all on function public.cms_update_chapel_content(text, jsonb, timestamptz) from public;
grant execute on function public.cms_update_chapel_content(text, jsonb, timestamptz) to authenticated;

-- ===========================================================================
-- 8. Chapel-safe broadcast RPC
-- ===========================================================================

create or replace function public.cms_update_chapel_broadcast(
  p_chapel_key text,
  p_channel_data jsonb,
  p_expected_updated_at timestamptz
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
  v_data jsonb;
  v_updated_at timestamptz;
begin
  if not (
    public.cms_has_permission('livestream.manage')
    and public.cms_can_access_chapel(p_chapel_key)
  ) then
    raise exception using errcode = '42501', message = 'chapel_scope_denied';
  end if;

  if not public.cms_is_known_chapel(p_chapel_key) then
    raise exception using errcode = '22023', message = 'unknown_chapel_scope';
  end if;

  select sc.data, sc.updated_at
  into v_data, v_updated_at
  from public.site_content sc
  where sc.key = 'livestream'
  for update;

  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'content_version_required';
  end if;

  if v_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'content_conflict';
  end if;

  v_data := jsonb_set(
    v_data,
    array['channels', p_chapel_key],
    p_channel_data,
    true
  );

  update public.site_content sc
  set data = v_data
  where sc.key = 'livestream';

  return query
  select sc.key, sc.data, sc.updated_at
  from public.site_content sc
  where sc.key = 'livestream';
end;
$$;

revoke all on function public.cms_update_chapel_broadcast(text, jsonb, timestamptz) from public;
grant execute on function public.cms_update_chapel_broadcast(text, jsonb, timestamptz) to authenticated;

-- ===========================================================================
-- 9. Chapel-safe Sermon upsert/delete RPCs
-- ===========================================================================

create or replace function public.cms_upsert_chapel_sermon(
  p_chapel_key text,
  p_sermon jsonb,
  p_expected_updated_at timestamptz
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
  v_data jsonb;
  v_updated_at timestamptz;
  v_items jsonb;
  v_new_items jsonb;
  v_sermon jsonb;
  v_sermon_id text;
  v_found boolean;
begin
  if not (
    public.cms_has_permission('sermons.manage')
    and public.cms_can_access_chapel(p_chapel_key)
  ) then
    raise exception using errcode = '42501', message = 'chapel_scope_denied';
  end if;

  if not public.cms_is_known_chapel(p_chapel_key) then
    raise exception using errcode = '22023', message = 'unknown_chapel_scope';
  end if;

  if p_sermon is null or jsonb_typeof(p_sermon) <> 'object' then
    raise exception using errcode = '22023', message = 'sermon_data_required';
  end if;

  v_sermon_id := btrim(coalesce(p_sermon ->> 'id', ''));
  if v_sermon_id = '' then
    raise exception using errcode = '22023', message = 'sermon_id_required';
  end if;

  select sc.data, sc.updated_at
  into v_data, v_updated_at
  from public.site_content sc
  where sc.key = 'sermons'
  for update;

  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'content_version_required';
  end if;

  if v_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'content_conflict';
  end if;

  v_sermon := p_sermon || jsonb_build_object('chapelId', p_chapel_key);
  v_items := coalesce(v_data -> 'items', '[]'::jsonb);

  select
    coalesce(
      jsonb_agg(
        case when elem ->> 'id' = v_sermon_id then v_sermon else elem end
        order by ord
      ),
      '[]'::jsonb
    ),
    coalesce(bool_or(elem ->> 'id' = v_sermon_id), false)
  into v_new_items, v_found
  from jsonb_array_elements(v_items) with ordinality as t(elem, ord);

  if not v_found then
    v_new_items := jsonb_build_array(v_sermon) || v_new_items;
  end if;

  v_data := jsonb_set(v_data, '{items}', v_new_items, true);

  update public.site_content sc
  set data = v_data
  where sc.key = 'sermons';

  return query
  select sc.key, sc.data, sc.updated_at
  from public.site_content sc
  where sc.key = 'sermons';
end;
$$;

revoke all on function public.cms_upsert_chapel_sermon(text, jsonb, timestamptz) from public;
grant execute on function public.cms_upsert_chapel_sermon(text, jsonb, timestamptz) to authenticated;

create or replace function public.cms_delete_chapel_sermon(
  p_chapel_key text,
  p_sermon_id text,
  p_expected_updated_at timestamptz
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
  v_data jsonb;
  v_updated_at timestamptz;
  v_existing jsonb;
  v_new_items jsonb;
begin
  if not (
    public.cms_has_permission('sermons.manage')
    and public.cms_can_access_chapel(p_chapel_key)
  ) then
    raise exception using errcode = '42501', message = 'chapel_scope_denied';
  end if;

  select sc.data, sc.updated_at
  into v_data, v_updated_at
  from public.site_content sc
  where sc.key = 'sermons'
  for update;

  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'content_version_required';
  end if;

  if v_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'content_conflict';
  end if;

  select elem
  into v_existing
  from jsonb_array_elements(coalesce(v_data -> 'items', '[]'::jsonb)) elem
  where elem ->> 'id' = p_sermon_id
  limit 1;

  if v_existing is null then
    raise exception using errcode = '22023', message = 'sermon_not_found';
  end if;

  if v_existing ->> 'chapelId' is distinct from p_chapel_key then
    raise exception using errcode = '42501', message = 'chapel_scope_denied';
  end if;

  select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
  into v_new_items
  from jsonb_array_elements(coalesce(v_data -> 'items', '[]'::jsonb))
       with ordinality as t(elem, ord)
  where elem ->> 'id' <> p_sermon_id;

  v_data := jsonb_set(v_data, '{items}', v_new_items, true);

  update public.site_content sc
  set data = v_data
  where sc.key = 'sermons';

  return query
  select sc.key, sc.data, sc.updated_at
  from public.site_content sc
  where sc.key = 'sermons';
end;
$$;

revoke all on function public.cms_delete_chapel_sermon(text, text, timestamptz) from public;
grant execute on function public.cms_delete_chapel_sermon(text, text, timestamptz) to authenticated;

commit;

-- ===========================================================================
-- Verification
-- ===========================================================================

select
  a.user_id,
  a.role_key,
  s.scope_type,
  s.scope_key
from public.cms_admins a
left join public.cms_admin_scopes s on s.user_id = a.user_id
order by a.user_id, s.scope_type, s.scope_key;

select
  r.role_key,
  array_agg(rp.permission_key order by rp.permission_key) as permissions
from public.cms_roles r
left join public.cms_role_permissions rp on rp.role_key = r.role_key
where r.role_key = 'chapel_content_manager'
group by r.role_key;
