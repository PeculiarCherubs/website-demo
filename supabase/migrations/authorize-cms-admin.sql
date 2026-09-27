-- Peculiar Cherubs — Authorize one CMS administrator
--
-- 1. In Supabase Dashboard → Authentication → Users, create or select the user.
-- 2. Copy the user's UUID.
-- 3. Replace YOUR_AUTH_USER_UUID below and run this in SQL Editor.

insert into public.cms_admins (user_id)
values ('YOUR_AUTH_USER_UUID'::uuid)
on conflict (user_id) do nothing;

-- Verify:
select user_id, created_at
from public.cms_admins
order by created_at;
