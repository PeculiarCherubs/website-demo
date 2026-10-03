# Peculiar Cherubs — Cloudflare Migration-Ready Baseline

## Purpose

This is the reconciliation boundary before the Supabase → Cloudflare migration.

The build starts from the stabilized `Sermons / Live Navigation Cleanup` code and adapts only the infrastructure-independent ideas worth carrying forward from the co-developer's `backend_agnostic` branch.

## Adopted and adapted

### Public provider boundary

`ContentService` now reads through:

```text
PublicDataClient
```

Deployment-selected public providers:

```text
supabase-legacy   ← current migration state
cloudflare        ← target
```

Selection is static deployment configuration in:

```text
js/data/runtimeConfig.js
```

There is no browser/localStorage production backend switch.

### Read fail-fast behavior

The public client has a short circuit breaker to avoid repeatedly waiting on a dead provider.

Repository fallback remains read-only and is never promoted to authoritative write state.

### Giving Admin UX

The improved Giving CMS interface is retained:

- executive stats;
- accordion sections;
- account currency counts/filtering;
- redesigned bank cards;
- copy-account-number;
- payment gateway settings;
- special projects;
- Giving page/WhatsApp content.

### Payment-link privacy

The earlier branch could append donor identity to checkout URLs.

This baseline changes the default to:

```text
appendDonorParams = false
```

If explicitly enabled, only:

```text
amount
currency
purpose
```

may be appended.

Name, email and phone are never written into payment-link query parameters.

### Credential hygiene

The repository ignores Cloudflare/local runtime material:

```text
.dev.vars
.wrangler/
*.credentials.json
*.local.js
node_modules/
```

### Cloudflare foundation

Cloudflare Stage 1 is integrated under:

```text
cloudflare/
```

## Explicitly excluded

This baseline does not carry forward:

- PocketBase;
- Fly.io;
- Docker;
- browser provider switching;
- browser localStorage content journals;
- browser mutation outboxes;
- browser-side backend mirroring;
- symmetric Supabase ↔ alternate-backend synchronization;
- provider credentials edited through the CMS.

## Source of truth during migration

Until cutover:

```text
Supabase = live transactional source
Cloudflare = staging migration target
Git JSON = explicit emergency fallback
```

After cutover:

```text
D1 = transactional source of truth
R2 = derived public/media/backup storage
Git JSON = explicit emergency fallback
```

Supabase and D1 must never operate as symmetric writable masters.

## Admin migration boundary

Supabase Auth/RPC remains active in this reconciliation build.

That is intentional.

Admin migration follows as a staged Cloudflare security build:

1. Cloudflare Access on staging;
2. Access JWT verification inside Admin Worker;
3. D1 roles/permissions/scopes;
4. `/api/me`;
5. Admin API;
6. CMS cutover;
7. Supabase Auth/RPC retirement.

This avoids changing content abstraction, authentication, authorization and persistence simultaneously.

## Next step

Execute Cloudflare Stage 1, then build:

> **Stage 2 — D1 Base Schema + Cloudflare Access Security Foundation**
