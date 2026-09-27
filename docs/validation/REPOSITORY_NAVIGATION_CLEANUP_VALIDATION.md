# Repository & Navigation Cleanup — Validation

- duplicate `developer-feature-files/` snapshot removed: PASS
- empty `.vscode/` artifact removed: PASS
- stale event/social placeholder media directory removed: PASS
- root historical documentation reorganized under `docs/`: PASS
- current `README.md` added: PASS
- docs index + route inventory added: PASS
- compatibility `pdcms.html` redirect retained: PASS
- compatibility `publication-detail.html?issue=...` reader retained: PASS
- canonical fallback navigation targets exist: PASS
- public footer navigation includes Chapels consistently: PASS
- fallback `href="#"` / `pdfUrl="#"` placeholders removed: PASS
- future actions render as Coming Soon rather than fake navigation: PASS
- Admin Quick Links no longer encourages/saves `#`: PASS
- legacy `ministries.items` compatibility reader removed: PASS
- canonical `ministries.details` + `chapels.details` Admin aggregation retained: PASS
- Supabase navigation/future-action migration included: PASS
- read-only navigation integrity audit included: PASS
- repository/navigation automated checker: PASS
- content integrity automated checker: PASS
- GitHub Actions validation workflow added: PASS
- PR stabilization checklist added: PASS
- unresolved Git conflict markers: none found
- JavaScript syntax checks: PASS

## Deliberately retained

Potentially unused hero/media assets outside the removed event-placeholder directory were not deleted because live Supabase content may still reference repository-hosted asset paths.

## Live step still required

Back up live `navigation`, `quickLinks`, and `publications`, then run:

`supabase/migrations/repository-navigation-cleanup.sql`

Afterward run:

`supabase/audits/navigation-integrity-audit.sql`

## SQL migration correction

The PostgreSQL `jsonb_each(...)` result columns used by the publications
migration are explicitly aliased as `(issue_key, issue_value)` and
`(lesson_key, lesson_value)`. This avoids PostgreSQL error `42703` when
rebuilding the JSON objects.
