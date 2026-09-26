-- Peculiar Cherubs
-- Chapels Data-Model Canonicalization
--
-- Run BEFORE deploying the frontend that uses data-page="chapelDetail".
--
-- This copies the CURRENT LIVE chapel detail records from the ministries
-- row into chapels.details, then removes those chapel records from
-- ministries.details. It does not import repository fallback content.

begin;

with ministry_source as (
  select coalesce(data -> 'details', '{}'::jsonb) as details
  from site_content
  where key = 'ministries'
),
chapel_detail_payload as (
  select jsonb_strip_nulls(
    jsonb_build_object(
      'pdcm-gwarinpa',
        case when details ? 'pdcm-gwarinpa'
          then jsonb_set(details -> 'pdcm-gwarinpa', '{id}', '"pdcm-gwarinpa"'::jsonb, true)
        end,
      'pdcm-english',
        case when details ? 'pdcm-english'
          then jsonb_set(details -> 'pdcm-english', '{id}', '"pdcm-english"'::jsonb, true)
        end,
      'pdcm-byazhin',
        case when details ? 'pdcm-byazhin'
          then jsonb_set(details -> 'pdcm-byazhin', '{id}', '"pdcm-byazhin"'::jsonb, true)
        end,
      'pdcm-mega-youth',
        case when details ? 'pdcm-mega-youth'
          then jsonb_set(details -> 'pdcm-mega-youth', '{id}', '"pdcm-mega-youth"'::jsonb, true)
        end
    )
  ) as details
  from ministry_source
)
insert into site_content (key, data)
select
  'chapels',
  jsonb_build_object('details', details)
from chapel_detail_payload
on conflict (key) do update
set data = jsonb_set(
  coalesce(site_content.data, '{}'::jsonb),
  '{details}',
  coalesce(site_content.data -> 'details', '{}'::jsonb)
    || coalesce(excluded.data -> 'details', '{}'::jsonb),
  true
);

update site_content
set data = jsonb_set(
  data,
  '{details}',
  coalesce(data -> 'details', '{}'::jsonb)
    - 'pdcm-gwarinpa'
    - 'pdcm-english'
    - 'pdcm-byazhin'
    - 'pdcm-mega-youth',
  true
)
where key = 'ministries';

commit;

-- Verify canonical ownership.
select
  key,
  jsonb_object_keys(coalesce(data -> 'details', '{}'::jsonb)) as detail_key
from site_content
where key in ('chapels', 'ministries')
order by key, detail_key;
