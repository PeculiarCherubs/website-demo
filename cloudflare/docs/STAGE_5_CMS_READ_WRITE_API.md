# Stage 5 — Cloudflare CMS Read/Write APIs + D1 Audit/Concurrency

## Objective

Stage 5 moves the **staging CMS** away from Supabase Auth/RPC writes and onto:

```text
Cloudflare Access
        ↓
Admin Worker
        ↓
D1 RBAC / scopes
        ↓
D1 content mutation
        ↓
content_history
        ↓
publish_jobs
```

Production is still not cut over.

The Supabase implementation remains in the repository as a temporary legacy
fallback while Stage 5 is verified.

---

## Authentication

The Cloudflare staging Admin Worker is protected by Cloudflare Access.

The browser no longer performs a second Supabase email/password login on the
Cloudflare staging Admin host.

The Worker receives the authenticated Access identity through:

```js
ctx.access.getIdentity()
```

and D1 decides whether that identity has a CMS role.

Cloudflare documents that Worker-level Access authenticates a request before
the Worker runs and exposes the signed-in identity through `ctx.access`.

---

## CMS authorization

Every mutation still requires:

```text
valid Access identity
+
enabled cms_admins record
+
role permission
+
global/chapel scope
```

No browser can write directly to D1.

---

## Optimistic concurrency

Stage 5 creates:

```text
cms_section_versions
```

with one canonical concurrency token per CMS public section.

For every save:

```text
loaded version = N

UPDATE cms_section_versions
WHERE section_key = ...
  AND version = N

→ version becomes N + 1
```

If another Admin saved first, the conditional update changes zero rows and the
API returns:

```text
content_conflict
HTTP 409
```

The browser reloads the latest section rather than silently overwriting it.

This intentionally preserves the conflict semantics that existed around the
Supabase `site_content.updated_at` record.

---

## Atomic audit correlation

Each write receives a unique:

```text
request_id
```

The section-version advance, content mutation, history record and publish-job
record are sent through one D1 batch.

Cloudflare documents `D1Database.batch()` as transactional: statements execute
sequentially and the sequence is rolled back if one statement fails.

The request ID is also stored in:

```text
content_history
publish_jobs
```

so one logical CMS save can be traced across durable records.

---

## D1 audit history

`content_history` now records:

```text
resource_type
resource_key
action
actor_subject
actor_email
before_json
after_json
request_id
from_version
to_version
metadata_json
created_at
```

Read access is exposed at:

```text
GET /api/cms/history
```

and still requires the `history.view` permission.

---

## CMS content APIs

### Read sections

```text
GET /api/cms/sections?keys=site,chapels,sermons,livestream
```

### Replace a complete section

```text
PUT /api/cms/sections/:sectionKey
```

Used by Global-scope editors.

### Scoped chapel page update

```text
PUT /api/cms/chapels/:chapelId
```

### Scoped broadcast update

```text
PUT /api/cms/broadcasts/:chapelId
```

### Scoped sermon upsert

```text
PUT /api/cms/sermons/:sermonId
```

### Scoped sermon delete

```text
DELETE /api/cms/sermons/:sermonId
```

The chapel-content/broadcast/sermon endpoints enforce D1 scope checks on the
server. UI filtering is not treated as a security control.

---

## Admin access APIs

Stage 5 also replaces the Supabase Admin-role RPCs on staging:

```text
GET    /api/cms/roles
GET    /api/cms/admins
POST   /api/cms/admins/invite
PATCH  /api/cms/admins/:subject/role
PATCH  /api/cms/admins/:subject/scopes
DELETE /api/cms/admins/:subject
```

---

## Inviting new CMS users

Cloudflare Access identity subjects are only known after a person authenticates.

Therefore Stage 5 does **not** invent Access subjects from email addresses.

A Super Admin creates:

```text
cms_admin_invites
```

by email.

When that email successfully authenticates through Cloudflare Access for the
first time, `/api/me` claims the invitation and creates the real:

```text
cms_admins.access_subject
```

record.

This cleanly separates:

```text
Cloudflare Access authentication
from
Peculiar Cherubs CMS authorization
```

The Cloudflare Access policy must still permit that person's email/account to
reach the Admin Worker.

---

## Admin UI hosting

The staging Admin Worker now serves the existing `/admin/` portal as
Access-protected Static Assets with:

```text
assets.run_worker_first = true
```

This is deliberate: the Worker must execute before assets are served so Access
identity and CMS checks remain part of the Admin application boundary.

The public staging Worker still returns 404 for `/admin/`.

---

# Deployment

From `cloudflare/`:

```cmd
npm run check:stage5
```

