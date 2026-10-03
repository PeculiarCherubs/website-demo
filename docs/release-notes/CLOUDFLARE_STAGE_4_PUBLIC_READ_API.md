# Cloudflare Stage 4 — Public Read API + Content Contract Parity

Adds the D1-backed public content API, reconstructs the existing website
content contract from relational D1 tables, preserves unmapped sermon and
broadcast fields during migration, injects the Cloudflare provider only on the
public staging Worker, and prevents internal/admin/infrastructure files from
being uploaded as public static assets.

Production remains on the Supabase legacy public provider until staging parity
is approved.
