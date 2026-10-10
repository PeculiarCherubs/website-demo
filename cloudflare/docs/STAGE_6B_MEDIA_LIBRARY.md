# Cloudflare Stage 6B — R2 Media Library

Stage 6B moves newly uploaded website media into the dedicated R2 media bucket.
It does not bulk-migrate repository assets yet; existing `/assets/...` files remain valid.

## Security model

- Cloudflare Access authenticates the administrator.
- D1 RBAC requires `media.manage`.
- Chapel-scoped administrators can upload/delete only media owned by an assigned chapel/HQ.
- Global media is reusable by scoped administrators but cannot be deleted by them.
- SVG is intentionally rejected.
- Maximum upload size is 8 MB.
- Allowed types: JPEG, PNG, WebP, GIF and PDF.
- Deletion is blocked if D1 content still references the public media path.

## Public URL model

Uploads receive immutable UUID-backed paths:

```text
/media/<uuid>/<sanitized-file-name>
```

The same relative URL works on both the protected Admin Worker (preview) and the
Public Worker (website).

## Deploy order

Apply migration 0008 locally and remotely, run checks, deploy Admin Worker,
then Public Worker.

```cmd
npx wrangler d1 migrations apply peculiar-cherubs-staging --local --config wrangler.admin.staging.jsonc
npx wrangler d1 migrations apply peculiar-cherubs-staging --remote --config wrangler.admin.staging.jsonc
npm run check:stage6b
npx wrangler deploy --config wrangler.admin.staging.jsonc
npx wrangler deploy --config wrangler.public.staging.jsonc
```

## Manual verification

1. Sign in as Super Admin.
2. Open Media Library.
3. Upload a small JPEG/PNG.
4. Confirm the card appears and Copy path returns `/media/...`.
5. Open that path on the public staging Worker and confirm it renders.
6. Sign in as a Chapel Content Manager and verify uploads are forced to an assigned chapel.
7. Verify the same user cannot delete Shared/Global media.
8. Paste a copied media path into a test image field, save, and confirm the public staging page renders it.
9. Attempt to delete the referenced media; deletion should be blocked with `media_asset_in_use`.
