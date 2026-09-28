-- Peculiar Cherubs — Livestream Schema Canonicalization Audit

-- 1. Canonical root shape.
select
  key,
  jsonb_typeof(data) as data_type,
  jsonb_typeof(data -> 'channels') as channels_type,
  updated_at,
  updated_by
from public.site_content
where key = 'livestream';

-- 2. Canonical channel keys.
select
  channel.key as chapel_key,
  channel.value ->> 'label' as label,
  channel.value ->> 'statusOverride' as status_override,
  channel.value ->> 'youtubeChannelUrl' as youtube_channel_url,
  channel.value ->> 'facebookPageUrl' as facebook_page_url
from public.site_content sc
cross join lateral jsonb_each(sc.data -> 'channels') as channel
where sc.key = 'livestream'
order by channel.key;

-- 3. Active/test broadcast preservation.
select
  channel.key as chapel_key,
  channel.value ->> 'statusOverride' as status_override,
  channel.value -> 'currentBroadcast' ->> 'title' as title,
  channel.value -> 'currentBroadcast' ->> 'speaker' as speaker,
  channel.value -> 'currentBroadcast' ->> 'videoUrl' as video_url,
  channel.value -> 'currentBroadcast' ->> 'startsAt' as starts_at,
  channel.value -> 'currentBroadcast' ->> 'endsAt' as ends_at
from public.site_content sc
cross join lateral jsonb_each(sc.data -> 'channels') as channel
where sc.key = 'livestream'
order by channel.key;

-- 4. The legacy "general" key must no longer exist.
select
  (data -> 'channels') ? 'general' as has_legacy_general,
  (data -> 'channels') ? 'mother-church' as has_mother_church
from public.site_content
where key = 'livestream';
