# Multi-Backend Automatic Synchronization & Failover Resilience

This document details the architecture, design patterns, and operational procedures for automatic, symmetric data synchronization and failover resilience between BaaS providers (Supabase and PocketBase).

---

## 1. Problem Statement & Motivation

Previously, switching between Supabase and PocketBase in the CMS required manual content seeding or running one-off migration scripts. If content was updated while Supabase was active, and Supabase subsequently experienced an outage or network failure, switching over to PocketBase left the website with stale or missing data.

Furthermore, if the source database is already offline at switchover time, direct database-to-database delta querying is impossible.

---

## 2. Architecture Overview: Three-Pillar Failover Resilience

```text
               +--------------------------------------------+
               |        Admin Portal & Public Website       |
               +---------------------+----------------------+
                                     |
                                     v
               +--------------------------------------------+
               |       SyncCoordinator & BackendAdapter     |
               |  - Persistent Local Content Journal        |
               |  - Uncommitted Mutation Outbox             |
               |  - Symmetric Delta Reconciler              |
               |  - Opportunistic Background Mirroring      |
               +---------------------+----------------------+
                                     |
                    +----------------+----------------+
                    |                                 |
                    v                                 v
     +------------------------------+  +------------------------------+
     |       Supabase (Live)        |  |      PocketBase (Live)       |
     | - PostgREST site_content     |  | - REST site_content          |
     | - RPC Concurrency Tokens     |  | - REST Concurrency Tokens    |
     +------------------------------+  +------------------------------+
                    ^                                 ^
                    |                                 |
                    +=========== RECONCILER ==========+
                          (Symmetric / Bidirectional)
```

### Pillar 1: Persistent Local Content Journal & Outbox (`SyncCoordinator`)
- **Continuous Local Snapshotting**: Every content section fetched from the live database or mutated via CMS writes is saved into a persistent browser journal (`pdcm_content_journal`) with the section payload, `updated_at` timestamp, and source provider.
- **Mutation Outbox**: CMS writes are enqueued into `pdcm_mutation_outbox` for guaranteed delivery and auditing.
- **Offline Resilience**: Even if the active database crashes immediately after a write, the browser maintains an authoritative local snapshot of all sections.

### Pillar 2: Proactive Opportunistic Mirroring
- When both backends are configured and reachable, CMS writes to the primary backend are asynchronously mirrored to the secondary backend in the background.

### Pillar 3: Symmetric Failover Reconciler
- When the active BaaS is switched (`activateBaaSProvider` or `BackendAdapter.setActiveProvider`):
  1. **Connectivity Check**: Pings the previous active backend.
  2. **Data Sourcing**:
     - If **Online**: Reads live section payloads and metadata directly from the source backend.
     - If **Offline** (outage / 503): Seamlessly falls back to the **Persistent Local Content Journal**.
  3. **Target Comparison**: Reads existing records and `updated_at` timestamps from the target backend.
  4. **Delta Calculation**: Identifies missing sections or sections where source/journal has a newer timestamp.
  5. **Automated Upsert**: Pushes deltas to the target backend.
  6. **Failback**: Works symmetrically in reverse (PocketBase -> Supabase).

---

## 3. Core Components Modified

1. **`js/backend/syncCoordinator.js` [NEW]**:
   - Manages `pdcm_content_journal`, `pdcm_mutation_outbox`, and `pdcm_sync_meta`.
   - `reconcile({ sourceProviderName, targetProviderName, session, forceLocal })`.
   - `recordSnapshot(key, data, updatedAt, provider)`.
   - `mirrorToSecondary(key, data, activeProvider, session)`.
   - `getSyncStatus()`.

2. **`js/backend/backendAdapter.js` [MODIFIED]**:
   - Added `getRegisteredProvider(name)`.
   - Integrated `SyncCoordinator.recordSnapshot` and opportunistic `mirrorToSecondary` into `mutations.upsertSection`.
   - Enhanced `setActiveProvider` to run automatic failover sync on provider switch.
   - Added `BackendAdapter.sync` facade.

3. **`js/contentService.js` [MODIFIED]**:
   - Connected `fetchSectionsFromDB` and `setCachedSection` to `SyncCoordinator` so live reads continually feed the local snapshot cache.

4. **`admin/index.html` & `js/admin.js` [MODIFIED]**:
   - Added **Multi-Backend Synchronization & Failover Resilience** card to `#panelBaaSSettings`.
   - Real-time parity status badge (`✓ Parity Maintained` / `⚠ Outbox Pending`).
   - "🔄 Reconcile & Sync Now" manual trigger action (`AdminPortal.reconcileBaaSBackends()`).
   - Real-time toast notifications detailing reconciled sections on provider switch.

5. **`scripts/check-sync-integrity.js` [NEW]**:
   - Automated test suite validating journaling, timestamp comparison, live delta sync, offline source failover, and reverse failback.

---

## 4. Verification & Automated Test Status

All 7 test suites pass:
- `scripts/check-security-config.js`: PASS
- `scripts/check-security-integrity.js`: PASS
- `scripts/check-content-integrity.js`: PASS
- `scripts/check-navigation-integrity.js`: PASS
- `scripts/check-ui-integrity.js`: PASS
- `scripts/check-final-qa.js`: PASS
- `scripts/check-sync-integrity.js`: PASS (6/6 tests passed)
