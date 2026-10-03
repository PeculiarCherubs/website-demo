# Peculiar Cherubs — `backend_agnostic` Branch Reconciliation Review

**Reviewed branch:** `backend_agnostic`  
**Branch head:** `ad96756`  
**Base found in Git history:** `791bc2e` — **Sermons / Live Navigation Cleanup**  
**Purpose of this review:** Identify which co-developer changes should be adopted, adapted to the Cloudflare migration, or deliberately excluded.

---

## 1. Branch lineage

This branch is not significantly behind the stabilized website feature line.

Its Git history shows:

```text
791bc2e  Sermons / Live Navigation Cleanup
   ↓
778ae4f  Provider-agnostic adapter + PocketBase switchover
   ↓
09cb420  BaaS decoupling/provider abstraction refinements
   ↓
ad96756  Multi-backend sync and failover resilience
```

Therefore it already contains the website work through:

- Chapel Page Standardization
- Multi-Chapel Broadcast Foundation
- Chapel-Scoped CMS Access
- Livestream Canonicalization
- Sermons / Live Navigation Cleanup

The only major architectural work after this branch is the new Cloudflare migration foundation.

**Conclusion:** Do not treat this as a disposable stale branch. It contains several useful ideas, but the backend implementation should not be merged wholesale because our target backend has now changed to Cloudflare Workers + D1 + Access + R2.

---

# 2. Overall decision

Use the branch as an **architecture donor**, not as a merge target.

```text
ADOPT:
- frontend/backend decoupling concept
- normalized data-provider contract
- timeout/circuit-breaker idea
- log redaction
- stronger config/credential hygiene
- automated backend/security contract tests
- Giving CMS UX redesign
- infrastructure diagnostics/status UX

ADAPT:
- BackendAdapter → Cloudflare public data client + Admin API client
- BaaS Settings → Cloudflare Platform Status
- multi-backend sync status → server-side publish/outbox status
- ConfigManager → non-sensitive runtime config only
- Super Admin bypass → canonical Cloudflare RBAC middleware
- failover → R2/public snapshot + repository fallback
- sync tests → D1/R2 publish and recovery tests

DO NOT ADOPT:
- PocketBase
- Fly.io/Docker deployment
- browser-side BaaS switching
- browser localStorage as recovery authority
- client-side mutation outbox
- symmetric multi-master Supabase ↔ PocketBase sync
- browser-side provider mirroring
- multiple writable production sources
```

---

# 3. Strong idea #1 — Provider abstraction

## What the co-developer built

The branch introduces:

```text
js/backend/backendAdapter.js
js/backend/supabaseProvider.js
js/backend/pocketbaseProvider.js
js/backend/config.js
```

and changes `ContentService` so pages ask a standardized adapter for content instead of always containing Supabase-specific request logic.

The normalized public read methods include concepts such as:

```text
fetchSections()
fetchSectionsWithMeta()
getSection()
getSectionVersion()
```

The normalized Admin concepts include:

```text
access profile
roles
admins
section writes
chapel writes
sermon writes
broadcast writes
```

## Decision

**ADOPT THE CONCEPT.**

This is exactly the architectural seam we now want for Cloudflare.

However, do not preserve the current all-purpose `BackendAdapter` literally.

Cloudflare Access changes the authentication model, so the new abstraction should be separated into two concerns.

### Recommended public contract

```text
PublicContentClient

loadPage(pageName)
getSection(sectionKey)
getVersion(sectionKey)
health()
```

Possible implementations during migration:

```text
SupabasePublicProvider       ← temporary
CloudflarePublicProvider     ← target
RepositoryFallbackProvider   ← emergency read-only
```

After cutover:

```text
CloudflarePublicProvider
RepositoryFallbackProvider
```

### Recommended Admin contract

```text
AdminApiClient

getProfile()
getSection()
updateSection()
updateChapel()
listSermons()
saveSermon()
deleteSermon()
getBroadcast()
updateBroadcast()
listAdmins()
setRole()
setScopes()
getAudit()
```

Cloudflare Access handles sign-in outside this JavaScript API.

Therefore methods such as:

