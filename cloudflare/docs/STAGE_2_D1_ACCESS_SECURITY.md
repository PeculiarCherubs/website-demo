# Stage 2 — D1 Base Schema + Cloudflare Access Security Foundation

## Objective

Stage 2 creates the real D1 application schema and proves the new Admin
authentication/authorization boundary before any CMS write endpoint is moved
away from Supabase.

At the end of Stage 2:

```text
Cloudflare Access
      ↓
Access JWT
      ↓
Admin Worker validates JWT
      ↓
D1 cms_admins
      ↓
role
      ↓
permissions
      ↓
resource scope
```

Supabase remains the live CMS backend during this stage.

---

## 1. Install the new dependency

Inside `cloudflare/`:

```cmd
npm install
```

Stage 2 adds the official-style `jose` JWT validation dependency.

---

## 2. Run the Stage 2 source check

```cmd
npm run check:stage2
```

Expected:

```text
Cloudflare Stage 2 check: PASS
D1 schema, RBAC seed and Access-JWT validation foundation are present.
```

---

## 3. Apply migrations locally

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-staging --local --config wrangler.admin.staging.jsonc
```

Expected new migrations:

```text
0002_application_schema.sql
0003_cms_rbac_seed.sql
```

---

## 4. Verify local schema

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --local --config wrangler.admin.staging.jsonc --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected application tables include:

```text
broadcasts
chapels
cms_admin_scopes
cms_admins
cms_permissions
cms_role_permissions
cms_roles
content_history
publish_jobs
schema_meta
sermons
site_sections
```

---

## 5. Apply migrations to remote STAGING

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc
```

Do not apply any of this to a production D1 database yet.

---

## 6. Verify RBAC seed

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --command "SELECT role_key,label FROM cms_roles ORDER BY sort_order;"
```

You should see:

```text
super_admin
content_manager
communications_editor
ministry_editor
chapel_content_manager
giving_editor
site_editor
viewer
```

---

## 7. Deploy the STAGING Admin Worker

Deploy:

```cmd
npx wrangler deploy --config wrangler.admin.staging.jsonc
```

This creates:

```text
peculiar-cherubs-admin-staging
```

---

## 8. Protect the Worker with Cloudflare Access

In the current Cloudflare dashboard:

```text
Workers & Pages
→ peculiar-cherubs-admin-staging
→ Access
→ Protect this Worker behind Access
```

Choose:

```text
All traffic
```

Use a restrictive policy such as your Cloudflare account or explicitly
approved identities. Do not use `Everyone`.

Worker-level Access protects the Worker's associated Worker/preview/custom
domain requests before the Worker code executes.

---

## 9. Native Worker Access identity

The Stage 2 Worker uses Cloudflare's current native Worker Access API:

```js
ctx.access
await ctx.access.getIdentity()
```

No `TEAM_DOMAIN`, `POLICY_AUD`, JWK download or manual JWT parsing is required
for this Worker-level Access configuration.

If Access is not applied to the Worker, `ctx.access` is undefined and the
Worker fails closed.

---

## 10. Test `/api/identity`

After Access is enabled, open:

```text
https://<your-staging-worker>.workers.dev/api/identity
```

Cloudflare should require sign-in before the Worker executes.

After successful sign-in, the endpoint should return:

```json
{
  "ok": true,
  "identity": {
    "subject": "...",
    "email": "...",
    "name": "...",
    "aud": "..."
  },
  "environment": "staging"
}
```

Do not publish or share Access cookies/tokens.

The returned `subject` and `email` are safe inputs for the next bootstrap step.

---

## 11. Why the Worker still has application authorization

Cloudflare Access proves that the requester is an authenticated identity.

That identity is **not** automatically a CMS administrator.

The Worker still loads:

```text
cms_admins
→ role
→ permissions
→ scopes
```

from D1 before `/api/me` or future CMS operations are authorized.

---

## 12. Access troubleshooting

If you see:

```text
access_required
```

the request reached the Worker without Worker-level Access context. Check the
Worker's Access tab and ensure protection is enabled for production traffic.

If you see:

```text
access_identity_unavailable
```

Cloudflare Access ran, but the Worker could not retrieve the identity.

The old manual errors:

```text
access_token_invalid
access_token_required
```

are no longer part of the native Worker-level Access implementation.

## 13. Bootstrap the first D1 Super Admin

Copy the `subject` and `email` returned from `/api/identity`.

Generate a reviewed SQL bootstrap file:

```cmd
node scripts/make-bootstrap-admin.mjs "YOUR_ACCESS_SUBJECT" "YOUR_EMAIL" "YOUR NAME"
```

This creates:

```text
scripts/bootstrap-super-admin.generated.sql
```

Review it.

Then apply it to STAGING only:

```cmd
npx wrangler d1 execute peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc --file scripts/bootstrap-super-admin.generated.sql
```

The generated file is local operational material and should not be committed.

---

## 14. Verify `/api/me`

Refresh:

```text
/api/me
```

Expected shape:

```json
{
  "ok": true,
  "profile": {
    "role_key": "super_admin",
    "role_label": "Super Admin",
    "permissions": [...],
    "scope_type": "global",
    "chapel_scopes": []
  }
}
```

The Super Admin role has explicit application-level full access.

---

## 15. Security properties now proven

Stage 2 proves:

- Cloudflare Access authenticates before the Admin Worker;
- the Worker independently verifies the signed Access JWT;
- an Access-authenticated user is not automatically a CMS Admin;
- `cms_admins.enabled = 0` can disable application access;
- roles and permissions are stored in D1;
- chapel scopes are stored in D1;
- Super Admin has canonical full access;
- all future CMS APIs can reuse the same authorization middleware;
- no browser has direct D1 write access.

---

## 16. What is deliberately NOT migrated yet

Still on Supabase:

- CMS HTML/auth flow;
- CMS content write APIs;
- live website content;
- chapels content;
- sermons;
- broadcasts;
- publications;
- events;
- Giving;
- Admin Access UI.

That migration starts only after Stage 2 security passes.

---

## Stage 2 completion checklist

- [ ] `npm install` succeeds.
- [ ] `npm run check:stage2` passes.
- [ ] 0002 applies locally.
- [ ] 0003 applies locally.
- [ ] local schema query is correct.
- [ ] 0002 applies to remote staging.
- [ ] 0003 applies to remote staging.
- [ ] RBAC roles are present.
- [ ] staging Admin Worker deploys.
- [ ] Access protects the Worker.
- [ ] Worker-level Access is enabled for all staging traffic.
- [ ] Worker redeployed after the native Access update.
- [ ] `/api/identity` returns validated identity.
- [ ] first Super Admin bootstrapped.
- [ ] `/api/me` returns Super Admin profile.
- [ ] unauthenticated access is blocked.

After that proceed to:

> **Stage 3 — Supabase → D1 Import Rehearsal**
