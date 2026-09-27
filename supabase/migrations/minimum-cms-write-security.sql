-- Peculiar Cherubs — Minimum CMS Write Security
--
-- Purpose:
--   * keep public website reads available
--   * remove anonymous/public CMS writes
--   * allow writes only for authenticated users explicitly listed in cms_admins
--
-- IMPORTANT:
-- Create the intended Supabase Auth user first (Dashboard → Authentication → Users).
-- After this migration, authorize that user's UUID with the separate
-- authorize-cms-admin.sql command/template.

begin;

-- ---------------------------------------------------------------------------
-- 1. Explicit CMS administrator allowlist
-- ---------------------------------------------------------------------------
create table if not exists public.cms_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.cms_admins enable row level security;

-- This table is intentionally not client-readable or client-writable.
revoke all privileges on table public.cms_admins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Security-definer authorization function
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Narrow table privileges
-- ---------------------------------------------------------------------------
alter table public.site_content enable row level security;

-- Remove the broad default grants currently present on both client roles.
revoke all privileges on table public.site_content from anon, authenticated;

-- Public website: read only.
grant select on table public.site_content to anon, authenticated;

-- Authenticated users may attempt writes; RLS below limits actual writes to
-- users explicitly present in public.cms_admins.
grant insert, update, delete on table public.site_content to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Replace permissive RLS policies
-- ---------------------------------------------------------------------------
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

create policy "CMS admins can insert site content"
on public.site_content
for insert
to authenticated
with check (public.is_cms_admin());

create policy "CMS admins can update site content"
on public.site_content
for update
to authenticated
using (public.is_cms_admin())
with check (public.is_cms_admin());

create policy "CMS admins can delete site content"
on public.site_content
for delete
to authenticated
using (public.is_cms_admin());

commit;

-- ---------------------------------------------------------------------------
-- Verification: policies
-- ---------------------------------------------------------------------------
select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'site_content'
order by policyname;

-- Verification: client table grants
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'site_content'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
