-- Peculiar Cherubs — Peculiar HQ Canonicalization Audit

select
  (data #> '{details,peculiar-hq}') is not null as has_peculiar_hq_detail,
  (
    select count(*)
    from jsonb_array_elements(data -> 'current') item
    where item ->> 'id'='peculiar-hq'
  ) as peculiar_hq_current_count
from public.site_content
where key='chapels';

select
  (data -> 'channels') ? 'peculiar-hq' as has_peculiar_hq,
  (data -> 'channels') ? 'mother-church' as has_mother_church,
  (data -> 'channels') ? 'general' as has_general,
  (data -> 'channels') ? 'mother' as has_mother,
  data #>> '{channels,peculiar-hq,label}' as hq_label
from public.site_content
where key='livestream';

select count(*) as legacy_explicit_sermon_aliases
from public.site_content sc
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(sc.data -> 'items')='array'
    then sc.data -> 'items' else '[]'::jsonb end
) sermon
where sc.key='sermons'
and coalesce(sermon ->> 'chapelId',sermon ->> 'chapelKey','') in
  ('mother-church','general','mother','motherchurch','mother_church');

select
  sermon ->> 'id' as sermon_id,
  sermon ->> 'title' as title,
  sermon ->> 'speaker' as speaker,
  sermon ->> 'date' as sermon_date
from public.site_content sc
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(sc.data -> 'items')='array'
    then sc.data -> 'items' else '[]'::jsonb end
) sermon
where sc.key='sermons'
and coalesce(sermon ->> 'chapelId',sermon ->> 'chapelKey','')='';
