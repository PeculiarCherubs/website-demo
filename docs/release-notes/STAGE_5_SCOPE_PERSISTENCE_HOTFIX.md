# Stage 5 — Scope Persistence Hotfix

Fixes the remaining `chapel_scope_required` failure after the checkbox selector
was introduced.

Selected chapel/HQ scopes are now held in explicit Admin UI state. The checked
DOM values remain the immediate source, while an explicit Set preserves the
selection through any re-render around a click/submit boundary.

The Cloudflare Admin client validates the selected keys before sending and
includes them as `chapel_keys` plus a compatibility `chapel_scopes` alias.

The Worker accepts `chapel_keys`, `chapel_scopes`, or `chapelKeys`, then applies
the same canonical D1 location validation and fail-closed authorization.

Admin CSS/JS asset URLs are versioned so browsers cannot combine fresh checkbox
HTML with stale JavaScript after deployment.
