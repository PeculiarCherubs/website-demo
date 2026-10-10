# Cloudflare Stage 6B — Media Delete Hotfix

## Problem

Media uploads and reads worked, but deleting an asset returned the generic
`internal_error` for both Super Admin and Chapel Content Manager accounts.

The delete path had one important difference from upload/list paths: its media
usage guard fanned four D1 reads out concurrently with `Promise.all()` before
the R2 delete. That made a delete failure collapse into a generic Worker 500
with no indication of whether the problem came from the usage check, R2, or D1.

## Changes

- Runs all four media-reference checks through one D1 `batch()` call.
- Uses exact substring `instr()` checks instead of SQL `LIKE` wildcard matching.
- Keeps the existing `media_asset_in_use` protection.
- Adds explicit safe error codes for:
  - `media_usage_check_failed`
  - `media_r2_delete_failed`
  - `media_metadata_delete_failed`
- Adds Stage 6B delete-path regression checks.
- Strengthens the runtime media test so delete usage reads exercise `DB.batch()`.

No migration is required.
