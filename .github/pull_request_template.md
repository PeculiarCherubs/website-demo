## Summary

Describe the change and why it is needed.

## Stabilization checks

- [ ] Branch is based on `develop` (unless this is an approved release/hotfix).
- [ ] I did not reintroduce a second content source of truth.
- [ ] Any content-schema change is documented and compatible with the canonical CMS model.
- [ ] I did not add `href="#"`; future actions use the Coming Soon pattern.
- [ ] I did not commit secrets, private backups, or privileged Supabase keys.
- [ ] Chapel records remain canonical under `chapels.details`.
- [ ] `node scripts/check-content-integrity.js` passes.
- [ ] `node scripts/check-navigation-integrity.js` passes.
- [ ] `node scripts/check-ui-integrity.js` passes.
- [ ] `node scripts/check-security-integrity.js` passes.
- [ ] `node scripts/check-final-qa.js` passes.
- [ ] I manually checked the affected routes.