```text
signIn(email,password)
refreshSession()
requestPasswordReset()
resetPassword()
updatePassword()
```

should **not** survive into the Cloudflare adapter.

---

# 4. Strong idea #2 — Decoupling `ContentService`

The branch correctly moves `ContentService` toward:

```text
ContentService
       ↓
normalized provider interface
```

instead of:

```text
ContentService
       ↓
hardcoded Supabase REST URL
```

## Decision

**ADOPT AND FINISH IT.**

There is, however, a flaw in the branch: `ContentService` still contains a direct Supabase REST fallback when `BackendAdapter` is unavailable.

That means it is not completely provider-agnostic.

For Cloudflare, the target must be:

```text
ContentService
       ↓
PublicContentClient
       ↓
Cloudflare endpoint / published snapshot
```

and never:

```text
ContentService
       ↓
provider unavailable
       ↓
secretly fall back to Supabase REST
```

Any legacy Supabase provider should exist only during the migration phase and be invoked explicitly.

---

# 5. Strong idea #3 — Circuit breaker / fail-fast public fallback

The branch implements a 60-second browser circuit breaker.

Concept:

```text
backend request fails
       ↓
temporarily stop repeating slow requests
       ↓
use fallback quickly
       ↓
retry later
```

This addresses a real UX problem: repeatedly waiting several seconds for a dead backend.

## Decision

**ADAPT.**

Under Cloudflare, use the concept but simplify it.

Recommended public behavior:

```text
R2/public API available
→ use live published content

temporary failure
→ fail fast
→ use repository emergency fallback if allowed
→ probe again after cooldown
```

Important:

- this is read resilience;
- it must not grant write authority;
- the browser must never use fallback data as an authoritative write source.

---

# 6. Strong idea #4 — Log redaction

`BackendAdapter.sanitizeForLog()` redacts:

```text
accessToken
access_token
refreshToken
refresh_token
password
token
```

## Decision

**ADOPT AND EXPAND SERVER-SIDE.**

In Cloudflare, implement a Worker log sanitizer covering at minimum:

```text
Authorization
Cf-Access-Jwt-Assertion
Cookie
Set-Cookie
password
token
secret
apiKey
accessToken
refreshToken
bank/payment secrets
```

The Worker should log:

```text
request ID
route
method
status
actor subject/email
role
resource
action
duration
safe error code
```

without logging credentials.

---

# 7. Strong idea #5 — Credential hygiene

The branch adds `.gitignore` rules for:

```text
config.local.js
*.local.js
*.credentials.json
.env*
```

and documents public versus privileged credentials.

## Decision

**ADOPT THE HYGIENE, ADAPT THE MODEL.**

Under Cloudflare:

```text
.dev.vars
.wrangler/
node_modules/
*.local.json
*.credentials.json
.env*
```

must remain untracked.

Production privileged values go into:

```text
Wrangler secrets / Cloudflare secrets
```

The browser should no longer contain a Supabase anon key after final cutover.

---

# 8. Strong idea #6 — Automated security/config contract tests

The branch adds:

```text
scripts/check-security-config.js
scripts/check-sync-integrity.js
```

alongside the existing QA suites.

This is a very good direction.

## Decision

**ADOPT THE TESTING DISCIPLINE, REWRITE THE TARGETS.**

Recommended Cloudflare equivalents:

```text
check-cloudflare-config.js
check-public-provider-contract.js
check-admin-api-contract.js
check-d1-schema.js
check-access-security.js
check-chapel-scope.js
check-audit-integrity.js
check-publish-outbox.js
check-r2-policy.js
```

`check-security-config.js` should specifically fail if deployed code contains:

```text
supabase.co/rest/v1
service_role
postgres://
PocketBase production URLs
client-side CMS passwords
direct D1 credentials
```

after Cloudflare cutover.

---

# 9. Strong idea #7 — Giving Admin UX redesign

This branch substantially improves the Giving CMS interface.

Useful additions include:

- executive stats ribbon;
- collapsible accordions;
- verified bank account section;
- currency filter pills;
- NGN / USD / GBP / EUR counts;
- stronger account cards;
- copy-account-number UX;
- payment gateway settings panel;
- special projects section;
- Giving page/WhatsApp configuration grouped separately.

