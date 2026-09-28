-- Peculiar Cherubs — Sermons / Live Navigation Cleanup
--
-- The permanent LIVE navigation item from the earlier livestream implementation
-- is no longer part of the canonical navigation.
--
-- SERMONS is the permanent navigation slot. Public rendering changes it to
-- pulsing LIVE NOW only while at least one chapel is actively broadcasting.
--
-- This migration removes legacy top-level navigation records that point to
-- live.html or use the old nav-live class. It leaves SERMONS untouched.

begin;

update public.site_content
set data = (
  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  from jsonb_array_elements(data) with ordinality as nav(item, ord)
  where coalesce(item ->> 'href', '') <> 'live.html'
    and coalesce(item ->> 'className', '') <> 'nav-live'
)
where key = 'navigation'
  and jsonb_typeof(data) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(data) item
    where coalesce(item ->> 'href', '') = 'live.html'
       or coalesce(item ->> 'className', '') = 'nav-live'
  );

commit;

-- Verification:
-- Expected: SERMONS exists, permanent live.html/nav-live entry does not.
select
  item ->> 'label' as label,
  item ->> 'href' as href,
  item ->> 'className' as class_name
from public.site_content sc
cross join lateral jsonb_array_elements(sc.data) item
where sc.key = 'navigation'
order by label;
