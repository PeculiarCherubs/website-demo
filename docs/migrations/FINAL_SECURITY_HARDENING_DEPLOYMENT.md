# Final Security Hardening — Deployment Checklist

## Before migration

Back up the authoritative rows:

```sql
select
  key,
  data,
  updated_at,
  updated_by
from public.site_content
order by key;
```

If `updated_at` / `updated_by` do not exist yet, use:

```sql
select key, data
from public.site_content
order by key;
```

Save the result outside the repository.

## Run migration

Execute:

`supabase/migrations/final-cms-security-hardening.sql`

## Expected grant state

`site_content`:

- anon: SELECT
- authenticated: SELECT
- no browser INSERT
- no browser UPDATE
- no browser DELETE

RPC:

- `cms_upsert_site_content`: authenticated EXECUTE
- `cms_recent_content_history`: authenticated EXECUTE
- both functions enforce `is_cms_admin()` internally

## Verify live

Run:

`supabase/audits/final-security-audit.sql`

Then sign in through `/admin/`.

Make one small safe edit, save, and verify:

```sql
select key, updated_at, updated_by
from public.site_content
order by updated_at desc;

select *
from public.cms_recent_content_history(20);
```

## Rollback approach

Do not casually drop `content_history` because it is evidence of prior changes.

If the RPC path needs to be temporarily rolled back:

1. keep RLS enabled;
2. restore the earlier CMS-admin write policies;
3. restore authenticated INSERT/UPDATE/DELETE grants;
4. revert `js/admin.js` to the last known-good checkpoint;
5. document the reason and duration of the rollback.

Prefer fixing the RPC path instead of restoring broad direct-write access.

## RBAC verification

Existing rows in `cms_admins` are automatically assigned `super_admin` during
the migration so the currently approved Admin account retains full access.

After migration:

1. sign in with the existing approved Admin;
2. confirm the header identifies the **Super Admin** role;
3. confirm **Admin Access** is visible;
4. create a second Supabase Auth user for testing;
5. assign that user a restricted role from the CMS;
6. sign in as the restricted user;
7. confirm unauthorized CMS tabs are not visible;
8. confirm an attempted unauthorized RPC save returns `cms_permission_denied`;
9. confirm an allowed section can still be edited successfully.

Do not test by changing the only Super Admin to a restricted role.

## Anonymous-write verification

The final security audit checks direct write privileges with
`has_table_privilege(...)` instead of deliberately executing a forbidden
anonymous UPDATE. The expected result is `false` for INSERT, UPDATE and DELETE
for both `anon` and `authenticated`.

Do not follow a generic Supabase hint suggesting `GRANT UPDATE ... TO anon`;
that would reverse the security hardening.