## Decision

**ADOPT THE UI/UX.**

This is independent of PocketBase and improves the CMS.

Recommended adapted sections:

```text
Giving
├── Verified Bank Accounts
├── Online Giving / Hosted Payment Link
├── Special Projects
└── Giving Page & Notifications
```

### Important payment-link correction

The existing public Giving code can append:

```text
name
email
phone
purpose
amount
currency
```

into the checkout URL query string.

Do **not** retain that behavior as the default.

URLs can leak through:

- browser history;
- analytics;
- referrer logs;
- screenshots;
- support logs.

Recommended Cloudflare implementation:

```text
Hosted payment link only
```

or:

```text
browser
→ Worker creates secure payment session
→ Worker redirects to gateway
```

If query parameters are ever used, keep them to non-sensitive values such as:

```text
amount
currency
purpose/code
```

and only when the payment provider explicitly documents them.

Default:

```text
appendDonorParams = false
```

---

# 10. Strong idea #8 — BaaS Settings UI

The branch creates a dedicated Super Admin infrastructure panel with:

- active backend badge;
- connectivity testing;
- latency;
- sync status;
- manual reconcile;
- provider cards.

## Decision

**ADAPT THE UI, NOT THE SWITCHER.**

The Cloudflare equivalent should become:

# `System Status`

Example:

```text
Cloudflare Platform
────────────────────────────
Public Worker           Healthy
Admin Worker            Healthy
D1                      Healthy
R2 Public Content       Healthy
R2 Media                Healthy

Published Version       142
Last Public Publish     2 mins ago
Pending Publish Jobs    0
Last Backup             Today 02:00
Schema Version          0007
Deployment Version      abc1234

[ Run Diagnostics ]
[ Retry Pending Publish ]
[ View Audit ]
```

This is more useful than allowing a browser to decide which production database is active.

---

# 11. Strong idea #9 — Sync status/outbox UX

The branch's sync panel visualizes:

```text
parity
pending outbox
last sync
reconcile
```

The underlying browser synchronization design should not be used, but the operational UI concept is excellent.

## Decision

**ADAPT TO THE CLOUDLFARE OUTBOX.**

Our Cloudflare architecture already specifies a server-side D1 table:

```text
publish_jobs
```

for reliable D1 → R2 publication.

The CMS status panel can show:

```text
Pending publishes
Failed publishes
Last successful snapshot
Latest public version
Retry button
```

This provides genuine operational visibility without creating a second writable database.

---

# 12. Strong idea #10 — Explicit Super Admin bypass

The branch adds `superadmin-write-access-fix.sql` to ensure Super Admins cannot accidentally lose permissions because of incomplete role-permission mappings.

The principle is sound:

> A valid canonical Super Admin role should have explicit full access.

## Decision

**ADAPT TO CLOUDFLARE RBAC.**

In the Worker authorization middleware:

```ts
if (profile.role_key === "super_admin") {
  return allow();
}
```

Then normal permission checks apply to other roles.

Do **not** adopt the legacy aliases:

```text
superadmin
admin
```

as equivalent privileged roles.

Use one canonical role:

```text
super_admin
```

Migration tooling should normalize legacy aliases once.

This avoids accidentally granting full system control to an account merely labeled `admin`.

---

# 13. Do not adopt — one-click runtime production provider switching

The branch stores the active provider in browser `localStorage`.

That means the switch is **per browser**, not globally authoritative.

One Super Admin clicking:

```text
Set PocketBase Active
```

does not necessarily change what every visitor's browser uses.

This creates a serious conceptual problem:

```text
Browser A → Supabase
Browser B → PocketBase
Browser C → repository fallback
```

That contradicts the project's source-of-truth principle.

## Decision

**REJECT.**

Production provider changes must be:

```text
version-controlled
staged
deployed
observable
reversible
```

not a local browser preference.

---

# 14. Do not adopt — browser localStorage content journal as authority

`SyncCoordinator` stores full content snapshots in:

```text
pdcm_content_journal
```

