# Cloudflare Stage 6A — R2 Publish Foundation

Adds the first R2-backed publication layer while keeping D1 authoritative.

- Adds staging R2 bindings for public snapshots and media.
- Adds migration 0007 with publication state and retry metadata.
- Processes the existing D1 `publish_jobs` outbox into R2.
- Publishes one canonical JSON snapshot per public section plus a manifest.
- Adds protected Super Admin status/bootstrap/run/retry endpoints.
- Adds background publication after CMS writes.
- Adds five-minute scheduled recovery publication.
- Adds R2-first public read support with D1 fallback.
- Keeps staging `PUBLIC_READ_MODE=d1` until R2 verification is complete.
- Leaves production untouched.
