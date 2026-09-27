-- Peculiar Cherubs — Content & Data Integrity Audit
-- READ ONLY. This script does not update, insert, or delete anything.

-- A. Show which live content rows exist.
select key
from public.site_content
order by key;

-- B. Known dummy Giving destinations.
select
  'give_dummy_bank_accounts' as check_name,
  jsonb_array_length(
    coalesce(
      (
        select jsonb_agg(account)
        from jsonb_array_elements(
          coalesce((select data -> 'bankAccounts' from public.site_content where key = 'give'), '[]'::jsonb)
        ) account
        where account ->> 'accountNumber' in (
          '1012345678',
          '0123456789',
          '5070123456',
          '5080123456',
          '5090123456'
        )
      ),
      '[]'::jsonb
    )
  ) as issue_count;

select
  'give_dummy_whatsapp' as check_name,
  case
    when coalesce((select data ->> 'whatsappConfirmPhone' from public.site_content where key = 'give'), '')
         = '2348000000000'
    then 1 else 0
  end as issue_count;

-- C. Placeholder testimonials.
select
  'placeholder_testimonials' as check_name,
  count(*) as issue_count
from jsonb_array_elements(
  coalesce(
    (select data #> '{testimonials,items}' from public.site_content where key = 'home'),
    '[]'::jsonb
  )
) item
where lower(trim(coalesce(item ->> 'name', ''))) = 'member name';

-- D. Placeholder sermon speakers.
select
  'placeholder_sermons' as check_name,
  count(*) as issue_count
from jsonb_array_elements(
  coalesce(
    (select data -> 'items' from public.site_content where key = 'sermons'),
    '[]'::jsonb
  )
) item
where lower(trim(coalesce(item ->> 'speaker', ''))) = 'pastor name';

-- E. Generated event/social placeholders.
select
  'placeholder_event_social_feed' as check_name,
  count(*) as issue_count
from jsonb_array_elements(
  coalesce(
    (select data -> 'socialFeed' from public.site_content where key = 'events'),
    '[]'::jsonb
  )
) item
where coalesce((item ->> 'placeholder')::boolean, false) = true
   or lower(trim(coalesce(item ->> 'platform', ''))) = 'website placeholder';

-- F. Leadership completeness.
select
  'leadership_team_count' as check_name,
  jsonb_array_length(
    coalesce(
      (select data #> '{leadership,team}' from public.site_content where key = 'about'),
      '[]'::jsonb
    )
  ) as issue_count;

-- G. Bible College placeholder routes ("#" does not leave the page).
select
  'bible_college_hash_links' as check_name,
  (
    select count(*)
    from (
      select value ->> 'href' as href
      from jsonb_array_elements(
        coalesce(
          (select data #> '{portal,buttons}' from public.site_content where key = 'bibleCollege'),
          '[]'::jsonb
        )
      )
      union all
      select data #>> '{registration,href}' as href
      from public.site_content
      where key = 'bibleCollege'
    ) links
    where href = '#'
  ) as issue_count;

-- H. Canonical Chapel ownership sanity check.
select
  'chapel_details_count' as check_name,
  (
    select count(*)
    from jsonb_object_keys(
      coalesce(
        (select data -> 'details' from public.site_content where key = 'chapels'),
        '{}'::jsonb
      )
    )
  ) as issue_count;

select
  'chapel_keys_still_in_ministries' as check_name,
  count(*) as issue_count
from jsonb_object_keys(
  coalesce(
    (select data -> 'details' from public.site_content where key = 'ministries'),
    '{}'::jsonb
  )
) key_name
where key_name in (
  'pdcm-gwarinpa',
  'pdcm-english',
  'pdcm-byazhin',
  'pdcm-mega-youth'
);

-- I. Duplicate IDs in important editable arrays.
with ids as (
  select 'sermons' as section_name, item ->> 'id' as id
  from jsonb_array_elements(
    coalesce((select data -> 'items' from public.site_content where key = 'sermons'), '[]'::jsonb)
  ) item

  union all

  select 'events', item ->> 'id'
  from jsonb_array_elements(
    coalesce((select data -> 'specialEvents' from public.site_content where key = 'events'), '[]'::jsonb)
  ) item

  union all

  select 'house_fellowships', item ->> 'id'
  from jsonb_array_elements(
    coalesce(
      (select data #> '{details,house-fellowships,centres}' from public.site_content where key = 'ministries'),
      '[]'::jsonb
    )
  ) item
)
select
  section_name,
  id,
  count(*) as occurrences
from ids
where id is not null and id <> ''
group by section_name, id
having count(*) > 1
order by section_name, id;
