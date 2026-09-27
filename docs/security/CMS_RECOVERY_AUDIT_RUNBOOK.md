# CMS Recovery & Audit Runbook

## If a bad content edit is discovered

1. Identify the affected section key.
2. Query recent change metadata:

```sql
select *
from public.cms_recent_content_history(100);
```

3. Inspect the matching `content_history` row in Supabase SQL Editor to compare
   `old_data` and `new_data`.
4. Copy the known-good `old_data`.
5. Restore it through the authenticated CMS or an explicitly authorized SQL
   operation.
6. Verify the public page.
7. Record why the restore was needed.

## If Supabase is unavailable

The public site may use repository fallback content.

The Admin Portal must remain read-only while fallback mode is active.

Do not "fix" an outage by loading repository JSON back into a healthy database
without deliberate review.

## If the repository fallback is needed for disaster recovery

1. Confirm Supabase is actually unavailable/corrupted.
2. Export or snapshot the current database first if possible.
3. Review `content/site-content.json` for freshness and sensitive placeholders.
4. Restore section-by-section, not as an unreviewed blind overwrite.
5. Re-run all content/navigation audits.
6. Verify public pages and Admin.
7. Document the recovery event.

## Shared-history incident

If a secret or genuinely confidential value was committed to Git history, follow
`docs/security/GIT_HISTORY_DATA_POLICY.md` before rewriting shared history.
