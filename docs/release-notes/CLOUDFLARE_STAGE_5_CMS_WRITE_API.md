# Cloudflare Stage 5 — CMS Read/Write APIs

Moves the Cloudflare staging CMS from Supabase Auth/RPC persistence to
Cloudflare Access + D1.

Includes section-level optimistic concurrency, transactional D1 batch writes,
durable audit/request correlation, publish jobs, chapel-scoped mutation
endpoints, D1 Admin-role/invitation APIs, automatic Access invitation claiming,
and Access-protected hosting of the existing CMS interface.

Production remains untouched.
