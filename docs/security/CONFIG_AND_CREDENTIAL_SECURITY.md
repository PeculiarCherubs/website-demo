# Configuration & Credential Security Architecture

## 1. Executive Summary

This document establishes the security guidelines, token boundaries, and storage policies governing backend credentials and configuration across the Peculiar Cherubs Website & CMS.

Following the decoupling of specific BaaS providers (Supabase, PocketBase, etc.), the architecture enforces strict isolation between client-safe public keys and privileged administrative secrets.

---

## 2. Credential Classification & Boundary Rules

### 2.1 Public / Anonymous Tokens (Client-Safe)
- **Examples**: Supabase `anonKey` (JWT role `anon`), PocketBase public collection endpoints.
- **Scope**: Permits read-only queries bounded by strict Row-Level Security (RLS) / Collection API rules.
- **Storage**: Tracked in `content/baas-config.json` and default code bundles.
- **Allowed Operations**:
  - `GET /rest/v1/site_content?select=...`
  - `POST /auth/v1/token?grant_type=password` (Authentication handshake)
  - `GET /api/collections/site_content/records` (PocketBase public view)

### 2.2 Privileged Master Secrets (STRICTLY FORBIDDEN on Client / Git)
- **Examples**:
  - Supabase `service_role` secret keys (bypasses RLS).
  - PostgreSQL database connection strings (`postgres://postgres:...`).
  - PocketBase superuser/admin master credentials.
- **Policy**:
  - **NEVER** commit privileged keys to version control.
  - **NEVER** expose privileged keys in client-facing JavaScript bundles (`admin.js`, `contentService.js`, etc.).
  - **NEVER** place privileged keys in `content/baas-config.json`.
  - All write mutations performed by the CMS require an authenticated administrator session (`Bearer <accessToken>`) with verified role permissions in the backend.

---

## 3. Environment & Local Override Isolation

To allow developers and operations to test against staging or isolated backends without risking credential leaks:

### 3.1 `.gitignore` Hardening
The following patterns are committed to `.gitignore` to prevent accidental credential staging:
```gitignore
# Local Developer Configuration & Credential Overrides
config.local.js
*.local.js
*.credentials.json
.env*
```

### 3.2 Local Developer Overrides (`config.local.js`)
Developers may create `js/backend/config.local.js` (modeled after `config.example.js`):
```javascript
window.CMS_LOCAL_CONFIG = {
  activeProvider: 'pocketbase',
  providers: {
    pocketbase: {
      url: 'http://127.0.0.1:8090',
      contentCollection: 'site_content',
      usersCollection: 'users'
    }
  }
};
```
Because `config.local.js` matches `*.local.js`, Git refuses to track it, protecting local URLs and credentials.

---

## 4. Session & Storage Security

### 4.1 Ephemeral Session Tokens (`sessionStorage`)
- **Vulnerability Prevented**: Token persistence across browser sessions or shared public workstations.
- **Implementation**:
  - Administrative authentication tokens (`accessToken`, `refreshToken`, `expiresAt`) are stored exclusively in `sessionStorage` (`pdcm_cms_auth_session`).
  - When the browser tab or window is closed, the session is purged automatically by the browser.
  - Public `localStorage` is used solely for non-sensitive provider selection preferences (`pdcm_active_baas_provider`), never for secrets or auth tokens.

### 4.2 Cross-Site Scripting (XSS) Mitigation & Log Sanitization
- The `BackendAdapter.sanitizeForLog(data)` utility automatically strips sensitive keys:
  ```javascript
  ['accessToken', 'access_token', 'refreshToken', 'refresh_token', 'password', 'token']
  ```
  from console logs and error payloads, preventing sensitive leakage into browser debugging tools or third-party log aggregators.

---

## 5. Circuit-Breaker & Denial-of-Service Protection

### 5.1 Outage Resiliency
- When a live BaaS provider suffers network latency, database locks, or outages, naive applications repeatedly retry with 5–10 second timeouts, causing public pages to freeze.
- `BackendAdapter` features an integrated **Circuit Breaker**:
  - If a request to the active provider times out or returns network errors, the circuit trips immediately.
  - Subsequent requests for the next **60 seconds** fail fast without waiting on network timeouts, allowing public pages to instantly load from local `site-content.json` cache.
  - After the 60-second cooldown expires, a single probe request is permitted. If successful, the circuit resets automatically.

---

## 6. Automated Security Testing

The repository includes an automated security audit suite:
```bash
node website-demo/scripts/check-security-config.js
```
The test verifies:
1. Zero occurrences of `service_role`, `postgres://`, or private keys in the entire frontend repository.
2. Proper `.gitignore` rules for all local credential variants.
3. Integrity and safety of `content/baas-config.json`.
4. Adherence of all providers to `sessionStorage` session storage and abstract interface contracts.