inside browser `localStorage`.

It can then use that browser journal to repopulate another backend if the source backend is offline.

This is unsafe as an authoritative recovery mechanism.

Reasons:

1. browser localStorage is user-modifiable;
2. each browser has a different copy;
3. localStorage is not an organizational backup;
4. it can be stale;
5. it can contain partial content;
6. XSS can access it;
7. it is not centrally auditable;
8. a browser should never become the authoritative origin of production content.

## Decision

**REJECT.**

Cloudflare recovery authority should be:

```text
D1
+
content_history
+
D1 Time Travel
+
private R2 backups
```

Browser fallback remains read-only.

---

# 15. Do not adopt — client-side mutation outbox

The branch stores pending CMS writes in browser localStorage:

```text
pdcm_mutation_outbox
```

## Decision

**REJECT.**

This may persist administrative content after logout or browser close and creates an untrusted write queue on the client.

Use the server-side D1 outbox:

```text
publish_jobs
```

for D1 → R2 publishing.

CMS writes should be considered successful only after the authoritative D1 transaction commits.

---

# 16. Do not adopt — symmetric multi-master database synchronization

The branch attempts:

```text
Supabase ↔ PocketBase
```

bidirectional reconciliation using timestamps.

This is unnecessarily dangerous for this project.

Problems include:

- two writable sources of truth;
- last-timestamp-wins conflict loss;
- differing provider clocks/version semantics;
- no global lock;
- two browsers can have different local journals;
- retries may duplicate operations;
- session credentials are not naturally valid across both providers;
- backend-specific security semantics differ.

## Decision

**REJECT.**

Cloudflare design remains:

```text
ONE transactional source:
D1
```

with:

```text
R2 = derived public/read/backup copy
```

not a second writable source.

---

# 17. Do not adopt — browser opportunistic mirroring

`SyncCoordinator.mirrorToSecondary()` attempts to write the same content to all configured secondary providers from the browser.

## Decision

**REJECT.**

The browser should not coordinate infrastructure replication.

If replication/export is needed:

```text
Admin Worker
→ server-side job
→ controlled target
```

with server-held credentials, audit, retries and idempotency.

---

# 18. Do not adopt — PocketBase / Fly.io / Docker

The branch includes detailed PocketBase deployment guidance using:

```text
Docker
Fly.io
persistent volume
PocketBase
SMTP
```

This does not fit the now-approved direction:

```text
Cloudflare Workers
D1
Access
R2
```

It also reintroduces:

- a server/runtime to maintain;
- persistent volume responsibility;
- separate auth service;
- SMTP responsibility;
- another vendor;
- another deployment surface.

## Decision

**ARCHIVE AS HISTORICAL RESEARCH ONLY.**

Do not merge it into the active target architecture.

---

# 19. Concrete compatibility defects found

The branch passes its static/mock QA suites, but several implementation details are not compatible with the current hardened CMS contract.

## 19.1 Supabase chapel RPC argument mismatch

The branch's `SupabaseProvider` sends concepts such as:

```text
p_chapel_id
p_payload
```

while the current chapel-scoped migrations use canonical arguments such as:

```text
p_chapel_key
p_chapel_data
```

This can break chapel-scoped writes.

The broadcast and sermon scoped functions likewise need exact current RPC signatures.

**Conclusion:** do not merge the provider implementation blindly.

## 19.2 PocketBase chapel model mismatch

`PocketBaseProvider.updateChapelContent()` checks:

```text
chapelData.chapels[chapelId]
```

but the stabilized canonical chapel model uses:

```text
chapels.details[chapelId]
```

A chapel update can therefore silently no-op.

## 19.3 PocketBase security rules are weaker than current CMS requirements

The supplied migration guide proposes broad authenticated write rules for `site_content`.

That does not reproduce the server-enforced chapel scope model we deliberately introduced.

Client-side filtering is not sufficient.

## 19.4 "Provider-agnostic" ContentService still contains Supabase fallback logic

If the adapter is unavailable, `ContentService` can still construct a Supabase REST request directly.

This undermines the abstraction.

## 19.5 Public pages load every backend implementation

