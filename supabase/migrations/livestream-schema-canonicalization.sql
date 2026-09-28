-- Peculiar Cherubs — Livestream Schema Canonicalization
--
-- Run AFTER:
--   1. multi-chapel-broadcast-foundation.sql
--   2. chapel-scoped-cms-access.sql (if already applied)
--
-- Why:
-- Earlier livestream work stored public.site_content['livestream'].data as
-- an ARRAY of chapel channel objects. The standardized broadcast system uses
-- one canonical OBJECT:
--
-- {
--   "hero": {...},
--   "channels": {
--     "mother-church": {...},
--     "pdcm-english": {...},
--     ...
--   }
-- }
--
-- This migration PRESERVES the legacy channel fields while adding/normalizing
-- the canonical fields required by the current broadcast renderer and CMS.
--
-- It is idempotent:
-- * legacy top-level array       -> canonical object
-- * object with channels array   -> canonical channels object
-- * already-canonical object     -> no destructive rewrite

begin;

do $$
declare
  v_data jsonb;
  v_source_channels jsonb;
  v_channels jsonb;
  v_hero jsonb;
begin
  select sc.data
  into v_data
  from public.site_content sc
  where sc.key = 'livestream'
  for update;

  if v_data is null then
    raise exception using
      errcode = '22023',
      message = 'livestream_section_missing',
      hint = 'Run multi-chapel-broadcast-foundation.sql first.';
  end if;

  -- Already canonical: leave the row untouched.
  if jsonb_typeof(v_data) = 'object'
     and jsonb_typeof(v_data -> 'channels') = 'object' then
    return;
  end if;

  if jsonb_typeof(v_data) = 'array' then
    v_source_channels := v_data;
    v_hero := jsonb_build_object(
      'eyebrow', 'Peculiar Cherubs Live',
      'title', 'One church. Many worshipping communities.',
      'description', 'Join live services, revisit the latest broadcast, and see what is coming next.'
    );
  elsif jsonb_typeof(v_data) = 'object'
        and jsonb_typeof(v_data -> 'channels') = 'array' then
    v_source_channels := v_data -> 'channels';
    v_hero := coalesce(
      v_data -> 'hero',
      jsonb_build_object(
        'eyebrow', 'Peculiar Cherubs Live',
        'title', 'One church. Many worshipping communities.',
        'description', 'Join live services, revisit the latest broadcast, and see what is coming next.'
      )
    );
  else
    raise exception using
      errcode = '22023',
      message = 'unsupported_livestream_schema',
      detail = 'Expected a top-level array, an object with channels array, or an already-canonical channels object.';
  end if;

  select coalesce(
    jsonb_object_agg(x.channel_key, x.channel_data),
    '{}'::jsonb
  )
  into v_channels
  from (
    select
      normalized.channel_key,
      legacy.item
      || jsonb_build_object(
        'id', normalized.channel_key,
        'chapelId', normalized.channel_key,
        'label', coalesce(
          nullif(legacy.item ->> 'name', ''),
          case normalized.channel_key
            when 'mother-church' then 'Mother Church'
            else normalized.channel_key
          end
        ),
        'enabled',
          case
            when jsonb_typeof(legacy.item -> 'enabled') = 'boolean'
              then (legacy.item ->> 'enabled')::boolean
            else true
          end,
        'platform', coalesce(
          nullif(legacy.item ->> 'defaultPlatform', ''),
          nullif(legacy.item ->> 'platform', ''),
          'youtube'
        ),
        'statusOverride',
          case lower(coalesce(
            nullif(legacy.item ->> 'statusOverride', ''),
            nullif(legacy.item ->> 'status', ''),
            'auto'
          ))
            when 'live' then 'live'
            when 'upcoming' then 'upcoming'
            when 'recap' then 'recap'
            when 'hidden' then 'hidden'
            else 'auto'
          end,
        -- Prefer the legacy nested channel URL because an earlier partial
        -- migration may have placed a VIDEO URL in youtubeChannelUrl.
        'youtubeChannelUrl', coalesce(
          nullif(legacy.item #>> '{youtube,channelUrl}', ''),
          case
            when coalesce(legacy.item ->> 'youtubeChannelUrl', '') ~
                 '^https?://(www\.)?youtube\.com/@'
              then legacy.item ->> 'youtubeChannelUrl'
            else null
          end,
          ''
        ),
        'facebookPageUrl', coalesce(
          nullif(legacy.item #>> '{facebook,pageUrl}', ''),
          ''
        ),
        'currentBroadcast', jsonb_build_object(
          'id', coalesce(
            nullif(legacy.item #>> '{currentBroadcast,id}', ''),
            ''
          ),
          'title', coalesce(
            nullif(legacy.item #>> '{currentBroadcast,title}', ''),
            nullif(legacy.item ->> 'title', ''),
            ''
          ),
          'speaker', coalesce(
            nullif(legacy.item #>> '{currentBroadcast,speaker}', ''),
            nullif(legacy.item ->> 'speaker', ''),
            ''
          ),
          'serviceType', coalesce(
            nullif(legacy.item #>> '{currentBroadcast,serviceType}', ''),
            'Sunday Worship'
          ),
          'videoUrl', coalesce(
            nullif(legacy.item #>> '{currentBroadcast,videoUrl}', ''),
            case
              when coalesce(legacy.item #>> '{youtube,enabled}', 'false') = 'true'
               and (
                 coalesce(legacy.item #>> '{youtube,url}', '') ~ 'youtu\.be/[A-Za-z0-9_-]{11}'
                 or coalesce(legacy.item #>> '{youtube,url}', '') ~ 'youtube\.com/watch\?'
                 or coalesce(legacy.item #>> '{youtube,url}', '') ~ 'youtube\.com/live/[A-Za-z0-9_-]{11}'
               )
              then legacy.item #>> '{youtube,url}'
              else null
            end,
            nullif(legacy.item ->> 'replayUrl', ''),
            ''
          ),
          'facebookVideoUrl', coalesce(
            nullif(legacy.item #>> '{currentBroadcast,facebookVideoUrl}', ''),
            nullif(legacy.item #>> '{facebook,videoUrl}', ''),
            ''
          ),
          'startsAt', coalesce(
            nullif(legacy.item #>> '{currentBroadcast,startsAt}', ''),
            ''
          ),
          'endsAt', coalesce(
            nullif(legacy.item #>> '{currentBroadcast,endsAt}', ''),
            ''
          )
        ),
        'schedule',
          case normalized.channel_key
            when 'mother-church' then
              jsonb_build_array(
                jsonb_build_object(
                  'id', 'sunday-worship',
                  'label', 'Sunday Worship',
                  'dayOfWeek', 0,
                  'time', '09:00'
                ),
                jsonb_build_object(
                  'id', 'wednesday-service',
                  'label', 'Wednesday Service',
                  'dayOfWeek', 3,
                  'time', '18:00'
                )
              )
            when 'pdcm-mega-youth' then
              jsonb_build_array(
                jsonb_build_object(
                  'id', 'sunday-worship',
                  'label', 'Sunday Worship',
                  'dayOfWeek', 0,
                  'time', '10:00'
                )
              )
            else
              jsonb_build_array(
                jsonb_build_object(
                  'id', 'sunday-worship',
                  'label', 'Sunday Worship',
                  'dayOfWeek', 0,
                  'time', '08:30'
                )
              )
          end,
        'legacyScheduleText',
          case
            when jsonb_typeof(legacy.item -> 'schedule') = 'string'
              then legacy.item ->> 'schedule'
            else coalesce(legacy.item ->> 'legacyScheduleText', '')
          end,
        'utcOffsetMinutes',
          case
            when coalesce(legacy.item ->> 'utcOffsetMinutes', '') ~ '^-?[0-9]+$'
              then (legacy.item ->> 'utcOffsetMinutes')::integer
            else 60
          end
      ) as channel_data
    from jsonb_array_elements(v_source_channels) as legacy(item)
    cross join lateral (
      select
        case coalesce(
          nullif(legacy.item ->> 'chapelId', ''),
          nullif(legacy.item ->> 'id', '')
        )
          when 'general' then 'mother-church'
          when 'mother' then 'mother-church'
          else coalesce(
            nullif(legacy.item ->> 'chapelId', ''),
            nullif(legacy.item ->> 'id', '')
          )
        end as channel_key
    ) normalized
    where normalized.channel_key is not null
      and btrim(normalized.channel_key) <> ''
  ) x;

  if jsonb_typeof(v_data) = 'object' then
    v_data := jsonb_set(
      jsonb_set(v_data, '{hero}', v_hero, true),
      '{channels}',
      v_channels,
      true
    );
  else
    v_data := jsonb_build_object(
      'hero', v_hero,
      'channels', v_channels
    );
  end if;

  update public.site_content
  set data = v_data
  where key = 'livestream';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Verification
-- Expected:
--   data_type     = object
--   channels_type = object
-- ---------------------------------------------------------------------------

select
  key,
  jsonb_typeof(data) as data_type,
  jsonb_typeof(data -> 'channels') as channels_type,
  updated_at,
  updated_by
from public.site_content
where key = 'livestream';

-- Current normalized channels.
select
  channel.key as chapel_key,
  channel.value ->> 'label' as chapel_label,
  channel.value ->> 'statusOverride' as status_override,
  channel.value -> 'currentBroadcast' ->> 'title' as broadcast_title,
  channel.value -> 'currentBroadcast' ->> 'videoUrl' as video_url,
  channel.value -> 'currentBroadcast' ->> 'startsAt' as starts_at,
  channel.value -> 'currentBroadcast' ->> 'endsAt' as ends_at
from public.site_content sc
cross join lateral jsonb_each(sc.data -> 'channels') as channel
where sc.key = 'livestream'
order by channel.key;
