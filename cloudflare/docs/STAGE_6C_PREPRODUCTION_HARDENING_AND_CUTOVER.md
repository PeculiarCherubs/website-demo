# Cloudflare Stage 6C — Pre-Production Hardening & Cutover Readiness

## Scope

Stage 6C is the final pre-production gate. It does not silently deploy production.

It closes two CMS issues discovered during Stage 6B testing and prepares the
production Cloudflare environment, backup/restore process and domain cutover.

## Chapel leadership refinement

Chapel/ministry leaders now support:

- name — required for a meaningful published record
- role / office — required for a meaningful published record
- photo path — optional
- photo alt text — optional
- biography — optional

Existing `{ name, role }` records remain valid.

The CMS uses a repeatable structured leadership editor rather than reconstructing
leaders from `Name: Role` text lines.

R2 Media Library paths can be pasted into the leader Photo Path field:

```text
/media/<uuid>/<filename>
```

If a leader photo is referenced by chapel content, Stage 6B media delete
protection automatically blocks deletion until the reference is removed.

## Chapel Content Manager correction

A chapel-scoped content manager can:

- see only assigned chapel/HQ records in the Ministries & Chapels panel;
- open/edit those assigned chapel details;
- edit its leadership, cover image, overview, functions and facts;
- manage scoped sermons, broadcasts and scoped media.

A chapel-scoped content manager cannot:

- add new chapel/ministry records;
- delete chapel/ministry records;
- edit a chapel outside assigned scope;
- submit a full `chapels` section replacement.

This is enforced in both places:

```text
Admin UI
+ 
Admin Worker authorization
```

The Worker already keeps full-section `chapels` writes behind
`ministries.manage`, while the scoped chapel endpoint accepts
`chapel.content.manage` only for an assigned canonical location.

## Production resources

Create separate production resources; never point production Workers at staging:

```text
D1:
peculiar-cherubs-production

R2:
peculiar-cherubs-public-production
peculiar-cherubs-media-production

Workers:
peculiar-cherubs-public
peculiar-cherubs-admin
```

## Production config preparation

Copy:

```cmd
copy wrangler.public.production.example.jsonc wrangler.public.production.jsonc
copy wrangler.admin.production.example.jsonc wrangler.admin.production.jsonc
```

On PowerShell, `Copy-Item` is also fine. The examples are intentionally safe
templates and contain placeholders.

Replace:

```text
REPLACE_WITH_PUBLIC_DOMAIN
REPLACE_WITH_ADMIN_DOMAIN
REPLACE_WITH_PRODUCTION_D1_ID
REPLACE_WITH_PRODUCTION_ACCESS_AUD
```

Do not commit private production-specific config if your repository policy says
those identifiers should remain local.

Run:

```cmd
npm run check:production-cutover
```

The command must remain `NOT READY` until every placeholder is replaced and no
staging resource appears in either production config.

## Database creation and schema

Create production D1:

```cmd
npx wrangler d1 create peculiar-cherubs-production
```

Put the returned database ID into both production Wrangler configs.