The branch adds scripts such as:

```text
config.js
syncCoordinator.js
backendAdapter.js
supabaseProvider.js
pocketbaseProvider.js
```

to every public page.

That makes visitors download backend/auth/failover code they do not need.

Cloudflare should be much thinner:

```text
contentService.js
+
small public Cloudflare client
```

only.

---

# 20. Documentation organization

The branch moves a large number of historical documents into:

```text
change_track/
```

The intention—cleaning the root—is good.

However, the Cloudflare architecture already specifies a clearer long-term structure:

```text
docs/
├── architecture/
├── security/
├── migration/
├── features/
└── release-notes/
```

## Decision

**DO NOT ADOPT `change_track/` AS THE NEW STANDARD.**

Useful BaaS documents can be preserved as historical design material under:

```text
docs/archive/backend-agnostic/
```

if desired.

---

# 21. Recommended Cloudflare adaptation

The branch gives us an opportunity to improve the Cloudflare migration plan before Stage 2.

Recommended new structure:

```text
js/data/
├── publicDataClient.js
├── repositoryFallbackProvider.js
└── legacySupabaseProvider.js        # migration only

admin/
└── adminApiClient.js

cloudflare/
├── public-worker/
├── admin-worker/
└── shared/
    ├── auth.js
    ├── permissions.js
    ├── scopes.js
    ├── validation.js
    ├── logging.js
    └── errors.js
```

During migration:

```text
ContentService
   ↓
PublicDataClient
   ├── Supabase migration provider
   └── Cloudflare provider
```

The provider is selected by deployed environment configuration, **not localStorage**.

After cutover:

```text
ContentService
   ↓
Cloudflare provider
   ↓
R2/public Worker
```

The legacy Supabase provider is deleted after the observation period.

---

# 22. Recommended Cloudflare System Status panel

Repurpose the co-developer's BaaS panel into:

```text
⚙ System Status
```

Super Admin only.

Display:

```text
Environment             Staging / Production
Public Worker           Healthy
Admin Worker            Healthy
Database                D1
D1 Health               Healthy
Public Snapshot          R2
Current Content Version  142
Pending Publish Jobs     0
Last Publish             1 min ago
Last Backup              02:00 UTC
Schema Version           0007
Deployment ID            abc123
```

Actions:

```text
Run Diagnostics
Retry Failed Publish Jobs
Create Backup
View Audit
```

No:

```text
Switch Production Database
```

button.

---

# 23. Recommended implementation order from this review

Before continuing the original Cloudflare Stage 2 exactly as first drafted, fold in the good abstraction ideas:

```text
1. Cloudflare Foundation                ← already started
2. Define Cloudflare-facing data contracts
3. Add public DataClient abstraction
4. Add AdminApiClient abstraction
5. Build D1 base schema
6. Build Access/JWT middleware
7. Build RBAC/scope middleware
8. Adapt System Status UI
9. Build D1 publish_jobs outbox
10. Build R2 public snapshot path
11. Import Supabase data into staging
12. Migrate ContentService
13. Migrate Admin writes
14. Full regression
15. Production cutover
```

---

# 24. Final recommendation

Do not cherry-pick the three BaaS commits wholesale.

Instead:

### Bring forward directly

- `.gitignore` credential-hardening patterns;
- log-redaction concept;
- data-provider interface concept;
- fail-fast read resilience concept;
- backend/config contract test philosophy;
- Giving Admin UX redesign.

### Rewrite for Cloudflare

- provider adapter;
- configuration manager;
- diagnostics UI;
- sync status;
- Super Admin full-access handling.

### Leave behind

- PocketBase;
- Fly.io;
- Docker;
- BaaS runtime switching;
- localStorage content journal;
- localStorage mutation outbox;
- browser mirroring;
- multi-master bidirectional backend sync.

The co-developer's most valuable contribution is **not PocketBase itself**.

It is the recognition that:

> **the website UI and ContentService should not know or care which infrastructure implements the content contract.**

That principle makes the Cloudflare migration cleaner and reduces future vendor lock-in.

We should preserve that principle while keeping **one authoritative backend at a time**.
