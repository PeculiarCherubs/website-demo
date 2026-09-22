# Chapels / Ministries navigation split

## Public navigation
A new top-level `CHAPELS` tab has been created.

### CHAPELS contains only:
- PDCM Gwarinpa Chapel
- PDCM English Chapel
- PDCM Byazhin Chapel
- PDCM Mega Youth Chapel

The landing page is `chapels.html`.

### MINISTRIES now contains:
- PDCM Mission
- Christian Heritage Bible School
- PESACH International Academy
- Children Ministry
- Teenage Ministry
- House Fellowship Centres
- Jesus Loves You Feeding Ministry

PDCM Mission remains under Ministries because its content identifies it as the church's Mission Arm, not a chapel.

## Compatibility
- `pdcms.html` now redirects to `chapels.html`.
- Homepage `Find a Chapel` points to `chapels.html`.
- Quick Links `Plan a Visit` points to `chapels.html`.
- Existing individual chapel URLs are unchanged.

## Admin portal
The Admin Portal still uses the combined label `Ministries & Chapels` for content management. This change separates the public website navigation only.


## Navigation consistency fix

The Supabase `navigation` section still contains the older menu structure.
Previously, DB-rerouted pages loaded that old navigation, which is why CHAPELS
appeared correctly on Home but disappeared on About, Ministries, Sermons, etc.

`script.js` now always uses the current repository navigation from
`content/site-content.json` while continuing to use Supabase for the rest of
the page content.

Once the Supabase `navigation` row is migrated to the same CHAPELS / MINISTRIES
structure, this explicit local-navigation preference can be removed if desired.
