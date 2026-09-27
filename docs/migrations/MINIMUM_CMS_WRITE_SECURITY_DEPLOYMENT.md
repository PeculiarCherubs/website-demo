# Minimum CMS Write Security — Deployment Checklist

- [ ] Create/select Supabase Auth CMS user
- [ ] Copy Auth user UUID
- [ ] Back up current RLS policy/grant query results
- [ ] Run `supabase/migrations/minimum-cms-write-security.sql`
- [ ] Replace UUID in `supabase/migrations/authorize-cms-admin.sql`
- [ ] Run `authorize-cms-admin.sql`
- [ ] Confirm `Allow public all operations` no longer exists
- [ ] Confirm `anon` has SELECT only on `site_content`
- [ ] Run `verify-anonymous-write-blocked.sql` and confirm it fails as expected
- [ ] Deploy the accompanying code build
- [ ] Open `/admin/`
- [ ] Sign in with CMS Auth email/password
- [ ] Confirm unauthorized Auth account cannot enter CMS
- [ ] Save one harmless content edit
- [ ] Confirm public site reflects the save
- [ ] Sign out and confirm portal locks
- [ ] Confirm public site remains readable while signed out