Apply all migrations to the empty production database:

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-production --remote --config wrangler.admin.production.jsonc
```

## Production R2

Create:

```cmd
npx wrangler r2 bucket create peculiar-cherubs-public-production
npx wrangler r2 bucket create peculiar-cherubs-media-production
```

The public snapshot bucket is derived from D1 and can be rebuilt.

The media bucket contains primary uploaded binaries and must be treated as
durable content.

## Staging D1 backup before production data copy

Create a backup directory outside normal deploy artifacts:

```cmd
mkdir backups
```

Export a full emergency snapshot:

```cmd
npx wrangler d1 export peculiar-cherubs-staging --remote --output=backups/staging-full-pre-cutover.sql --config wrangler.admin.staging.jsonc
```

Also export data-only for controlled production import after migrations:

```cmd
npx wrangler d1 export peculiar-cherubs-staging --remote --no-schema --output=backups/staging-data-pre-cutover.sql --config wrangler.admin.staging.jsonc
```

Do not commit these exports if they contain private/admin/audit information.

Import the data-only snapshot into production only after production migrations
have completed:

```cmd
npx wrangler d1 execute peculiar-cherubs-production --remote --file=backups/staging-data-pre-cutover.sql --config wrangler.admin.production.jsonc
```

Review the imported `cms_admins` list before opening production Admin Access.

## Media migration rule

Public R2 snapshots are disposable derived data.

Media R2 is not.

Before cutover, every `/media/...` path referenced by D1 production content must
exist in `peculiar-cherubs-media-production`.

If staging contains test-only assets, do not migrate them unless production
content actually references them.

For a larger media set, use an R2-compatible bulk-copy tool such as rclone or
AWS CLI rather than manually downloading/re-uploading every object.

## Cloudflare Access production Admin

Create/protect the production Admin hostname before content editors use it.

The production Access application must:

- cover the production Admin hostname;
- allow only approved administrator identities;
- support the desired OTP/identity-provider flow;
- use appropriate session durations;
- expose the production Access AUD used by the Admin Worker.

Put that AUD in:

```text
REPLACE_WITH_PRODUCTION_ACCESS_AUD
```

## Bootstrap production R2

After Admin Worker + D1 + R2 are ready, sign in as Super Admin and call:

```text
POST /api/cms/publish/bootstrap
```

Then:

```text
GET /api/cms/publish/status
```

Expected:

- all 13 canonical sections present;
- no failed jobs;
- no pending jobs after processing;
- `manifest_present: true`.

## Custom domains

The production templates use Cloudflare Worker Custom Domains because the
Workers are the origin.

Recommended shape:

```text
Public:
your-domain.example

Admin:
admin.your-domain.example
```

Cloudflare creates the necessary DNS record/certificate when a Custom Domain is
attached.

Record the current DNS state before cutover.

## Production verification

After the public domain is attached:

```cmd
npm run verify:production-public -- https://YOUR_PUBLIC_DOMAIN
```

Required:

- environment = production
- read mode = r2-prefer
- source = r2
- all 13 canonical sections load

Then manually smoke-test:

- Home
- About
- Ministries
- Peculiar HQ
- every chapel page
- Sermons
- livestream state
- Events
- Publications
- Giving
- Media URLs

## Rollback

Do not delete the pre-Cloudflare production origin during initial cutover.

If a blocking defect appears:

1. stop CMS editing;
2. preserve/export current production D1;
3. detach the public Custom Domain from the new Worker;
4. restore the pre-cutover DNS/origin recorded before migration;
5. investigate on staging;
6. redeploy only after the failing acceptance test passes.

For data rollback, use the pre-cutover D1 export rather than attempting ad-hoc
manual SQL reversals.

## Supabase retirement

Supabase should not be deleted on cutover day.

Recommended retirement sequence:

1. production Cloudflare runs successfully;
2. freeze Supabase writes;
3. retain final export/backup;
4. monitor Cloudflare production through an agreed observation window;
5. verify no runtime/admin path still calls Supabase;
6. remove obsolete Supabase credentials/configuration;
7. retire the project only after rollback dependence has ended.

## Stage 6C completion criteria

- structured chapel leader editor works;
- leader image + optional bio render publicly;
- referenced leader images cannot be deleted;
- Chapel Content Manager can edit assigned chapel details;
- Chapel Content Manager cannot add/delete chapel/ministry records;
- Stage 6C static checks pass;
- production configs are prepared with no staging resource leakage;
- backup/export is captured before production import;
- production D1/R2 resources are separate;
- production Access application is configured;
- production R2 bootstrap succeeds;
- custom domains are attached only after verification;
- production public verification passes;
- rollback path is documented and retained;
- Supabase remains available until the post-cutover observation window ends.
