-- Peculiar Cherubs — Optimistic Concurrency Test
--
-- Run this manually while signed in through the Admin UI rather than directly
-- in SQL Editor if you want to exercise the real JWT/RPC path.
--
-- Expected behaviour:
--
-- 1. Admin loads section version A.
-- 2. Another authorized Admin saves the same section, producing version B.
-- 3. First Admin attempts to save with expected version A.
-- 4. RPC rejects the save with `content_conflict`.
-- 5. Admin reloads the latest live content rather than overwriting version B.
--
-- Database-side inspection:
select key, updated_at, updated_by
from public.site_content
order by key;

select *
from public.cms_recent_content_history(25);
