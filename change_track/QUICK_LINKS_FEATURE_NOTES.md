# Quick Links & Church Schedule Feature — Develop Notes

## Overview

Added full administrative management for **Quick Links** ("Your next step starts here") and **Regular Services & Major Events** to the Peculiar Cherubs Content Management Portal. Changes persist live to Supabase DB and render dynamically across both the admin interface and the public website.

---

## What Is Managed

### 1. Useful Links ("Your next step starts here")
- Interactive cards displayed on [quick-links.html](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/quick-links.html) and previewed on [index.html](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/index.html).
- Managed attributes:
  - **ID**: Unique key (e.g., `ql_link_goodnews`).
  - **Icon / Emoji**: Representative symbol (e.g. 📰, ▶, ◉, ↗, ✦, ☏, ⌁, 📖, 💬, 🤝, ⛪, 🕊️).
  - **Title**: Link headline.
  - **Destination URL**: Target page link (`publications.html`, `events.html`, `chapels.html`, `ministries.html`, `give.html`, etc.).
  - **Description**: Supporting overview text.
- Form includes:
  - One-click emoji suggestion chips for rapid selection.
  - Destination URL helper buttons.
  - Live `.quick-link` card preview identical to the public website.

### 2. Regular Services & Major Events ("Regular services and major events")
- Weekly rhythms, prayer clinics, deliverance services, outreaches, and traditional services.
- Managed attributes:
  - **ID**: Unique key (e.g., `ql_event_prayer_clinic`).
  - **Frequency & Timing**: Schedule badge (e.g., `Sunday · 07:00–08:50`, `Wednesday · 18:00–19:30`).
  - **Title**: Service or event name.
  - **Descriptive Note**: Rhythm context (e.g., `Part of the church’s regular weekly rhythm.`).
- Form includes:
  - Schedule preset buttons for common church timings.
  - Live `.card` rhythm preview identical to the public website.

### 3. Page Headers & Section Titles
- Hero banner: Eyebrow, Title, and Description.
- Useful Links section heading: default *"Your next step starts here."*
- Church Calendar section heading: default *"Regular services and major events."*
- One-click `💾 Save Header Settings` with live Supabase DB sync.

---

## Admin Portal Integration

- **Sidebar Navigation**: Added `⚡ Quick Links & Schedule` (`data-tab="quickLinks"`) with a badge tracking total links and schedule items.
- **Dashboard Stats**: Added `⚡ Quick Links & Rhythm` counter to the overview grid.
- **Dashboard Shortcuts**: Added a `Quick Links & Regular Services` management card under Quick Management Actions.
- **Workspace Panel** (`#panelQuickLinks`):
  - Section headers card.
  - Useful Links sub-section with search bar (`#searchQuickLinks`), count, and cards grid (`#gridQuickLinks`).
  - Regular Services sub-section with search bar (`#searchQuickEvents`), count, and cards grid (`#gridQuickEvents`).

---

## Data Delivery & Supabase DB Integration

- **Supabase DB Sync**:
  - Updates write directly to `site_content` table under `key = 'quickLinks'`.
  - Reads and writes use `ContentService` with automated rollback protection and local fallback.
- **Live Rerouting**:
  - `'quickLinks'` registered in `DB_REROUTED_PAGES` inside [js/contentService.js](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/js/contentService.js).
  - [quick-links.html](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/quick-links.html) queries live Supabase data on every page view.
- **Fallback Data**:
  - [content/site-content.json](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/content/site-content.json) maintained with matching IDs and schema for offline operation.
