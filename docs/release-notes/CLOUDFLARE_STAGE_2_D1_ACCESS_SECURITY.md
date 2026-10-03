# Cloudflare Stage 2 — D1 Base Schema + Access Security

Introduces the real D1 application schema and Cloudflare Access security
foundation while leaving the production Supabase website untouched.

## Added

- D1 relational schema for page sections, chapels, sermons and broadcasts.
- D1 CMS roles, permissions, Admin identities and chapel scopes.
- Durable content-history table.
- D1 → R2 publish-job outbox table.
- Stabilized CMS role/permission seed.
- Native Cloudflare Worker Access identity using `ctx.access.getIdentity()`.
- D1 CMS profile loading.
- `/api/identity` bootstrap endpoint.
- `/api/me` authorization profile endpoint.
- Staging Wrangler configurations bound to the existing D1 staging database.
- Safe first-Super-Admin bootstrap generator.
- Stage 2 validation script and deployment guide.

## Security boundary

An identity accepted by Cloudflare Access is not automatically a CMS Admin.

The Admin Worker requires:

```text
validated Worker-level Cloudflare Access identity
+
enabled cms_admins record
+
role
+
permissions
+
scope
```

before future CMS mutation endpoints will be allowed.
