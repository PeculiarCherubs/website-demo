-- Migration: superadmin-write-access-fix.sql
-- Description: Guarantees Super Admins are never restricted from writing to website content in Supabase.
-- Ensures cms_has_permission and cms_can_write_key explicitly recognize super_admin / superadmin / admin roles
-- and wildcard '*' permissions regardless of role-permission table gaps.

begin;

-- 1. Ensure wildcard permission exists
insert into public.cms_permissions (permission_key, label, description)
values ('*', 'All Permissions', 'Wildcard permission granting full system and content write access.')
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values ('super_admin', '*')
on conflict do nothing;

-- 2. Upgrade cms_has_permission to grant immediate access to super_admin and wildcard permissions
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
    where a.user_id = auth.uid()
      and (
        a.role_key in ('super_admin', 'superadmin', 'admin')
        or exists (
          select 1
          from public.cms_role_permissions rp
          where rp.role_key = a.role_key
            and (rp.permission_key = p_permission or rp.permission_key = '*')
        )
      )
  );
$$;

revoke all on function public.cms_has_permission(text) from public;
grant execute on function public.cms_has_permission(text) to authenticated;

-- 3. Upgrade cms_can_write_key to always permit super admins
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

  -- Super Admin bypass: guaranteed full write access to all sections
  if exists (
    select 1
    from public.cms_admins
    where user_id = auth.uid()
      and role_key in ('super_admin', 'superadmin', 'admin')
  ) then
    return true;
  end if;

  if public.cms_has_permission('advanced.manage') or public.cms_has_permission('*') then
    return true;
  end if;

  -- Shared multi-resource sections can only be replaced wholesale by users with GLOBAL scope
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
    when 'livestream' then 'livestream.manage'
    when 'chapels' then 'ministries.manage'
    when 'sermons' then 'sermons.manage'
    else null
  end;

  return v_permission is not null
     and public.cms_has_permission(v_permission);
end;
$$;

revoke all on function public.cms_can_write_key(text) from public;
grant execute on function public.cms_can_write_key(text) to authenticated;

commit;
