# Cloudflare Stage 6B — R2 Media Library

- Adds D1 media metadata and `media.manage` RBAC.
- Adds scoped R2 uploads, browsing and deletion.
- Adds a CMS Media Library panel with upload, search, copy-path and delete actions.
- Serves immutable `/media/...` URLs from R2 through the Public Worker.
- Supports the same media URLs for protected Admin previews.
- Restricts chapel-scoped administrators to assigned chapel/HQ uploads and deletions.
- Blocks deletion of media still referenced by published D1 content.
- Keeps existing repository `/assets/...` media fully compatible.
