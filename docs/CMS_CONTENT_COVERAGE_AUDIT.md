# CMS ↔ site-content.json Coverage Audit

This compares the current `content/site-content.json` model with the dedicated visual editors in the Admin Portal.

## Before this patch

| Section | Coverage | Gap |
|---|---|---|
| `site` | Partial | Short/full name, tagline and service times were editable; logo and copyright year were not. |
| `navigation` | Missing | No CMS editor existed for the shared navigation tree. |
| `home` | Partial | Only a few hero fields were editable; slides, identity, pastor, testimonials and themes were not. |
| `about` | Partial | Leadership was editable; hero, story and values were not. |
| `chapels` | Missing | The dedicated chapels section had no direct CMS editor. |
| `sermons` | Partial | Sermon items were editable; the sermons hero was not. |
| `publications` | Partial | Several publication items were editable, but hero, full blog blocks/categories, lectionary and display configuration were incomplete. |
| `quickLinks` | Missing | No CMS editor existed. |
| `give` | Missing | No CMS editor existed. |
| `bibleCollege` | Missing | No CMS editor existed. |
| `ministries` | Partial | Ministry details and fellowships were editable; hero, mission, groups and homeFeatured were not. |
| `events` | Partial | One-off events were editable; recurring events, monthly themes, social feed, hero and calendar settings were not. |

## Patch applied

- Added **Advanced Content** so every top-level JSON section is editable in the CMS.
- Added JSON validation and formatting.
- Added **Load Repository Fallback** for migration/recovery.
- Admin now loads `navigation`, `quickLinks`, and `give` too.
- Admin combines local fallback data with live Supabase data so missing rows do not make sections disappear.
- Section saves now use **UPSERT** instead of PATCH, so missing rows can be created.
- Home, Quick Links and Give can now read live Supabase content.
- Navigation switches to Supabase once its live version contains the new `CHAPELS` structure.

## Migration priority

1. `navigation`
2. `publications`
3. `chapels`
4. `about`
5. `events`
6. `home`
7. `quickLinks`
8. `give`
9. `bibleCollege`
10. `ministries`

## Security

The admin portal still uses client-side passcode logic. Before public production use, move authentication to Supabase Auth (or another server-backed system) and enforce Row Level Security against anonymous writes.
