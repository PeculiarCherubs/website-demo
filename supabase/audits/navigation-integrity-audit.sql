-- Peculiar Cherubs — Navigation Integrity Audit
-- READ ONLY.

select
  data = '[{"label":"ABOUT","href":"about.html"},{"label":"CHAPELS","href":"chapels.html","children":[{"label":"All Chapels","href":"chapels.html"},{"label":"PDCM Gwarinpa","href":"pdcm-gwarinpa.html"},{"label":"PDCM English","href":"pdcm-english.html"},{"label":"PDCM Byazhin","href":"pdcm-byazhin.html"},{"label":"PDCM Mega Youth","href":"pdcm-mega-youth.html"}]},{"label":"MINISTRIES","href":"ministries.html","children":[{"label":"All Ministries","href":"ministries.html"},{"label":"PDCM Mission","href":"pdcm-mission.html"},{"label":"Christian Heritage Bible School","href":"bible-college.html"},{"label":"PESACH International Academy","href":"pesach-academy.html"},{"label":"Children Ministry","href":"children-ministry.html"},{"label":"Teenage Ministry","href":"teenage-ministry.html"},{"label":"House Fellowship Centres","href":"house-fellowships.html"},{"label":"Jesus Loves You Feeding Ministry","href":"feeding-ministry.html"}]},{"label":"SERMONS","href":"sermons.html"},{"label":"PUBLICATIONS","href":"publications.html","children":[{"label":"All Publications","href":"publications.html"},{"label":"Daily Morning Devotion","href":"publications.html#daily-devotion"},{"label":"Goodnews This Week","href":"publications.html#goodnews"},{"label":"Sunday School Bible Study","href":"publications.html#sunday-school"},{"label":"Calendar of Lectionary","href":"publications.html#lectionary"}]},{"label":"QUICK LINKS","href":"quick-links.html","children":[{"label":"All Quick Links","href":"quick-links.html"},{"label":"Events Calendar","href":"events.html"}]},{"label":"GIVE","href":"give.html","className":"nav-give"}]'::jsonb as navigation_matches_canonical,
  jsonb_array_length(data) as top_level_navigation_items,
  jsonb_pretty(data) as live_navigation
from public.site_content
where key = 'navigation';

select
  'quick_links_hash_destinations' as check_name,
  count(*) as issue_count
from public.site_content,
lateral jsonb_array_elements(coalesce(data -> 'links', '[]'::jsonb)) item
where key = 'quickLinks'
  and trim(coalesce(item ->> 'href', '')) = '#';

select
  'legacy_goodnews_pdf_hash_destinations' as check_name,
  count(*) as issue_count
from public.site_content,
lateral jsonb_each(coalesce(data -> 'details', '{}'::jsonb)) d(issue_key, issue_value)
where key = 'publications'
  and trim(coalesce(issue_value ->> 'pdfUrl', '')) = '#';

select
  'sunday_school_pdf_hash_destinations' as check_name,
  count(*) as issue_count
from public.site_content,
lateral jsonb_each(
  coalesce(data #> '{sundaySchoolDetails,lessons}', '{}'::jsonb)
) d(lesson_key, lesson_value)
where key = 'publications'
  and trim(coalesce(lesson_value ->> 'pdfUrl', '')) = '#';

select
  'lectionary_hash_destination' as check_name,
  case when trim(coalesce(data #>> '{lectionaryCalendar,href}', '')) = '#'
       then 1 else 0 end as issue_count
from public.site_content
where key = 'publications';
