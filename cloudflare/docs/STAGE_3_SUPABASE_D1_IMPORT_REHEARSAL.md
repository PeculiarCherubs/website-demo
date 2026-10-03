# Stage 3 — Supabase → D1 Import Rehearsal

## Objective

Stage 3 copies the **current canonical website content** from Supabase into the
Cloudflare **staging D1 database** and validates the transformation.

This is a rehearsal.

Production continues using Supabase throughout Stage 3.

No public website provider is switched to Cloudflare yet.

---

## What is migrated in Stage 3

From Supabase `site_content`:

```text
site
navigation
home
about
ministries
publications
events
bibleCollege
quickLinks
give
chapels
sermons
livestream
```

Target D1 representation:

```text
site_sections
chapels
sermons
broadcasts
```

The source `chapels`, `sermons`, and `livestream` JSON is split deliberately:

```text
chapels.hero/current/upcoming
→ site_sections['chapels_meta']

chapels.details
→ chapels

sermons.hero
→ site_sections['sermons_meta']

sermons.items
→ sermons

livestream.hero
→ site_sections['livestream_meta']

livestream.channels
→ broadcasts
```

This avoids making one giant JSON document the long-term source of truth for
growing/scoped collections.

---

## What is NOT migrated from Supabase automatically

Supabase Auth users are **not** copied into `cms_admins`.

Reason:

```text
Supabase user UUID
≠
Cloudflare Access identity
```

Cloudflare Access identity mapping must happen deliberately as each CMS user is
onboarded.

The Stage 2 Super Admin record remains untouched.

The rehearsal also does not delete or replace:

```text
cms_admins
cms_roles
cms_permissions
cms_role_permissions
cms_admin_scopes
content_history
publish_jobs
```

---

# Step 1 — Run the Stage 3 source check

From the `cloudflare` directory:

```cmd
npm run check:stage3
```

Expected:

```text
Cloudflare Stage 3 check: PASS
Import rehearsal tooling preserves Stage 2 CMS security state.
```

---

# Step 2 — Export current Supabase `site_content`

Run:

```cmd
npm run migration:export
```

The script uses the temporary `supabase-legacy` public configuration already in
the migration-ready website.

It writes:

```text
migration-data/supabase-site-content.json
```

The file is ignored by Git.

Expected terminal output includes:

```text
Export complete
Rows: ...
```

Do not manually edit this export.

It is our migration snapshot.

---

# Step 3 — Transform the export

Run:

```cmd
npm run migration:transform
```

This creates:

```text
migration-data/d1-import.generated.sql
migration-data/d1-import-report.json
```

Read the report before importing.

Important migration decisions are surfaced under:

```text
migration_decisions
warnings
errors
```

The transformer stops if it finds broken chapel references or duplicate IDs.

---

# Peculiar HQ canonical resource

The stabilized source currently treats Peculiar HQ as a broadcast location,
but older chapel data may not contain a dedicated:

```text
chapels.details['peculiar-hq']
```

If that condition exists in the live export, the transformer creates a
**migration-system Peculiar HQ resource** so that:

```text
broadcasts.chapel_id
```

continues to have a valid foreign key.

The report explicitly records this as:

```text
synthetic_mother_church: true
```

This is not silently hidden.

---

# Legacy sermons without chapel tags

If an old sermon has no chapel identifier, the transformer temporarily assigns:

```text
peculiar-hq
```

and records the number under:

```text
legacy_sermons_defaulted_to_mother_church
```

Review those sermons before production cutover.

The import rehearsal does not pretend the source contained information that it
did not contain.

---

# Step 4 — Rehearse against LOCAL D1 first

The generated SQL deliberately clears only the content tables:

```text
broadcasts
sermons
chapels
site_sections
```

It preserves Stage 2 security/admin data.

Run:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --local --config wrangler.admin.staging.jsonc --file migration-data/d1-import.generated.sql
```

Cloudflare/Wrangler supports importing SQL files through `d1 execute --file`.

---

# Step 5 — Generate validation queries

Run:

```cmd
npm run migration:validate-sql
```

This creates:

```text
migration-data/d1-validation.generated.sql
```

Run it locally:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --local --config wrangler.admin.staging.jsonc --file migration-data/d1-validation.generated.sql
```

Confirm:

```text
actual_count = expected_count
```

for:

```text
site_sections
chapels
sermons
broadcasts
```

These should also be zero:

```text
broken_sermon_chapel_refs
broken_broadcast_chapel_refs
broken_published_sermon_refs
```

---

# Step 6 — Import into REMOTE STAGING D1

Only after local validation succeeds:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --file migration-data/d1-import.generated.sql
```

This remains staging only.

Then run:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --file migration-data/d1-validation.generated.sql
```

---

# Step 7 — Inspect key resources manually

## Chapels

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --command "SELECT id,title,slug,published FROM chapels ORDER BY id;"
```

Verify the canonical IDs.

Expected broadcast/scoping resource IDs include:

```text
peculiar-hq
pdcm-gwarinpa
pdcm-english
pdcm-byazhin
pdcm-mega-youth
```

subject to what actually exists in the live source.

## Broadcasts

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --command "SELECT chapel_id,status_override,title,video_url,starts_at,ends_at FROM broadcasts ORDER BY chapel_id;"
```

Verify the currently configured broadcast information against Supabase/CMS.

## Sermons

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --command "SELECT chapel_id,COUNT(*) AS sermon_count FROM sermons GROUP BY chapel_id ORDER BY chapel_id;"
```

---

# Step 8 — Confirm Stage 2 security survived

Run:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --command "SELECT role_key,label FROM cms_roles ORDER BY sort_order;"
```

Then:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --command "SELECT email,role_key,enabled FROM cms_admins ORDER BY email;"
```

Your Stage 2 Super Admin should still exist.

If it does not, stop. Do not continue to Stage 4.

---

# Step 9 — Do not change the public provider yet

Keep:

```text
publicProvider: 'supabase-legacy'
```

Stage 3 proves data migration only.

The public site must not switch to Cloudflare until the Cloudflare read API can
reconstruct the same content contract expected by `ContentService`.

That is Stage 4.

---

# Stage 3 completion criteria

- [ ] `npm run check:stage3` passes.
- [ ] Supabase export succeeds.
- [ ] export contains current live `site_content`.
- [ ] transformation succeeds.
- [ ] transformation report reviewed.
- [ ] no unresolved transformation errors.
- [ ] local D1 import succeeds.
- [ ] local expected/actual counts match.
- [ ] local foreign-key validation counts are zero.
- [ ] remote staging D1 import succeeds.
- [ ] remote expected/actual counts match.
- [ ] remote foreign-key validation counts are zero.
- [ ] chapel IDs manually reviewed.
- [ ] broadcast data manually reviewed.
- [ ] sermon distribution manually reviewed.
- [ ] Stage 2 Super Admin still exists.
- [ ] production website still uses Supabase.

After that:

> **Stage 4 — Cloudflare Public Read API + Content Contract Parity**


---

# Explicit review for untagged sermons

An untagged legacy sermon is **not** automatically assigned to Peculiar HQ.

If the transformer finds one, it pauses and writes the sermon details to:

```text
migration-data/d1-import-report.json
```

Create:

```text
migration-data/sermon-chapel-overrides.json
```

using the sermon ID reported by the transformer. Example:

```json
{
  "sermon-id": "peculiar-hq"
}
```

or map it to the correct PDCM chapel. Then rerun:

```cmd
npm run migration:transform
```
