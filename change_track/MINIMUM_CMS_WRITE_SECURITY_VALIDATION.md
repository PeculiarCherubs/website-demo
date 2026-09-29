# Minimum CMS Write Security — Static Validation

- current uploaded `styles.css` preserved byte-for-byte: PASS
- `script.js` syntax: PASS
- `js/contentService.js` syntax: PASS
- `js/admin.js` syntax: PASS
- hard-coded `pdcm2026` passcode removed from Admin JavaScript: PASS
- passcode login UI removed: PASS
- Supabase email/password Auth flow present: PASS
- CMS-admin RPC verification present: PASS
- authenticated JWT used for CMS writes: PASS
- SQL drops permissive public-ALL policy: PASS
- SQL narrows `anon` to SELECT: PASS
- SQL narrows authenticated table grants: PASS
- CMS admin allowlist table/function included: PASS
- anonymous-write verification script included: PASS
- unresolved Git merge markers: none found

## Runtime checks still required

Static validation cannot prove the live Supabase configuration until the SQL migration
is run. Complete the deployment checklist and verify both:

1. anonymous writes fail; and
2. an allowlisted authenticated CMS admin can save successfully.
