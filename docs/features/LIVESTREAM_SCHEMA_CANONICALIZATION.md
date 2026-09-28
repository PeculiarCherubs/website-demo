# Livestream Schema Canonicalization

## Problem

An earlier multi-chapel livestream implementation stored the live Supabase
`livestream` section as a top-level array of channel objects.

The standardized broadcast system expects a root object with a keyed `channels`
object.

Because the Broadcast Foundation migration intentionally used `ON CONFLICT DO
NOTHING`, the existing legacy row was preserved rather than overwritten.

## Resolution

`supabase/migrations/livestream-schema-canonicalization.sql` converts the
legacy array into the canonical object without discarding the existing channel
metadata.

It preserves legacy fields such as:

- theme
- bulletin
- YouTube configuration
- Facebook configuration
- replay URL
- existing currentBroadcast values

It also normalizes:

- `general` → `mother-church`
- status / statusOverride
- YouTube and Facebook page URLs
- current broadcast fields
- regular service schedules
- UTC offset

After the migration, the homepage, Sermons LIVE NOW state, Broadcast Hub,
chapel pages and Broadcast CMS all consume the same Supabase structure.

The migration is idempotent and leaves an already-canonical livestream row
unchanged.
