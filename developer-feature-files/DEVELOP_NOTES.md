# Ministries & Site Content Feature — Develop Build

## Navigation change

The previous standalone **PDCMs** and **Bible College** top-level tabs are now
represented by one **Ministries** navigation item with a dropdown.

## New pages

- ministries.html
- pdcm-mission.html
- pdcm-gwarinpa.html
- pdcm-english.html
- pdcm-byazhin.html
- pdcm-mega-youth.html
- pesach-academy.html
- children-ministry.html
- teenage-ministry.html
- house-fellowships.html
- feeding-ministry.html

`bible-college.html` remains available and is linked from Ministries.

## Backward compatibility

`pdcms.html` redirects to `ministries.html#pdcm-chapels`.

## Content privacy

No personal telephone numbers are rendered. The House Fellowship page shows
only fellowship name, area, host, and coordinator.

## Content Service & Supabase DB Integration

Unified client-side data fetching is managed by `ContentService` (`js/contentService.js`):

- **Live Database Rerouting:** Dynamically queries the `site_content` table in Supabase DB (`pdcm` project).
- **Rerouted Pages:** `ministries`, `ministryDetail`, `houseFellowships`, `bibleCollege`, `publications`, `publicationDetail`, `sermons`, `about`, `sundaySchoolDetail`.
- **Automatic Fallback:** Seamlessly falls back to `content/site-content.json` if Supabase DB is unreachable or network requests fail.

## Editing Content

Content can be edited live in the Supabase DB (`site_content` table by section key) or in the local fallback repository file:

`content/site-content.json`
