# Cloudflare Stage 3 — Supabase → D1 Import Rehearsal

Adds repeatable migration tooling that exports the current canonical Supabase
`site_content`, transforms page-oriented JSON plus chapel/sermon/livestream
collections into the Stage 2 D1 schema, generates a human-readable import
report, imports into staging, and validates counts and foreign-key integrity.

The rehearsal preserves Stage 2 CMS identities, roles, permissions, scopes and
audit history.

Supabase remains the production source throughout Stage 3.
