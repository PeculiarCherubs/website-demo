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

At this point `TEAM_DOMAIN` and `POLICY_AUD` still contain placeholders.
That is intentional.

Deploy:

```cmd
npx wrangler deploy --config wrangler.admin.staging.jsonc
```

This creates:

```text
peculiar-cherubs-admin-staging
```

The Worker itself remains fail-closed because the Access values are not yet
configured.

---

## 8. Protect this Worker with Cloudflare Access

Current Cloudflare dashboard path:

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

For the first staging test, use the smallest possible allow policy:

```text
Cloudflare account
```

or another explicitly approved identity policy.

Do not use `Everyone`.

Worker-level Access protects the Worker's production/preview URLs together.

---

## 9. Find the Team Domain

If Zero Trust is not configured yet:

```text
Cloudflare Dashboard
→ Zero Trust
```

Create the Zero Trust organization on the Free plan and choose a team name.

Cloudflare automatically provides:

```text
<team-name>.cloudflareaccess.com
```

The dashboard exposes it under:

```text
Zero Trust
→ Settings
→ Team name and domain
```

For the Worker configuration, include the scheme:

```text
https://<team-name>.cloudflareaccess.com
```

---

## 10. Find the Access AUD

Open the Access application that Cloudflare created for the protected Worker.

Copy the:

```text
Application Audience (AUD) Tag
```

Cloudflare documents the AUD as stable until the Access application is deleted
or recreated.

---

## 11. Update the STAGING Admin config

Open:

```text
wrangler.admin.staging.jsonc
```

Replace:

```text
REPLACE_WITH_HTTPS_TEAM_DOMAIN
REPLACE_WITH_ACCESS_AUD
```

with the actual values.

Example shape:

```jsonc
"vars": {
  "ENVIRONMENT": "staging",
  "TEAM_DOMAIN": "https://your-team.cloudflareaccess.com",
  "POLICY_AUD": "your-real-audience-tag"
}
```

These are identifiers/configuration, not CMS passwords.

---

## 12. Redeploy after configuring Access

```cmd
npx wrangler deploy --config wrangler.admin.staging.jsonc
```

Open the Worker URL in your browser.

Cloudflare Access should require authentication.

After signing in, visit:

```text
/api/identity
```

The response should include your validated:

```text
subject
email
```

Do not publish or share the Access JWT itself.

---

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
- [ ] TEAM_DOMAIN configured.
- [ ] POLICY_AUD configured.
- [ ] Worker redeployed.
- [ ] `/api/identity` returns validated identity.
- [ ] first Super Admin bootstrapped.
- [ ] `/api/me` returns Super Admin profile.
- [ ] unauthenticated access is blocked.

After that proceed to:

> **Stage 3 — Supabase → D1 Import Rehearsal**