Then apply the new migration locally:

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-staging --local --config wrangler.admin.staging.jsonc
```

Expected:

```text
0006_cms_write_api_foundation.sql
```

Then remote staging:

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc
```

---

# Deploy the Admin Worker

```cmd
npx wrangler deploy --config wrangler.admin.staging.jsonc
```

The existing Cloudflare Access protection must remain enabled.

Open:

```text
https://peculiar-cherubs-admin-staging.peculiarcherubs.workers.dev/admin/
```

You should go through Cloudflare Access and then directly into the CMS.

There should be no second Supabase password prompt.

---

# First read checks

While signed in through Cloudflare Access, open:

```text
/__health
```

Expected:

```text
stage = cloudflare-stage-5
cms_ui_enabled = true
cms_write_api = true
```

Then:

```text
/api/me
```

Your existing Super Admin profile should still be present.

Then:

```text
/api/cms/sections?keys=site,chapels,sermons,livestream
```

Every section should include:

```text
data
updated_at
version
```

---

# First controlled write test

Use staging only.

A simple test is to change a harmless visible text value in the CMS, for
example a temporary Home-page sentence:

```text
Original
→ Temporary Stage 5 test
→ Save
```

Confirm:

1. CMS save succeeds.
2. Refreshing the Admin portal shows the changed value.
3. Public staging shows the changed value from D1.
4. `GET /api/cms/history?limit=10` contains the mutation.
5. Change the value back through the CMS.
6. History contains the reversal as a second mutation.

Do not use production content for destructive testing.

---

# Concurrency test

Open the same CMS section in two browser tabs.

1. Both tabs load version `N`.
2. Save a change in Tab A.
3. Tab A advances the section to `N + 1`.
4. Attempt to save the stale Tab B copy.
5. Tab B must receive a conflict and reload rather than overwrite Tab A.

Expected user-facing behavior:

```text
Save conflict: another Admin changed this content.
Reloading the latest version.
```

---

# Scope test

For a Chapel Content Manager:

- assigned location pages should be editable;
- assigned location broadcasts should be editable;
- assigned location sermons should be editable;
- another chapel/HQ must return `chapel_scope_denied`;
- Global-only sections must remain unavailable.

The server is the authority even if browser controls are manipulated.

---

# Admin invitation test

From Super Admin:

1. Add an approved test email.
2. Assign a role and scope.
3. Confirm it appears as Pending Access.
4. Ensure Cloudflare Access policy also allows that identity.
5. Sign in as that identity.
6. `/api/me` should claim the invitation.
7. The pending record should become an active CMS Admin.

---

# Stage 5 completion criteria

- [ ] `npm run check:stage5` passes.
- [ ] migration 0006 applies locally.
- [ ] migration 0006 applies to remote staging.
- [ ] Admin Worker redeploys.
- [ ] Cloudflare Access still protects it.
- [ ] `/admin/` opens after Access authentication.
- [ ] no second Supabase password login is required.
- [ ] `/api/me` returns the D1 CMS profile.
- [ ] CMS sections load from D1.
- [ ] generic section save works.
- [ ] Peculiar HQ/chapel scoped save works.
- [ ] sermon save/delete works.
- [ ] broadcast save works.
- [ ] public staging reflects CMS D1 changes.
- [ ] content history records writes.
- [ ] stale-version write returns a conflict.
- [ ] chapel scope enforcement is verified.
- [ ] Admin invitation/role/scope flow works.
- [ ] public staging still does not expose `/admin/`.
- [ ] production remains untouched.

After Stage 5:

> **Stage 6 — Media/R2 + Publish Pipeline + Production Cutover Preparation**

---

## Important Access + Static Assets implementation detail

Cloudflare Worker-level Access normally exposes:

```js
ctx.access.getIdentity()
```

However, Cloudflare documents a limitation for Workers that use **Static
Assets**: the internal assets router still enforces Access, but it does **not**
pass `ctx.access` through to the user Worker.

Stage 5 hosts the Admin UI as Worker Static Assets, so authentication uses a
hybrid implementation:

```text
ctx.access available
→ use native identity

ctx.access unavailable because Static Assets router is present
→ validate Cf-Access-Jwt-Assertion
→ verify Cloudflare signing key
→ verify trusted issuer/team domain
→ verify Admin Access application AUD
→ use verified identity
```

The JWT fallback is not a second login and does not weaken the Access policy.
It recovers the identity that the Static Assets router currently cannot expose
through `ctx.access`.

The trusted staging identifiers are configured in:

```text
wrangler.admin.staging.jsonc
```

as:

```text
TEAM_DOMAIN
POLICY_AUD
```

They are identifiers, not passwords or service-token secrets.
