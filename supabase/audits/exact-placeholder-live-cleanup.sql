-- Peculiar Cherubs — Exact Placeholder Cleanup
--
-- OPTIONAL LIVE CLEANUP.
-- Run only AFTER reviewing content-data-integrity-audit.sql results and
-- exporting the affected live rows.
--
-- This removes only the exact known placeholder/dummy values from the
-- current live rows. It does not add replacement content.

begin;

-- Home: remove testimonials carrying the exact placeholder identity.
update public.site_content
set data = jsonb_set(
  data,
  '{testimonials,items}',
  coalesce(
    (
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(data #> '{testimonials,items}', '[]'::jsonb)) item
      where lower(trim(coalesce(item ->> 'name', ''))) <> 'member name'
    ),
    '[]'::jsonb
  ),
  true
)
where key = 'home';

-- Sermons: remove records with the exact placeholder speaker.
update public.site_content
set data = jsonb_set(
  data,
  '{items}',
  coalesce(
    (
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(data -> 'items', '[]'::jsonb)) item
      where lower(trim(coalesce(item ->> 'speaker', ''))) <> 'pastor name'
    ),
    '[]'::jsonb
  ),
  true
)
where key = 'sermons';

-- Events: remove explicitly generated placeholder social cards.
update public.site_content
set data = jsonb_set(
  data,
  '{socialFeed}',
  coalesce(
    (
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(data -> 'socialFeed', '[]'::jsonb)) item
      where coalesce((item ->> 'placeholder')::boolean, false) = false
        and lower(trim(coalesce(item ->> 'platform', ''))) <> 'website placeholder'
    ),
    '[]'::jsonb
  ),
  true
)
where key = 'events';

-- Giving: remove only known dummy account numbers and dummy WhatsApp number.
update public.site_content
set data = jsonb_set(
  jsonb_set(
    data,
    '{bankAccounts}',
    coalesce(
      (
        select jsonb_agg(item)
        from jsonb_array_elements(coalesce(data -> 'bankAccounts', '[]'::jsonb)) item
        where coalesce(item ->> 'accountNumber', '') not in (
          '1012345678',
          '0123456789',
          '5070123456',
          '5080123456',
          '5090123456'
        )
      ),
      '[]'::jsonb
    ),
    true
  ),
  '{whatsappConfirmPhone}',
  case
    when coalesce(data ->> 'whatsappConfirmPhone', '') = '2348000000000'
      then '""'::jsonb
    else coalesce(data -> 'whatsappConfirmPhone', '""'::jsonb)
  end,
  true
)
where key = 'give';

commit;
