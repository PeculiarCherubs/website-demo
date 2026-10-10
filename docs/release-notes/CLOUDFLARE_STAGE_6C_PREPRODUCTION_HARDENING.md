# Cloudflare Stage 6C — Pre-Production Hardening

- Replaces chapel/ministry leader `Name: Role` textarea parsing with a structured repeatable editor.
- Adds optional leader photo path, alt text and biography.
- Renders leader photographs and biographies on chapel/ministry detail pages.
- Corrects Chapel Content Manager UI so assigned chapel details are editable.
- Removes chapel/ministry Add/Delete actions from chapel-scoped users.
- Preserves Worker-side full-section vs scoped-write authorization boundaries.
- Adds production Worker configuration templates with separate production D1/R2 resources.
- Adds a cutover readiness gate and production public verification script.
- Adds backup, rollback, media migration, custom-domain and Supabase-retirement runbook.
