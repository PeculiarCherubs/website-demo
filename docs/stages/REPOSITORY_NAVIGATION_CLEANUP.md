# Repository & Navigation Cleanup

## Scenario

The runtime architecture is stable, but the repository still carried parallel-development debris, stale duplicate files, root-level historical documentation, inconsistent footer navigation, fake `#` destinations, and one legacy `ministries.items` compatibility reader.

## Intent

Make the repository match the architecture already adopted:

1. one maintained runtime copy of each route;
2. one canonical navigation tree;
3. compatibility routes retained only when they still serve a real purpose;
4. future actions represented as Coming Soon, never fake navigation;
5. historical documentation preserved without cluttering the repository root;
6. automated checks for repository/navigation regressions.

## Main decisions

- Remove `developer-feature-files/`.
- Remove stale `assets/events/placeholders/`.
- Remove empty `.vscode/`.
- Reorganize historical docs under `docs/`.
- Retain `pdcms.html` as a redirect to `chapels.html`.
- Retain `publication-detail.html?issue=...` for the legacy Goodnews archive.
- Keep Supabase authoritative for the live `navigation` row.
- Canonicalize live navigation with an explicit migration.
- Remove `href="#"` / `pdfUrl="#"` placeholder behavior.
- Render unavailable future actions as Coming Soon.
- Remove the legacy Admin reader for `ministries.items`.
- Keep canonical Admin sources as `ministries.details` and `chapels.details`.
- Add Chapels consistently to public footers.
- Add automated validation on `develop` and `main`.
- Retain uncertain/possibly live-referenced hero assets until a live asset audit proves they are unused.

## Live database step

Back up `navigation`, `quickLinks`, and `publications`, then run:

`supabase/migrations/repository-navigation-cleanup.sql`

Afterward run:

`supabase/audits/navigation-integrity-audit.sql`

## Out of scope

- broad CSS/UI standardization;
- deleting assets that live Supabase may still reference;
- migrating all legacy Goodnews issue data to slug-based posts;
- automatic git-history rewriting;
- final comprehensive security hardening.
