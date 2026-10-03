# Stage 1 — Cloudflare Foundation

This stage creates the Cloudflare migration foundation **without touching the live Peculiar Cherubs website or retiring Supabase**.

## Safety rule

Do not attach the purchased apex/root domain to the new Worker yet.

The production site and Supabase remain the current live system while the Cloudflare staging environment is built in parallel.

## A. Create a migration branch

From the latest project code:

```bash
git checkout develop
git pull
git checkout -b feature/cloudflare-foundation
```

The `cloudflare/` directory is already integrated in this migration-ready baseline.

Commit only after the local foundation check passes.

## B. Install Wrangler

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler whoami
npm run check
```

Expected:

```text
Cloudflare foundation check: PASS
Admin Worker remains fail-closed until Access/JWT implementation.
```

## C. Create STAGING D1

```bash
npx wrangler d1 create peculiar-cherubs-staging
```

Cloudflare returns a D1 database UUID.

Copy:

```text
wrangler.public.example.jsonc
→ wrangler.public.staging.jsonc

wrangler.admin.example.jsonc
→ wrangler.admin.staging.jsonc
```

Replace:

```text
REPLACE_WITH_STAGING_D1_ID
```

with the staging database UUID in both files.

Do not commit account secrets.

A D1 database ID is configuration, not a database password.

## D. Apply the Stage 1 migration to STAGING

Local first:

```bash
npx wrangler d1 migrations apply peculiar-cherubs-staging \
  --local \
  --config wrangler.public.staging.jsonc
```

Then staging remote:

```bash
npx wrangler d1 migrations apply peculiar-cherubs-staging \
  --remote \
  --config wrangler.public.staging.jsonc
```

The first remote migration is intentionally tiny and creates only `schema_meta`.

## E. Verify staging D1

```bash
npx wrangler d1 execute peculiar-cherubs-staging \
  --remote \
  --config wrangler.public.staging.jsonc \
  --command "SELECT * FROM schema_meta;"
```

Expected:

```text
architecture | cloudflare-foundation-v1
```

## F. Production D1

Do not create or use production D1 yet unless the team specifically wants to reserve its name now.

The recommended sequencing is:

```text
staging first
→ base schema
→ import rehearsal
→ Access/JWT security
→ CMS API
→ public-read migration
→ full regression
→ production D1
→ final sync
→ cutover
```

If reserving the production database now, create it but do not import or route production traffic to it:

```bash
npx wrangler d1 create peculiar-cherubs-prod
```

## G. R2

R2 is not required to begin the D1 migration.

We will create the staging media/content buckets after the base Worker/API is working.

This intentionally reduces the number of moving pieces in the first stage.

## H. GitHub / Workers Builds

Do not enable automatic production deployment from `main` yet.

Once the staging Worker configuration exists, connect the repository to Cloudflare Workers Builds and target the staging branch/environment first.

The Worker name configured in Cloudflare must match the `name` in the Wrangler configuration.

## I. Admin Worker

The Admin Worker in this stage returns `503 admin_not_enabled` for all non-health requests.

That is deliberate.

The next stage will add:

1. an Access application for the staging admin hostname;
2. Cloudflare Access JWT verification inside the Worker;
3. D1 CMS admin tables;
4. role/permission tables;
5. chapel scopes;
6. `/api/me`;
7. fail-closed server authorization.

Only after those checks pass will the Admin CMS be served.

## J. What has NOT changed yet

The following remain untouched:

- public production domain;
- live Supabase content;
- Supabase Auth;
- Supabase RPCs;
- current ContentService;
- current CMS;
- current broadcasts;
- current Sermons/LIVE NOW behavior.

This is deliberate parallel migration.

## Stage 1 completion criteria

Stage 1 is complete when:

- [ ] feature/cloudflare-foundation branch exists;
- [ ] `cloudflare/` folder is in the latest repository;
- [ ] `npm install` succeeds;
- [ ] `npm run check` passes;
- [ ] Wrangler login succeeds;
- [ ] staging D1 exists;
- [ ] local migration applies;
- [ ] remote staging migration applies;
- [ ] `schema_meta` verification succeeds;
- [ ] no production DNS has been changed;
- [ ] Admin Worker remains closed.

After that, move to:

> **Stage 2 — D1 Base Schema + Cloudflare Access Security Foundation**
