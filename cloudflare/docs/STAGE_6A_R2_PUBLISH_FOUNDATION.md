# Cloudflare Stage 6A — R2 Public Snapshot + Publish Pipeline Foundation

## Purpose

Stage 6A introduces R2 without cutting production traffic over to it yet.

The architecture becomes:

```text
CMS write
  ↓
D1 authoritative transaction
  ↓
publish_jobs outbox
  ↓
Admin Worker publisher
  ↓
R2 public snapshot
```

D1 remains the transactional source of truth.

R2 is a derived public copy only.

The public staging Worker remains in:

```text
PUBLIC_READ_MODE = d1
```

until the bootstrap and publication pipeline are verified.

## Staging buckets

Create:

```cmd
npx wrangler r2 bucket create peculiar-cherubs-public-staging
npx wrangler r2 bucket create peculiar-cherubs-media-staging
```

The media bucket is reserved in Stage 6A and used by the Admin Worker. Actual
media-library/upload UI is Stage 6B.

## Migration

Apply migration 0007:

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-staging --local --config wrangler.admin.staging.jsonc
npx wrangler d1 migrations apply peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc
```

## Static checks

```cmd
npm run check:stage6a
npm run check:stage5-scopes
npm run check:stage5-role-scopes
npm run check:stage5
```

## Deploy

Deploy Admin Worker first:

```cmd
npx wrangler deploy --config wrangler.admin.staging.jsonc
```

Then Public Worker:

```cmd
npx wrangler deploy --config wrangler.public.staging.jsonc
```

## Bootstrap R2 public snapshots

While signed in as Super Admin, use the protected Admin API:

```text
GET  /api/cms/publish/status
POST /api/cms/publish/bootstrap
POST /api/cms/publish/run
POST /api/cms/publish/retry-failed
```

The bootstrap endpoint enqueues every canonical public section and publishes the
current D1 projection into R2.

R2 keys:

```text
public/manifest.json
public/sections/site.json
public/sections/navigation.json
...
public/sections/livestream.json
```

## Publication behavior

Every successful CMS content write already creates a `publish_jobs` record.

Stage 6A now processes those jobs:

- immediately in the background after the CMS write;
- and every five minutes through the Admin Worker's Cron Trigger as recovery.

The D1 write is authoritative even if the R2 publish later fails.

Failed publishes remain visible and retryable.

Stuck `processing` jobs older than 15 minutes are recovered back to `pending`.

## Public read mode

Initial staging setting:

```text
PUBLIC_READ_MODE = d1
```

This deliberately preserves the already-tested Stage 5 public behavior while
we verify R2.

After bootstrap and status checks pass, Stage 6B/6C can switch staging to:

```text
PUBLIC_READ_MODE = r2-prefer
```

In that mode the Public Worker reads R2 first and falls back to D1 for any
missing/corrupt snapshot.

Production is still untouched in Stage 6A.
