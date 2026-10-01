# Backend-as-a-Service (BaaS) Decoupling & Provider Abstraction

This update establishes a vendor-agnostic architecture across the Peculiar Cherubs website and CMS, removing direct client-side coupling to Supabase and enabling seamless interoperability with alternative backends such as PocketBase.

---

## 1. Context & Motivation

Historically, both the public-facing pages and the CMS Admin Portal communicated directly with Supabase via PostgREST endpoints (`/rest/v1/...`) and Supabase GoTrue Auth (`/auth/v1/...`).

While functional, this created heavy vendor lock-in:
1. **Direct API Coupling**: Public loaders and admin panels relied on Supabase-specific URL structures, request headers (`apikey`), and PostgreSQL Remote Procedure Calls (`/rest/v1/rpc/...`).
2. **Schema & Version Dependencies**: Write operations were tightly coupled to PostgreSQL functions (`cms_upsert_site_content`, `cms_get_access_profile`, `cms_list_admins`).
3. **Migration Friction**: Evaluating alternative backends (such as self-hosted PocketBase) would have required editing dozens of HTML and JS files across the application.

---

## 2. Target Architecture

```text
               +--------------------------------------------+
               |      Public Website & CMS Admin Portal     |
               |  (Vendor-agnostic UI, zero hardcoded APIs) |
               +---------------------+----------------------+
                                     |
                                     v
               +--------------------------------------------+
               |       BackendAdapter & ConfigManager       |
               |  - Standard CmsBackendAdapter Contract     |
               |  - Dynamic 1-Click Provider Switcher       |
               |  - 60s Cooldown Circuit Breaker            |
               |  - Ephemeral sessionStorage Security       |
               +---------------------+----------------------+
                                     |
                    +----------------+----------------+
                    |                                 |
                    v                                 v
     +------------------------------+  +------------------------------+
     |       SupabaseProvider       |  |      PocketBaseProvider      |
     | - PostgREST Read Queries     |  | - REST Collection Queries    |
     | - GoTrue Password Auth       |  | - Auth Collection Handshake  |
     | - Atomic RPC Mutations       |  | - Optimistic Concurrency     |
     | - PostgreSQL RBAC Profiles   |  | - PocketBase User RBAC       |
     +------------------------------+  +------------------------------+
```

---

## 3. Core Architectural Components

### 3.1. Public Configuration Manifest (`content/baas-config.json`)
Defines the connection profiles for each registered backend provider:
- **`activeProvider`**: Identifies the currently active runtime provider (`"supabase"` or `"pocketbase"`).
- **`providers.supabase`**: URL and public anonymous key (`anonKey`).
- **`providers.pocketbase`**: Base URL (`http://127.0.0.1:8090`), content collection (`site_content`), users collection (`users`), and roles collection (`cms_roles`).

### 3.2. Configuration Manager (`js/backend/config.js`)
- Dynamically loads configuration from `content/baas-config.json`.
- Supports local runtime overrides stored in `localStorage` (`pdcm_baas_override`).
- Emits observable switchover events (`baas:provider-changed`) so that open UI panels and services react instantly without requiring a full page reload.

### 3.3. Standardized Backend Adapter (`js/backend/backendAdapter.js`)
Enforces a uniform interface (`CmsBackendAdapter`) across all BaaS implementations:
- **Content Retrieval**: `fetchSections(sectionKeys)`, `getSection(key)`, `getSectionVersion(key)`.
- **Authentication**: `signIn(email, password)`, `signOut()`, `refreshSession()`, `requestPasswordReset(email)`, `resetPassword(token, newPassword)`, `updatePassword(newPassword)`.
- **Role-Based Access Control (RBAC)**: `isCmsAdmin(session)`, `getAccessProfile(token)`, `listRoles()`, `listAdmins()`, `assignAdminRole()`, `setAdminRole()`, `removeAdmin()`.
- **Mutations**: `upsertSection(key, data, session, options)`.
- **Health & Diagnostics**: `testConnection(providerConfig)`.

### 3.4. Resilient Circuit Breaker
- Integrated directly into `BackendAdapter`.
- Detects network disconnects, latency spikes (>4000ms), or offline backends and trips a 60-second cooldown.
- Prevents cascading browser hangs on public pages by immediately routing queries to local repository fallback (`content/site-content.json`).

