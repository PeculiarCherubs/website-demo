-- Peculiar Cherubs — Verify anonymous writes are blocked
-- Run AFTER minimum-cms-write-security.sql.
--
-- Expected result: the UPDATE should fail with a permission/RLS error.
-- The transaction is rolled back either way.

begin;
set local role anon;

update public.site_content
set data = data
where key = 'site';

rollback;
