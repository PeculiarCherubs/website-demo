-- Peculiar Cherubs — Bible College placeholder-link cleanup
-- Run after backing up the live `bibleCollege` row.
--
-- Decision:
-- Keep future actions visible, but remove "#" placeholder navigation.
-- The frontend renders missing destinations as disabled "Coming Soon" actions.

begin;

update public.site_content
set data =
  jsonb_set(
    jsonb_set(
      data,
      '{portal,buttons}',
      coalesce(
        (
          select jsonb_agg(
            case
              when trim(coalesce(button ->> 'href', '')) = '#'
                then jsonb_set(
                  jsonb_set(button, '{href}', '""'::jsonb, true),
                  '{comingSoon}', 'true'::jsonb, true
                )
              else button
            end
          )
          from jsonb_array_elements(
            coalesce(data #> '{portal,buttons}', '[]'::jsonb)
          ) button
        ),
        '[]'::jsonb
      ),
      true
    ),
    '{registration}',
    case
      when trim(coalesce(data #>> '{registration,href}', '')) = '#'
        then jsonb_set(
          jsonb_set(
            coalesce(data -> 'registration', '{}'::jsonb),
            '{href}', '""'::jsonb, true
          ),
          '{comingSoon}', 'true'::jsonb, true
        )
      else coalesce(data -> 'registration', '{}'::jsonb)
    end,
    true
  )
where key = 'bibleCollege';

commit;

-- Verification
select
  data #>> '{registration,href}' as registration_href,
  data #>> '{registration,comingSoon}' as registration_coming_soon,
  jsonb_array_length(coalesce(data #> '{portal,buttons}', '[]'::jsonb)) as portal_button_count,
  (
    select count(*)
    from jsonb_array_elements(coalesce(data #> '{portal,buttons}', '[]'::jsonb)) b
    where trim(coalesce(b ->> 'href', '')) = '#'
  ) as remaining_hash_links
from public.site_content
where key = 'bibleCollege';
