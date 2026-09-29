# Minimum CMS Write Security

## Scenario

The `site_content` table already had Row Level Security enabled, but the live
configuration contained a policy equivalent to:

```text
role: public
command: ALL
using: true
with check: true
```

The `anon` and `authenticated` database roles also held broad table privileges,
including INSERT, UPDATE and DELETE.

That meant RLS was technically enabled but did not provide the write boundary
required for a production CMS.

The Admin Portal also used a hard-coded client-side passcode and performed writes
with the public Supabase anon token.

---

## Intent

Create a minimum production-oriented write boundary without introducing an
unnecessary server/Edge layer.

The target model is:

```text
Public visitor (anon)
    ↓
SELECT site_content only

Authenticated ordinary user
    ↓
SELECT site_content only

Authenticated approved CMS admin
    ↓
SELECT + INSERT + UPDATE + DELETE
```

Authorization is enforced by PostgreSQL RLS, not by hiding buttons in the browser.

---

## Authentication Decision

The hard-coded `pdcm2026` passcode is removed.

Admin now signs in through Supabase Auth using email/password credentials.

The browser receives the normal authenticated user JWT. That JWT is then sent to
Supabase for CMS writes.

The public anon key remains in frontend code because it is a public project key;
it is no longer sufficient to perform writes after the RLS migration.

---

## Authorization Decision

A dedicated table is introduced:

```text
public.cms_admins
└── user_id → auth.users.id
```

Only users whose Supabase Auth UUID is explicitly listed in `cms_admins` are CMS
administrators.

The helper function:

```text
public.is_cms_admin()
```

checks the authenticated `auth.uid()` against that allowlist.

The function is used both by the Admin login verification flow and by RLS write
policies.

`cms_admins` itself is not exposed for client reads or writes.

---

## RLS Decision

Public SELECT remains available because the website is public.

Anonymous/public writes are removed.

Policies become:

```text
anon/authenticated → SELECT → allowed

authenticated + is_cms_admin() → INSERT → allowed
authenticated + is_cms_admin() → UPDATE → allowed
authenticated + is_cms_admin() → DELETE → allowed
```

The old `Allow public all operations` policy is removed.

---

## Table-Grant Decision

The previous broad grants are revoked.

After the migration:

```text
anon
└── SELECT

authenticated
├── SELECT
├── INSERT
├── UPDATE
└── DELETE
```

Authenticated write grants alone do not make every authenticated user an editor;
RLS still requires `is_cms_admin()`.

Privileges such as TRUNCATE, TRIGGER and REFERENCES are not granted to normal
client roles.

---

## Admin Session Decision

The authenticated session is stored in `sessionStorage`, not a permanent local
passcode flag.

The Admin Portal:

1. signs in through Supabase Auth;
2. verifies `is_cms_admin()`;
3. refreshes the access token when it is close to expiry;
4. sends the authenticated JWT on write requests;
5. re-checks CMS authorization before writing;
6. locks the portal if authorization/session validation fails.

The existing source-of-truth fallback rule remains unchanged: if live content
cannot be loaded, the Admin enters read-only fallback mode.

---

## Deployment Order

This change affects both database authorization and frontend login behavior.
Use this order:

1. **Create the CMS Auth user**
   - Supabase Dashboard → Authentication → Users.
   - Create the intended administrator account.
   - Copy the user's UUID.

2. **Back up current policies/grants**
   - Keep the query results already collected for RLS policies and grants.

3. **Run `minimum-cms-write-security.sql`**
   - This removes anonymous writes and creates the CMS-admin authorization model.

4. **Authorize the Auth user**
   - Run `authorize-cms-admin.sql` after replacing `YOUR_AUTH_USER_UUID`.

5. **Verify policies and grants**
   - `anon` should have SELECT only.
   - the permissive public `ALL` policy must be gone.

6. **Run `verify-anonymous-write-blocked.sql`**
   - The anonymous UPDATE is expected to fail.

7. **Deploy this frontend/Admin build**
   - The old passcode login is no longer compatible with the secured DB.

8. **Sign in through `/admin/` with the Supabase Auth user**

9. **Make a harmless CMS edit and save**
   - Confirm the authenticated Admin write succeeds.

10. **Sign out and verify the public site still loads normally**

There is a brief maintenance window between database lockdown and deployment of
the new Admin login. The public website remains readable throughout because SELECT
access is preserved.

---

## Why No Edge Function Yet

An Edge Function is not required merely because the browser performs a write.

Supabase's intended client architecture supports authenticated browser requests
with authorization enforced by RLS.

A server/Edge layer can be added later if the CMS needs:

- service-role operations
- secret third-party credentials
- approval workflows
- server-only validation
- privileged multi-table transactions
- audit/event processing beyond normal database controls

For the present CMS, Supabase Auth + explicit admin allowlist + RLS is the smaller
and clearer minimum security boundary.

---

## Non-Goals

This feature does not:

- redesign the Admin UI
- standardize CSS
- add MFA
- add password-reset UI
- implement audit logging
- add Edge Functions
- clean repository merge scaffolding

Those can be addressed separately after the minimum write boundary is verified.
