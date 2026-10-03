-- Peculiar Cherubs — Giving Payment-Link Privacy Default
--
-- Transitional Supabase migration before Cloudflare cutover.
-- Donor identity (name/email/phone) must not be placed in checkout URLs.
-- If parameter forwarding is later enabled, the public client forwards only:
-- amount, currency and purpose.

begin;

update public.site_content
set data = jsonb_set(
  data,
  '{paymentGateway,appendDonorParams}',
  'false'::jsonb,
  true
)
where key = 'give'
  and jsonb_typeof(data) = 'object';

commit;

select
  data #>> '{paymentGateway,appendDonorParams}' as append_donor_params,
  updated_at,
  updated_by
from public.site_content
where key = 'give';
