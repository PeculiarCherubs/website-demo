# Chapels Data-Model Canonicalization

## Scenario

The public information architecture already treated **CHAPELS** and **MINISTRIES**
as separate domains, but the content model did not.

Before this change:

```text
Chapels landing cards → chapels.current
Individual chapel pages → ministries.details
```

That meant a chapel existed partly inside `chapels` and partly inside `ministries`.

The CMS stabilization pass synchronized those structures, but synchronization
still left two domains claiming ownership of one entity.

---

## Intent

Give Chapels one explicit canonical content model.

The target is:

```text
chapels
├── hero
├── current
├── upcoming
└── details
    ├── pdcm-gwarinpa
    ├── pdcm-english
    ├── pdcm-byazhin
    └── pdcm-mega-youth
```

and:

```text
ministries.details
```

contains ministries only.

---

## Decision

### `chapels.current`

Owns the lightweight cards/listing records shown on the Chapels landing page.

### `chapels.details`

Owns the full individual chapel records used by chapel detail pages.

### `ministries.details`

Owns ministry detail records only.

`pdcm-mission` remains under Ministries because it is the church's Mission Arm,
not a chapel.

---

## Page Routing

Individual chapel pages now use:

```text
data-page="chapelDetail"
```

instead of:

```text
data-page="ministryDetail"
```

ContentService maps:

```text
chapelDetail → chapels
ministryDetail → ministries
```

So a chapel page no longer fetches or depends on the Ministries section.

The visual detail renderer is shared because both content types use the same page
layout, but their data ownership is separate.

---

## Admin Behavior

The Admin Portal may continue to present **Ministries & Chapels** in one management
surface for editorial convenience.

The data model underneath is no longer shared.

### If placement is `chapels`

The record is stored in:

```text
chapels.details[id]
```

and its listing card is stored in:

```text
chapels.current[]
```

### If placement is a Ministry group

The record is stored in:

```text
ministries.details[id]
```

and its key is added to:

```text
ministries.groups[*].items
```

### Moving between domains

When an editor moves an entity from Ministry → Chapel or Chapel → Ministry, the
record is removed from its previous canonical store before being written to the
new one.

That prevents duplicate ownership.

---

## Live Supabase Migration

Because Supabase is now the source of truth, repository JSON cannot be used as
the mechanism for migrating the live records.

The included SQL migration:

```text
supabase/migrations/chapels-details-canonicalization.sql
```

copies the **current live Supabase chapel records** from:

```text
ministries.details
```

to:

```text
chapels.details
```

then removes the chapel records from `ministries.details`.

This preserves any live CMS edits that may be newer than the repository fallback.

---

## Required Deployment Order

1. Export/back up the current `site_content` rows.
2. Run `chapels-details-canonicalization.sql` in the Supabase SQL Editor.
3. Verify the four chapel keys exist under `chapels.details`.
4. Verify those same four keys no longer exist under `ministries.details`.
5. Deploy this code build.
6. Test all four chapel pages.
7. Edit one chapel in Admin and verify the `chapels` row changes, not `ministries`.

Do **not** deploy the new `chapelDetail` frontend routing before migrating the
live Supabase rows.

---

## Result

Before:

```text
chapels.current        → chapel listing
ministries.details     → chapel detail
```

After:

```text
chapels.current        → chapel listing
chapels.details        → chapel detail
```

and independently:

```text
ministries.groups      → ministry listings
ministries.details     → ministry details
```

Each content domain now owns its own entities.

---

## Explicit Non-Goals

This change does not:

- redesign chapel pages
- redesign the Admin interface
- implement CMS authentication/RLS
- clean repository merge scaffolding
- standardize CSS

Those remain separate stabilization workstreams.
