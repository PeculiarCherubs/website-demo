# Resolved merge — newer site + old-base Supabase feature

## Merge rule used
The current/newer branch is the base. The other developer's branch is treated as a feature patch because it was created from an older snapshot.

## Resolved files in the root of this package
- `script.js` — keeps the newer publication blog/article router and Sunday School/events logic, while adding ContentService/Supabase loading.
- `styles.css` — keeps the newer CSS and all publication-blog styles; also retains the developer's standards-based `line-clamp`.
- `publications.html` — keeps the newer publication blog/search/archive page, not the older card-only page.
- `publication.html` — keeps the slug-based article reader (`publication.html?slug=remembered-by-mercy`) and now loads ContentService before `script.js`.
- `publication-detail.html` — keeps legacy issue support and now loads ContentService.
- `sunday-school.html` — keeps the advanced Sunday School reader and now loads ContentService.
- `events.html` — keeps the developer's ContentService integration and restores `id="media-and-social"`.
- `content/site-content.json` — uses the already-merged newer content, including `publications.blog`, legacy Goodnews issues, advanced Sunday School details, events and ministry social data.

## Important: missing file
The developer's update references:

`js/contentService.js`

but that file was not included in the supplied update.

The merged `script.js` safely falls back to `content/site-content.json` when `ContentService` is unavailable, so the site remains usable. However, live Supabase updates will not work until the real `js/contentService.js` file from the developer's branch is added.

## Why the loader now merges live data over local data
The Supabase/database content may have been populated from the developer's older branch. To avoid losing newer structures such as:

- `publications.blog`
- `publicationPost`
- `remembered-by-mercy`
- newer Sunday School/publication additions

the local JSON is used as the schema baseline and live ContentService data overrides matching fields only.

Arrays supplied by live content replace the matching local arrays; object keys that do not exist in the older live payload are retained from local content.

## Files under `developer-feature-files/`
These are preserved copies of the other developer's feature pages/notes. They are not blindly substituted for newer versions because doing that would reintroduce old code. Use them for pages that were genuinely added by the developer or for Git conflict comparison.

## Critical routes retained
- Morning Devotion: `publication.html?slug=remembered-by-mercy`
- Legacy Goodnews: `publication-detail.html?issue=issue-01`
- Advanced Sunday School: `sunday-school.html`
- Events media anchor: `events.html#media-and-social`


## ContentService completed

The supplied `js/contentService.js` has now been added to the package.

Two compatibility fixes were applied:

1. `publicationPost` now maps to the `publications` section in Supabase, so routes such as
   `publication.html?slug=remembered-by-mercy` can use live publication data.
2. `events` is now included in `DB_REROUTED_PAGES`, matching the developer's feature notes
   that describe Events as Supabase-backed.

The local JSON remains the schema baseline in `script.js`; live Supabase sections override
matching values without deleting newer local-only structures.
