-- Peculiar Cherubs — Homepage Conditional Live Mode
--
-- Removes the earlier always-visible Live button config and introduces a
-- manual, CMS-managed live-stream state.
--
-- Default is OFF. The public hero only embeds YouTube when:
--   1. enabled = true
--   2. videoUrl contains a valid specific YouTube video/live URL
--
-- This preserves every other homepage field.

begin;

update public.site_content
set data =
  jsonb_set(
    data #- '{hero,liveButton}',
    '{hero,liveStream}',
    '{
      "enabled": false,
      "videoUrl": "",
      "title": "Worship with us live",
      "channelUrl": "https://youtube.com/@peculiarcherubschurch"
    }'::jsonb,
    true
  )
where key = 'home';

commit;

select
  data #> '{hero,liveStream}' as live_stream
from public.site_content
where key = 'home';
