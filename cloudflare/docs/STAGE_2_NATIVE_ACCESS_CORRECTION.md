# Stage 2 Native Cloudflare Access Correction

## Why this correction exists

The first Stage 2 build manually parsed `Cf-Access-Jwt-Assertion` and required
the Zero Trust team domain plus application AUD in Worker configuration.

Cloudflare introduced native Worker-level Access identity in August 2026.
When Access protects a Worker directly, Cloudflare now exposes:

```js
ctx.access
ctx.access.getIdentity()
```

and documents that no extra JWT parsing configuration is required.

The migration therefore uses the native API.

## Removed

```text
TEAM_DOMAIN
POLICY_AUD
jose
manual JWK loading
manual JWT issuer/audience verification
```

## Preserved

The application authorization model remains unchanged:

```text
Cloudflare Access identity
        ↓
D1 cms_admins
        ↓
role
        ↓
permissions
        ↓
chapel scope
```

Access authentication and CMS authorization remain separate security layers.
