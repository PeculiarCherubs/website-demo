-- Peculiar Cherubs — Repository & Navigation Cleanup
-- Back up live `navigation`, `quickLinks`, and `publications` rows first.

begin;

insert into public.site_content (key, data)
values ('navigation', '[{"label":"ABOUT","href":"about.html"},{"label":"CHAPELS","href":"chapels.html","children":[{"label":"All Chapels","href":"chapels.html"},{"label":"PDCM Gwarinpa","href":"pdcm-gwarinpa.html"},{"label":"PDCM English","href":"pdcm-english.html"},{"label":"PDCM Byazhin","href":"pdcm-byazhin.html"},{"label":"PDCM Mega Youth","href":"pdcm-mega-youth.html"}]},{"label":"MINISTRIES","href":"ministries.html","children":[{"label":"All Ministries","href":"ministries.html"},{"label":"PDCM Mission","href":"pdcm-mission.html"},{"label":"Christian Heritage Bible School","href":"bible-college.html"},{"label":"PESACH International Academy","href":"pesach-academy.html"},{"label":"Children Ministry","href":"children-ministry.html"},{"label":"Teenage Ministry","href":"teenage-ministry.html"},{"label":"House Fellowship Centres","href":"house-fellowships.html"},{"label":"Jesus Loves You Feeding Ministry","href":"feeding-ministry.html"}]},{"label":"SERMONS","href":"sermons.html"},{"label":"PUBLICATIONS","href":"publications.html","children":[{"label":"All Publications","href":"publications.html"},{"label":"Daily Morning Devotion","href":"publications.html#daily-devotion"},{"label":"Goodnews This Week","href":"publications.html#goodnews"},{"label":"Sunday School Bible Study","href":"publications.html#sunday-school"},{"label":"Calendar of Lectionary","href":"publications.html#lectionary"}]},{"label":"QUICK LINKS","href":"quick-links.html","children":[{"label":"All Quick Links","href":"quick-links.html"},{"label":"Events Calendar","href":"events.html"}]},{"label":"GIVE","href":"give.html","className":"nav-give"}]'::jsonb)
on conflict (key)
do update set data = excluded.data;

update public.site_content
set data = jsonb_set(
  data,
  '{links}',
  coalesce(
    (
      select jsonb_agg(
        case
          when trim(coalesce(link ->> 'href', '')) in ('', '#')
            then jsonb_set(
              jsonb_set(link, '{href}', '""'::jsonb, true),
              '{comingSoon}', 'true'::jsonb, true
            )
          else link - 'comingSoon'
        end
        order by ord
      )
      from jsonb_array_elements(coalesce(data -> 'links', '[]'::jsonb))
      with ordinality as t(link, ord)
    ),
    '[]'::jsonb
  ),
  true
)
where key = 'quickLinks';

update public.site_content
set data = jsonb_set(
  data,
  '{details}',
  coalesce(
    (
      select jsonb_object_agg(
        issue_key,
        case
          when trim(coalesce(issue_value ->> 'pdfUrl', '')) in ('', '#')
            then jsonb_set(
              jsonb_set(issue_value, '{pdfUrl}', '""'::jsonb, true),
              '{pdfComingSoon}', 'true'::jsonb, true
            )
          else issue_value - 'pdfComingSoon'
        end
      )
      from jsonb_each(coalesce(data -> 'details', '{}'::jsonb))
      as issue_entry(issue_key, issue_value)
    ),
    '{}'::jsonb
  ),
  true
)
where key = 'publications';

update public.site_content
set data = jsonb_set(
  data,
  '{sundaySchoolDetails,lessons}',
  coalesce(
    (
      select jsonb_object_agg(
        lesson_key,
        case
          when trim(coalesce(lesson_value ->> 'pdfUrl', '')) in ('', '#')
            then jsonb_set(
              jsonb_set(lesson_value, '{pdfUrl}', '""'::jsonb, true),
              '{pdfComingSoon}', 'true'::jsonb, true
            )
          else lesson_value - 'pdfComingSoon'
        end
      )
      from jsonb_each(
        coalesce(data #> '{sundaySchoolDetails,lessons}', '{}'::jsonb)
      ) as lesson_entry(lesson_key, lesson_value)
    ),
    '{}'::jsonb
  ),
  true
)
where key = 'publications';

update public.site_content
set data =
  case
    when trim(coalesce(data #>> '{lectionaryCalendar,href}', '')) in ('', '#')
      then jsonb_set(
        jsonb_set(data, '{lectionaryCalendar,href}', '""'::jsonb, true),
        '{lectionaryCalendar,comingSoon}', 'true'::jsonb, true
      )
    else jsonb_set(data, '{lectionaryCalendar,comingSoon}', 'false'::jsonb, true)
  end
where key = 'publications';

commit;

select
  key,
  case
    when key = 'navigation' then jsonb_array_length(data)
    when key = 'quickLinks' then (
      select count(*)
      from jsonb_array_elements(coalesce(data -> 'links', '[]'::jsonb)) item
      where trim(coalesce(item ->> 'href', '')) = '#'
    )
    when key = 'publications' then (
      select count(*)
      from jsonb_each(coalesce(data -> 'details', '{}'::jsonb)) d(k,v)
      where trim(coalesce(v ->> 'pdfUrl', '')) = '#'
    )
  end as verification_value
from public.site_content
where key in ('navigation', 'quickLinks', 'publications')
order by key;
