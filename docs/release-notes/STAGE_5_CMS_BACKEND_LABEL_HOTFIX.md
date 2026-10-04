# Stage 5 — CMS Backend Label Hotfix

Removes stale Supabase-specific wording from the shared CMS editing interface.

The Stage 5 Cloudflare code path was already persisting edits through the D1
Admin API; labels such as `Save to Supabase DB` were legacy presentation text.

Shared editor controls now use provider-neutral language such as:

- `Save to CMS`
- `Save Section to CMS`
- `live CMS backend`

Runtime success messages use the active backend label, so Cloudflare staging
shows `Cloudflare D1` while the temporary legacy provider can still identify
itself correctly.

Supabase-specific password-recovery/login copy remains only for the legacy
authentication path and is not part of the Cloudflare staging flow.
