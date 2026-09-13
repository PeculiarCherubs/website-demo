# Latest update merged onto current develop baseline

This package keeps the newer Publications/blog system and layers the latest developer update on top.

## Added from the latest update
- Admin content-management portal (`admin/index.html`, `admin/admin.css`, `js/admin.js`)
- Leadership Team section on `about.html`
- Leadership rendering in `script.js`
- Leadership styling in `styles.css`
- Improved ContentService:
  - request timeout
  - section cache
  - request deduplication
  - lazy/on-demand section loading
- Lazy image observation on the public site

## Preserved from the newer develop/publication work
- `publications.blog`
- `publication.html?slug=remembered-by-mercy`
- `publicationPost` renderer
- publication search/category archive
- advanced Sunday School experience
- legacy Goodnews issue detail pages
- richer Events media/social behavior

## Compatibility additions
- `publicationPost` is mapped to the Supabase `publications` section.
- `events` is enabled as a Supabase-rerouted page.
- Admin Publications now includes `publications.blog.posts`, so newer blog posts are visible/editable.
- Existing blog post template-specific content is preserved when basic metadata is edited.
- The obvious admin login bypass (`any password >= 4 characters`) was removed.

## Important production security warning
The admin portal is still client-side and contains a hard-coded passcode. That is NOT secure authentication.
Before exposing `/admin/` publicly, replace the passcode gate with Supabase Auth (or another real authentication system)
and enforce Row Level Security so anonymous users cannot PATCH `site_content`.

## Files to merge into your repository
- `script.js`
- `styles.css`
- `about.html`
- `js/contentService.js`
- `js/admin.js`
- `admin/index.html`
- `admin/admin.css`
- `content/site-content.json` (only if your repo has not changed this file since our last merge)

Do NOT replace your newer `publications.html` with the uploaded older version.
