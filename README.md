# Peculiar Cherubs Website

Static public website + Supabase-backed content management system for Peculiar Cherubs.

## Branch workflow

- `main` — stable production branch. GitHub Pages deploys from `main`.
- `develop` — integration branch for ongoing work.
- feature branches — created from `develop`, then merged back into `develop` with commit history preserved.

Do not develop directly on `main`.

## Content architecture

**Supabase `site_content` is the live source of truth.**

`content/site-content.json` is an emergency/read fallback only. It must never be used as an automatic source for overwriting healthy live CMS data.

Public pages load the sections they need through `js/contentService.js`.

Admin writes require Supabase Auth, an approved `cms_admins` user, and RLS-protected write access. Anonymous visitors retain read-only access.

## Local development

Run through a local HTTP server:

```bash
python -m http.server 7000
```

Public site: `http://localhost:7000/`

Admin: `http://localhost:7000/admin/`

## Important paths

```text
admin/                 CMS interface
assets/                public website media
content/               repository fallback content
docs/                  architecture, stage, migration and validation records
js/contentService.js   public/live content loading
js/admin.js            CMS logic
scripts/               repository validation checks
supabase/audits/       integrity checks
supabase/migrations/   deliberate database migrations
script.js              public rendering + interactions
styles.css             current public stylesheet
```

## Canonical routes

See `docs/routes/ROUTE_INVENTORY.md`.

Compatibility routes intentionally retained:

- `pdcms.html` → `chapels.html`
- `publication-detail.html?issue=...` → legacy Goodnews issue reader

## Future / unavailable actions

Do **not** use `href="#"`.

Use an empty destination and an explicit Coming Soon state until a real destination is approved.

## Sensitive data

Do not commit real banking credentials, private contact exports, database backups, passwords, service-role keys, or other secrets.

The public Supabase anon key is intentionally client-visible; privileged/service-role keys are not.

See `docs/security/GIT_HISTORY_DATA_POLICY.md`.

## Validation

Before merging:

```bash
node scripts/check-content-integrity.js
node scripts/check-navigation-integrity.js
```

The same checks run in GitHub Actions on `develop` and `main`.

## Documentation

Start at `docs/README.md`.
