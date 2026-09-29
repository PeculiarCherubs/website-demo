# Peculiar Cherubs — CMS Standardization & Migration Patch

This ZIP is the single authoritative patch for the current website.

## What this package contains

It combines the latest work already completed in this branch:

- CHAPELS separated from MINISTRIES
- refined Publications page
- `publication.html?slug=remembered-by-mercy`
- advanced Sunday School reader
- Leadership section
- Events integration
- Supabase ContentService
- Admin/CMS portal
- full-schema Advanced Content editor
- local `site-content.json` fallback
- CMS standardization/migration tooling

## How to apply this ZIP

Copy the contents of this ZIP into the ROOT of your existing repository,
preserving the folders and replacing files with the same names.

Do not delete repository files that are not included in this ZIP.

The patch intentionally contains every file affected by the current CMS/content architecture.

## Important folders/files

- `content/site-content.json`
  - Current repository content baseline and emergency fallback.
  - Also acts as the migration baseline for fields/content missing from Supabase.

- `js/contentService.js`
  - Loads live content from Supabase.
  - Falls back correctly to `/content/site-content.json` from both root pages and `/admin/`.

- `admin/index.html`
- `admin/admin.css`
- `js/admin.js`
  - CMS/Admin interface.

## New CMS migration workflow

Open:

    /admin/

Login, then open:

    Advanced Content

You now have two migration tools:

### 1. Load Repository Fallback

Loads the selected section from `content/site-content.json` so you can review it
before saving it to Supabase.

### 2. Standardize CMS from Repository

This is the recommended migration action.

It reads every top-level section in `site-content.json`, compares it with what is
currently available from Supabase, and creates a standardized merged version.

Merge rule:

- Existing live Supabase scalar values are preserved.
- Missing repository fields are added.
- Nested objects are merged.
- Arrays of identifiable objects are merged by IDs/slugs/names/etc.
- Repository-only items are retained.
- CMS-only items are retained.
- Missing Supabase rows are created using UPSERT.

This is intentionally safer than blindly replacing Supabase with the JSON file.

## Recommended migration order

You can use the one-click Standardize action, or review sections manually in this order:

1. navigation
2. publications
3. chapels
4. about
5. events
6. home
7. quickLinks
8. give
9. bibleCollege
10. ministries

## Navigation

The website continues to use the repository navigation until the Supabase navigation
contains the new CHAPELS structure. After migration, it can use the live CMS navigation.

## site-content.json after migration

After Supabase is standardized:

- Supabase is the live CMS/source of truth.
- `site-content.json` remains:
  - fallback
  - seed
  - version-controlled backup
  - disaster-recovery baseline

It should no longer be manually maintained as a second live CMS.

## Security warning

The current Admin Portal still uses client-side passcode protection.

Before exposing `/admin/` publicly:
- use Supabase Auth (or another server-backed auth system)
- enable Row Level Security
- prevent anonymous writes to `site_content`

## Local testing

Run the repository through a web server, for example:

    python -m http.server 7000

Then open:

    http://localhost:7000/
    http://localhost:7000/admin/

Do not test by double-clicking HTML files because the website uses `fetch()`.


## Admin button visibility fix

Secondary Admin actions such as **+ Add General Publication**, **+ New Sermon**,
and similar buttons now use an Admin-specific light-background style.

The public website's secondary-button styling remains unchanged.


## Standardized publication entry

Morning Devotion and Goodnews This Week now share one publishing-header structure in the CMS:

- publication type
- publish date
- title
- ID
- slug
- author / publishing team
- tags
- excerpt
- cover theme
- cover monogram / issue number

They then expose type-specific fields.

### Morning Devotion

- key verse reference
- key verse text
- reading time
- devotional series
- reflection heading
- reflection body
- Today's Truth callout
- prayer
- declaration
- action point

### Goodnews This Week

- volume
- issue
- edition / week
- key text
- monthly theme
- occasion / service context
- opening lead
- full message body
- sermon focus
- Sunday School topic/text
- special service details
- next week's ministers
- Bible meditation

New entries are serialized into the same structured `publications.blog.posts` schema already used by the public website.
The old `Goodnews Weekly` option remains only for legacy issue records.


## Publication text alignment

Long-form publication prose is now justified for a more editorial reading style.

Justification applies to:
- Morning Devotion article paragraphs
- Goodnews This Week article paragraphs
- legacy publication detail prose
- long-form Sunday School reading/explanation text

It does not apply to:
- headings
- metadata
- publication cards/excerpts
- buttons
- scripture feature blocks
- callout cards
- short prayer/declaration/action cards

On screens 480px wide or smaller, long-form copy returns to left alignment to avoid excessive spacing between words.
