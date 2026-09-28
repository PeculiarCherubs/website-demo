-- Peculiar Cherubs — Sermons / Live Navigation Cleanup Audit

-- 1. Permanent SERMONS nav slot should exist.
select
  item ->> 'label' as label,
  item ->> 'href' as href
from public.site_content sc
cross join lateral jsonb_array_elements(sc.data) item
where sc.key = 'navigation'
  and item ->> 'href' = 'sermons.html';

-- 2. Legacy permanent LIVE nav entries should return no rows.
select
  item ->> 'label' as label,
  item ->> 'href' as href,
  item ->> 'className' as class_name
from public.site_content sc
cross join lateral jsonb_array_elements(sc.data) item
where sc.key = 'navigation'
  and (
    item ->> 'href' = 'live.html'
    or item ->> 'className' = 'nav-live'
  );

-- 3. Confirm canonical livestream structure remains intact.
select
  jsonb_typeof(data) as data_type,
  jsonb_typeof(data -> 'channels') as channels_type
from public.site_content
where key = 'livestream';
