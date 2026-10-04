# Stage 5 — Admin Route Redirect Hotfix

Fixes an infinite redirect at `/admin/`.

Cloudflare Static Assets uses `auto-trailing-slash` HTML handling by default.
The previous Worker implementation handled `/admin/` by asking the asset
binding for `/admin/index.html`. Cloudflare canonicalizes that file URL back to
`/admin/`, which sent the browser through the same Worker branch again.

The Worker now passes `/admin/` directly to the asset binding, allowing Static
Assets to resolve the folder index internally without a redirect loop.
