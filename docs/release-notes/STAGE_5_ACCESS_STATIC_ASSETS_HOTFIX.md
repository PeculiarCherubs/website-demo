# Stage 5 — Cloudflare Access / Static Assets Hotfix

Cloudflare Static Assets are served through an internal router that does not
propagate `ctx.access` to the user Worker, even though Access still protects the
application.

The Admin Worker now uses a hybrid identity path:

1. native `ctx.access.getIdentity()` when available;
2. verified `Cf-Access-Jwt-Assertion` fallback when Static Assets suppress
   `ctx.access`.

The fallback validates the trusted Cloudflare Access issuer, signing keys and
application AUD before accepting identity claims.
