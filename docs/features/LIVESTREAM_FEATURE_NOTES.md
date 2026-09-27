# Dedicated Livestream & Multi-Chapel Broadcast Hub — Develop Notes

## Overview

Added full administrative management and dedicated public delivery for **Livestreams & Multi-Chapel Broadcasts** to the Peculiar Cherubs website and CMS Portal. The feature allows members and visitors to watch live broadcasts from YouTube and Facebook Live across Mother Church and all branch chapels directly within [live.html](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/live.html).

---

## What Is Managed

### 1. Dedicated Multi-Chapel Broadcast Hub (`live.html`)
- **Chapel Channel Switcher**: Interactive pills allowing visitors to select their chapel stream:
  - Mother Church / General (`general`)
  - PDCM English Chapel (`pdcm-english`)
  - PDCM Gwarinpa Chapel (`pdcm-gwarinpa`)
  - PDCM Mega Youth Chapel (`pdcm-mega-youth`)
  - PDCM Byazhin Chapel (`pdcm-byazhin`)
- **Deep-Linking Support**: Visiting `live.html?chapel=pdcm-english` automatically activates and plays that chapel's broadcast.
- **Dual-Platform Player**:
  - `▶ YouTube Live`: Embedded responsive 16:9 iframe player (with smart video ID and URL parsing).
  - `📘 Facebook Live`: Embedded responsive Facebook video player with live stream support.
  - Tab toggle allows switching between YouTube and Facebook without leaving the website.
- **Live Broadcast Status States**:
  - `🔴 LIVE NOW`: Red pulsing badge, current service/sermon title, speaker, and live embedded player.
  - `⏰ UPCOMING`: Service timing, schedule information, and countdown guidance.
  - `⏹ OFFLINE`: Sleek offline banner with regular service schedule and direct links to YouTube and Facebook pages.
- **Contextual Action Links**:
  - **Give Online**: Directly opens [give.html](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/give.html) filtered to that chapel's bank accounts (`give.html?chapel=...`).
  - **Prayer Request**: Quick access to prayer and ministry contacts.
  - **Open in App**: Launch directly into YouTube or Facebook apps on mobile devices.

### 2. Cross-Site Discoverability
- **Header Navigation**: Added `LIVE` menu item with a live pulsing red dot (`.nav-live`).
- **Chapel Detail Pages**: Chapel pages (`pdcm-english.html`, etc.) feature a "Watch Live Broadcast" CTA button linking to their channel.
- **Sermons Page**: [sermons.html](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/sermons.html) features a prominent livestream discovery banner.
- **Footer Links**: Canonical footer updated to include "Watch Live".

---

## Admin Portal Integration (`admin/`)

- **Sidebar Navigation**: Added `📺 Livestreams` (`data-tab="livestream"`) with a badge showing total broadcast channels.
- **Dashboard Shortcuts**: Added a `📺 Livestreams & Broadcasts` action card in Quick Management Actions.
- **Workspace Panel (`#panelLivestream`)**:
  - Chapel Channel Dropdown Selector.
  - Live broadcast status switcher (`🔴 Live Now`, `⏰ Upcoming`, `⏹ Offline`).
  - Service title, speaker, scripture theme, and regular schedule.
  - Default video platform preference (`YouTube` vs `Facebook`).
  - YouTube configuration (enabled toggle, video ID/URL, channel URL).
  - Facebook configuration (enabled toggle, video URL, page URL).
  - Bulletin & welcome note editor.
  - One-click `💾 Save Livestream Changes` syncing directly to Supabase DB.

---

## Data Delivery & Supabase DB Integration

- **Supabase DB Sync**:
  - Updates write directly to `site_content` table under `key = 'livestream'`.
  - Reads and writes use `ContentService` with automated rollback protection and local fallback.
- **Validation**:
  - Passes `scripts/check-content-integrity.js`.
  - Passes `scripts/check-navigation-integrity.js`.
  - Passes `scripts/check-ui-integrity.js`.
