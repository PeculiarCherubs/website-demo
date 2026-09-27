-- Peculiar Cherubs — Leadership content audit
-- READ ONLY.
--
-- Leadership is a dynamic CMS collection. This query helps identify old
-- placeholder-style records without imposing a fixed office list.

select
  ordinality as display_order,
  person ->> 'id' as id,
  person ->> 'name' as name,
  person ->> 'position' as position,
  person ->> 'image' as image,
  case
    when lower(trim(coalesce(person ->> 'name', ''))) in (
      'senior pastor',
      'pastor (administration)',
      'pastor (youth & discipleship)',
      'deacon (finance)',
      'deaconess (welfare)',
      'evangelist (outreach)',
      'leader name'
    )
    then true
    else false
  end as looks_like_placeholder
from public.site_content,
lateral jsonb_array_elements(
  coalesce(data #> '{leadership,team}', '[]'::jsonb)
) with ordinality as t(person, ordinality)
where key = 'about'
order by ordinality;