### 3.5. Provider Implementations
- **`SupabaseProvider` (`js/backend/supabaseProvider.js`)**: Wraps PostgREST, GoTrue authentication, row-level security functions, and optimistic concurrency RPCs (`cms_upsert_site_content`).
- **`PocketBaseProvider` (`js/backend/pocketbaseProvider.js`)**: Communicates with PocketBase REST APIs (`/api/collections/site_content/records`, `/api/collections/users/auth-with-password`, `/api/health`). Maps PocketBase schema attributes to canonical CMS models.

---

## 4. Admin Portal Enhancements

### 4.1. One-Click BaaS Switchover Panel (`admin/index.html` & `js/admin.js`)
A dedicated **⚙️ BaaS Settings** panel accessible to Super Admins:
- Live Active Backend status badge (`SUPABASE` vs `POCKETBASE`).
- Provider connection cards featuring real-time diagnostic testing (`Test Connection`) measuring round-trip latency.
- **🚀 Set as Active BaaS** action that hot-swaps the runtime provider for all mutations and queries with zero downtime.
- JSON configuration export for disaster recovery and staging deployments.

### 4.2. PocketBase Super Admin RBAC Normalization
Resolved permission mismatches when authenticating through PocketBase:
- Normalized role checks for `super_admin`, `superadmin`, `admin`, and `is_admin: true`.
- Populated full permission arrays alongside wildcard `*` permissions.
- Added super admin role bypass in `AdminPortal.hasPermission()` to guarantee that navigation tabs, action buttons, stat cards, and panels are never inadvertently hidden.
- Made role listing and scope assignment operations provider-agnostic.

### 4.3. Giving Management & Bank Accounts Accordion Redesign
- Reorganized `#panelGiving` into 4 interactive, collapsible accordions:
  1. **🏦 Verified Church Bank Accounts** *(open by default)*
  2. **💳 Online Payment Gateway Plugin**
  3. **🌟 Special Projects & Targeted Missions**
  4. **📱 Giving Page Content & WhatsApp Notifications**
- Added an Executive Stats Ribbon showing live counts for bank accounts, gateway status, and active campaigns.
- Upgraded bank account cards with high-visibility monospaced account numbers, color-coded currency tags (NGN, USD, GBP, EUR), formatted narration callouts, and one-click clipboard copying (`✓ Copied!`).
- Implemented segmented pill currency filter tabs with live badge counters.

---

## 5. Security & Credential Safeguards

1. **Master Secret Elimination**: Master service-role keys and administrative credentials have been purged from all frontend files and tracked git history.
2. **Ephemeral Session Storage**: Administrative session tokens (`accessToken`) are isolated to `sessionStorage`. Tokens are automatically destroyed when the browser tab closes, eliminating persistent token leakage via `localStorage`.
3. **Repository Git Protection**: `.gitignore` strictly excludes local override configurations (`config.local.js`, `*.local.js`), credential manifests (`*.credentials.json`), and environment definitions (`.env*`).
4. **Log Redaction**: `BackendAdapter.sanitizeForLog()` automatically masks sensitive fields (`accessToken`, `password`, `refreshToken`) during debugging and diagnostics.

---

## 6. Verification & Automated Test Suites

All 6 automated QA and security test suites pass:

| Test Script | Verification Focus | Status |
| :--- | :--- | :--- |
| `scripts/check-security-config.js` | Zero secret leaks, `.gitignore` rules, provider interface conformance, `sessionStorage` token isolation | **PASS** ✅ |
| `scripts/check-security-integrity.js` | CMS RBAC integrity, server-side write endpoints, token verification | **PASS** ✅ |
| `scripts/check-final-qa.js` | Chapel-scoped permissions, route availability, conflict marker audit | **PASS** ✅ |
| `scripts/check-content-integrity.js` | JSON structure, schema validation, placeholder/dummy data removal | **PASS** ✅ |
| `scripts/check-navigation-integrity.js` | Internal links, anchor routing, script reference integrity | **PASS** ✅ |
| `scripts/check-ui-integrity.js` | CSS design tokens, responsive standards, shared styling layers | **PASS** ✅ |

---

## 7. Migration & Rollback Guide

- Detailed deployment and schema setup instructions for PocketBase: [POCKETBASE_MIGRATION_GUIDE.md](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/docs/migrations/POCKETBASE_MIGRATION_GUIDE.md).
- Security configuration guide: [CONFIG_AND_CREDENTIAL_SECURITY.md](file:///c:/projects/priv/peculiarcherubs-demo/website-demo/docs/security/CONFIG_AND_CREDENTIAL_SECURITY.md).
