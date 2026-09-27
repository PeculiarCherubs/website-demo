# Route Inventory

## Canonical public routes

- `index.html` — Home
- `about.html` — About / leadership
- `chapels.html` — Chapel directory
- `pdcm-gwarinpa.html`
- `pdcm-english.html`
- `pdcm-byazhin.html`
- `pdcm-mega-youth.html`
- `ministries.html` — Ministries directory
- `pdcm-mission.html`
- `bible-college.html`
- `pesach-academy.html`
- `children-ministry.html`
- `teenage-ministry.html`
- `house-fellowships.html`
- `feeding-ministry.html`
- `sermons.html`
- `publications.html`
- `publication.html?slug=...` — canonical slug-based publication reader
- `sunday-school.html`
- `events.html`
- `quick-links.html`
- `give.html`
- `admin/`

## Compatibility routes retained

### `pdcms.html`

Historical URL. Redirects to `chapels.html`.

### `publication-detail.html?issue=...`

Legacy Goodnews issue reader. It remains required while the legacy archive and CMS still carry issue-based records.

## Rule

Do not use `href="#"` for future functionality. Use an empty destination and render the action as **Coming Soon**.
