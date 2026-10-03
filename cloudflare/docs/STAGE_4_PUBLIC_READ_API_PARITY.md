# Stage 4 — Cloudflare Public Read API + Content Contract Parity

## Objective

Stage 4 makes the Cloudflare staging website **actually read its public content
from D1** while production continues reading from Supabase.

This is the first end-to-end website parity stage.

```text
STAGING ONLY

Browser
  ↓
ContentService
  ↓
PublicDataClient
  ↓
/api/public/sections
  ↓
Public Worker
  ↓
D1
```

Production remains:

```text
Browser
  ↓
Supabase legacy public read
```

until parity is approved.

---

# 1. What the public API returns

The public contract intentionally remains compatible with the existing website:

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

The frontend therefore does not need a page-by-page rewrite.

For relational D1 resources, the Worker reconstructs the current public shape:

```text
chapels_meta + chapels table
→ chapels

sermons_meta + sermons table
→ sermons

livestream_meta + broadcasts + chapels
→ livestream
```

---

# 2. Why `public_json` exists

Some legacy public sermon/broadcast objects contain optional fields that are not
yet first-class relational columns.

Stage 4 adds:

```text
sermons.public_json
broadcasts.public_json
```

D1 relational columns remain authoritative for core fields, while `public_json`
preserves unmapped presentation fields during the migration.

This avoids losing content during the Supabase → D1 transition.

---

# 3. Public asset hardening

The public Worker serves the repository's static website assets.

A root:

```text
.assetsignore
```

now prevents internal material from being uploaded as public static assets:

```text
admin/
cloudflare/
supabase/
scripts/
docs/
*.md
```

The public Worker also returns 404 for `/admin` paths.

The Cloudflare Admin Worker remains the only place where the CMS belongs.

---

# 4. Deployment-scoped provider selection

The repository copy of:

```text
js/data/runtimeConfig.js
```

still selects:

```text
supabase-legacy
```

for the current production workflow.

On the **Cloudflare public staging Worker only**, the Worker intercepts:

```text
/js/data/runtimeConfig.js
```

and returns:

```text
publicProvider = cloudflare
```

This means the same static HTML/JS can be tested against D1 without changing the
production provider.

There is no browser/localStorage backend switch.

---

# 5. Apply Stage 4 locally

From `cloudflare/`:

```cmd
npm run check:stage4
```

Expected:

```text
Cloudflare Stage 4 check: PASS
Public API, D1 contract projection, staging provider injection and asset hardening are present.
```

---

# 6. Apply migration 0005 locally

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-staging --local --config wrangler.public.staging.jsonc
```

This adds the preserved public payload columns.

---

# 7. Apply migration 0005 to REMOTE STAGING

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-staging --remote --config wrangler.public.staging.jsonc
```

This remains staging only.

---

# 8. Regenerate the D1 import SQL

Stage 4 changed the transformer so sermons and broadcasts preserve their public
payloads and `chapels_meta` is canonicalized to Peculiar HQ.

Your existing Supabase export and sermon override remain usable.

Run:

```cmd
npm run migration:transform
npm run migration:validate-sql
```

If the transformer pauses for a sermon mapping, make sure:

```text
migration-data/sermon-chapel-overrides.json
```

still exists locally.

---

# 9. Re-import LOCAL D1

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --local --config wrangler.public.staging.jsonc --file migration-data/d1-import.generated.sql
```

Then:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --local --config wrangler.public.staging.jsonc --file migration-data/d1-validation.generated.sql
```

Counts must match and broken-reference counts must remain zero.

---

# 10. Re-import REMOTE STAGING D1

Only after local passes:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.public.staging.jsonc --file migration-data/d1-import.generated.sql
```

Then:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.public.staging.jsonc --file migration-data/d1-validation.generated.sql
```

---

# 11. Deploy the Public Staging Worker

```cmd
npx wrangler deploy --config wrangler.public.staging.jsonc
```

The expected Worker name is:

```text
peculiar-cherubs-public-staging
```

Do **not** protect this Worker with Cloudflare Access.

It is the public website staging surface.

Do not attach the purchased production/root domain yet.

---

# 12. Health check

Open:

```text
https://<public-staging-worker>.workers.dev/__health
```

Expected:

```json
{
  "ok": true,
  "stage": "cloudflare-stage-4",
  "provider": "cloudflare",
  "database_ready": true
}
```

---

# 13. Verify the public API

Open:

```text
https://<public-staging-worker>.workers.dev/api/public/manifest
```

Then test:

```text
https://<public-staging-worker>.workers.dev/api/public/sections?keys=site,navigation,chapels,sermons,livestream
```

The API is read-only and accepts only the public section allowlist.

---

# 14. Run the automated remote verifier

```cmd
npm run stage4:verify -- https://<public-staging-worker>.workers.dev
```

Expected:

```text
Stage 4 public API verification: PASS
Cloudflare staging is serving the required public content contract from D1.
```

The verifier also checks that:

- Peculiar HQ exists;
- legacy Mother Church keys are not exposed;
- sermons have explicit worship-location IDs;
- the generated runtime config selects Cloudflare;
- `/admin/` is not exposed by the public Worker.

---

# 15. Browse the staging website

Open the public staging Worker root and manually test:

```text
/
chapels.html
peculiar-hq.html
pdcm-gwarinpa.html
pdcm-english.html
pdcm-byazhin.html
pdcm-mega-youth.html
sermons.html
live.html
give.html
publications.html
events.html
about.html
```

The site should look and behave like the existing website, but content requests
on this staging host now come from D1.

---

# 16. Important Stage 4 rule

Do **not** change the repository runtime provider to Cloudflare yet.

Keep production's static:

```text
publicProvider: 'supabase-legacy'
```

The Public Staging Worker injects the Cloudflare provider only for its own
deployment.

---

# Stage 4 completion criteria

- [ ] `npm run check:stage4` passes.
- [ ] migration 0005 applies locally.
- [ ] migration 0005 applies to remote staging.
- [ ] Stage 3 transform regenerates successfully.
- [ ] local D1 import and validation pass.
- [ ] remote D1 import and validation pass.
- [ ] Public Staging Worker deploys.
- [ ] `/__health` reports Stage 4 and Cloudflare provider.
- [ ] `/api/public/manifest` is correct.
- [ ] automated remote verifier passes.
- [ ] Peculiar HQ page loads from D1.
- [ ] all chapel pages load from D1.
- [ ] Sermons/LIVE NOW behavior works.
- [ ] Giving/publications/events/about pages render correctly.
- [ ] public Worker does not expose `/admin/`.
- [ ] production remains on Supabase.

After this:

> **Stage 5 — Cloudflare CMS Read/Write APIs + D1 Audit/Concurrency**
