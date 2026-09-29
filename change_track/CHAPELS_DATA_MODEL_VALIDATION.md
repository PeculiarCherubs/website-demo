# Chapels Data-Model Canonicalization — Validation

- `site-content.json` valid JSON: PASS
- four active chapel records moved to `chapels.details`: PASS
- those chapel records removed from `ministries.details`: PASS
- `pdcm-mission` remains a Ministry: PASS
- chapel landing records remain under `chapels.current`: PASS
- chapel listing records have stable IDs in repository fallback: PASS
- four chapel pages use `data-page="chapelDetail"`: PASS
- `chapelDetail` maps to the `chapels` Supabase section: PASS
- public detail renderer selects `chapels.details` for chapel pages: PASS
- Admin aggregates canonical Ministries + canonical Chapels: PASS
- Admin writes Chapel placement to `chapels.details`: PASS
- Admin writes Ministry placement to `ministries.details`: PASS
- Admin supports moving an entity between the two domains: PASS
- JavaScript syntax checks: PASS
- unresolved Git conflict markers: none found

## Live requirement

Run the included Supabase SQL migration **before deploying this build**.
The SQL migration copies the current live chapel data; repository fallback data
is not used to overwrite live chapel records.
