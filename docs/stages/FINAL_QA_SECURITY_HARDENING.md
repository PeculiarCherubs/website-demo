# Final QA & Full Security Hardening

## Scenario

The project has completed:

- CMS Schema Stabilization
- Supabase Source-of-Truth Cleanup
- Chapels Data-Model Canonicalization
- Minimum CMS Write Security
- Content & Data Integrity Cleanup
- Repository & Navigation Cleanup
- CSS / UI Standardization

This final stage does not introduce a new content model or redesign. It closes the
remaining operational and security gaps around a now-stable application.

## Security decisions

### 1. Direct browser table writes are removed

Authenticated browsers retain `SELECT` access to `site_content`, but no longer
receive direct `INSERT`, `UPDATE`, or `DELETE` table grants.

CMS saves are routed through:

`public.cms_upsert_site_content(...)`

The RPC is `SECURITY DEFINER` but explicitly requires `is_cms_admin()`.

This creates a single controlled write surface rather than relying on browser
table privileges.

### 2. Optimistic concurrency

`site_content` now carries:

- `updated_at`
- `updated_by`

The Admin loads each section's current `updated_at` value and sends it back with
the save request.

If another Admin has saved the same section since it was loaded, the write is
rejected with `content_conflict` and the Admin reloads the latest live content.

This prevents silent last-write-wins overwrites.

### 3. Audit trail

`content_history` records each insert/update/delete with:

- section key
- action
- timestamp
- authenticated user UUID
- previous and new JSON
- previous and new version timestamps

The table has no direct client grants.

Approved CMS admins may read recent audit metadata through:

`public.cms_recent_content_history(...)`

### 4. RLS remains defence in depth

`site_content` remains RLS-enabled with public read access.

Write policies are no longer needed for normal browser writes because direct
write grants are removed; the authorized RPC is the sole browser CMS write path.

### 5. Existing authentication remains

Admin authentication continues to use Supabase Auth.

`cms_admins` remains the explicit authorization allowlist.

## Final QA gates

Automated checks now cover:

- content integrity
- repository/navigation integrity
- CSS/UI integrity
- security-path integrity
- required final routes/content sections

Run:

```bash
node scripts/check-content-integrity.js
node scripts/check-navigation-integrity.js
node scripts/check-ui-integrity.js
node scripts/check-security-integrity.js
node scripts/check-final-qa.js
```

## Live deployment sequence

1. Back up `site_content`.
2. Run `supabase/migrations/final-cms-security-hardening.sql`.
3. Run `supabase/audits/final-security-audit.sql`.
4. Sign into the Admin Portal as an approved Admin.
5. Make one harmless content edit and save it.
6. Confirm:
   - save succeeds;
   - `updated_at` changes;
   - `updated_by` is populated;
   - `content_history` receives an UPDATE row.
7. Confirm an authenticated non-admin cannot save.
8. Confirm anonymous direct writes remain denied.
9. Exercise a concurrency conflict with two Admin sessions if possible.
10. Run the five repository validation scripts.
11. Complete desktop/mobile browser smoke testing.
12. Tag the release/checkpoint before merging to production.

## Out of scope / platform limits

### GitHub Pages security headers

A static GitHub Pages deployment cannot reliably configure all response-level
security headers in the same way as a server/CDN-managed deployment.

A future move behind a configurable CDN/host should add response headers such as
CSP, HSTS, Referrer-Policy and Permissions-Policy after testing.

### External fallback monitoring

The Admin clearly enters read-only fallback mode, but automated external alerting
requires an external notification endpoint/service. That is not fabricated in
this repository-only pass.

## Completion rule

This stage is complete when:

- hardened migration is live;
- direct browser writes are removed;
- approved Admin RPC writes work;
- non-admin/anonymous writes fail;
- audit history is recording;
- concurrency protection is verified;
- all automated checks pass;
- final route/UI smoke testing passes.

## Role-Based Access Control (RBAC)

CMS access is now role-based rather than treating every authorized account as
an unrestricted administrator.

The built-in roles are:

| Role | Intended access |
|---|---|
| Super Admin | Full CMS, Admin Access, Advanced Content, Giving, export and history |
| Content Manager | General public content, Site Settings and audit history; no Giving/Admin management/Advanced Content |
| Communications Editor | Publications, Sermons, Events and Quick Links |
| Ministry Editor | Ministries, Chapels, Bible College, Fellowships and Leadership |
| Giving Editor | Giving & Payments only |
| Site Editor | Site Settings only |
| CMS Viewer | Dashboard login with no content-write permission |

The role catalog is database-backed, so additional roles and permission
combinations can be introduced later without reverting to client-side trust.

### UI enforcement

After authentication the Admin Portal requests `cms_get_access_profile()`.

Tabs, dashboard actions, statistics, export controls and the Admin Access panel
are hidden when the current role lacks the corresponding permission.

### Database enforcement

UI hiding is not the security boundary.

`cms_upsert_site_content()` calls `cms_can_write_key()` for every save. A user
who manually calls the RPC through DevTools still cannot modify a content key
their role does not permit.

`Advanced Content` is reserved for roles with `advanced.manage` because raw
JSON editing would otherwise bypass normal CMS section boundaries.

### Admin role management

Super Admins receive an **Admin Access** panel.

The workflow is:

1. create the user's account in Supabase Authentication;
2. open **Admin Access** in the CMS;
3. enter the Auth user's email;
4. assign a CMS role.

Super Admins can subsequently change or remove CMS access.

The database prevents removing the current Admin and prevents demoting/removing
the final remaining Super Admin.
