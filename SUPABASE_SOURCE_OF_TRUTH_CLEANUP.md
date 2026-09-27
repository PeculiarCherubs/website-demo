# Supabase Source-of-Truth Cleanup

This update follows **CMS schema stabilization**.

## Architecture after this change

### Live content

`Supabase site_content` is the authoritative live content source.

When all sections required for a page are returned successfully, the public website uses
those Supabase sections directly. `content/site-content.json` is not merged into them.

### Fallback content

`content/site-content.json` remains in the repository only as:

- emergency runtime fallback
- version-controlled backup
- seed/reference data
- disaster-recovery baseline

It is used only when the live Supabase sections required for a page cannot be loaded.

## Important behavior changes

### 1. Deleted CMS values stay deleted

Previously the public loader did:

`site-content.json + Supabase -> merged content`

That meant an old local field could reappear after being intentionally removed in the CMS.

The public loader now does:

`Supabase -> website`

and only falls back to:

`site-content.json -> website`

when the live page load fails.

### 2. Missing Supabase sections are treated as a live-load failure

A batch DB request now validates that every requested `site_content` row exists.
If any required row is missing, the page falls back to the repository JSON rather than
silently combining live and local sources.

### 3. Admin fallback is read-only

If the Admin Portal cannot load the complete live content model from Supabase:

- it displays the repository fallback
- it shows a visible read-only warning
- CMS writes are blocked

This prevents an outage or incomplete database from turning the backup JSON into an
accidental live write source.

### 4. Repository-to-CMS migration controls are retired

Removed from the Admin UI and JavaScript:

- `Load Repository Fallback`
- `Standardize CMS from Repository`

The migration phase is considered complete.

### 5. Successful writes update the live ContentService cache

After a successful Admin upsert, the ContentService cache is updated immediately so a
same-session read does not continue showing stale pre-save content.

### 6. Failed writes restore authoritative state

If a write fails, the Admin Portal force-refreshes from Supabase. If Supabase has become
unavailable, the portal enters read-only fallback mode.

### 7. Settings saves now respect write failures

Leadership headers, Quick Links headers, Giving settings, payment gateway settings, and
Site/Home settings no longer display a success message after a failed Supabase write.

## Deliberately not changed in this update

- Supabase Auth / Row Level Security design
- fallback financial data verification
- repository cleanup / stale merge files
- footer/navigation visual consistency
- CSS/UI standardization

Those remain separate stabilization workstreams.
