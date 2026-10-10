import {
  requirePermission,
  requireChapelScope
} from "./rbac.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

const ALLOWED_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["application/pdf", ".pdf"]
]);

export class MediaLibraryError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.name = "MediaLibraryError";
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function safeFilename(value, extension) {
  const raw = String(value || "upload")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 100) || "upload";

  const withoutExt = raw.replace(/\.[a-zA-Z0-9]{1,8}$/, "") || "upload";
  return `${withoutExt}${extension}`;
}

function ensureBinding(env) {
  if (!env?.MEDIA) {
    throw new MediaLibraryError("r2_media_binding_missing", 503);
  }
}

async function validateChapel(env, chapelId) {
  const row = await env.DB.prepare(`
    SELECT id
    FROM chapels
    WHERE id = ?
      AND published = 1
    LIMIT 1
  `).bind(chapelId).first();

  if (!row) throw new MediaLibraryError("unknown_chapel_scope", 400);
  return chapelId;
}

function resolveUploadScope(profile, scopeType, chapelId) {
  if (profile?.scope_type === "chapel") {
    if (!chapelId) {
      throw new MediaLibraryError("chapel_scope_required", 400);
    }
    requireChapelScope(profile, chapelId);
    return { scopeType: "chapel", chapelId };
  }

  if (scopeType === "chapel") {
    if (!chapelId) throw new MediaLibraryError("chapel_scope_required", 400);
    requireChapelScope(profile, chapelId);
    return { scopeType: "chapel", chapelId };
  }

  return { scopeType: "global", chapelId: null };
}

function assetDto(row) {
  return {
    id: row.id,
    url: row.public_path,
    public_path: row.public_path,
    original_filename: row.original_filename,
    stored_filename: row.stored_filename,
    content_type: row.content_type,
    size_bytes: Number(row.size_bytes || 0),
    etag: row.etag || null,
    alt_text: row.alt_text || "",
    scope_type: row.scope_type,
    chapel_id: row.chapel_id || null,
    uploaded_by_email: row.uploaded_by_email || null,
    created_at: row.created_at
  };
}

export async function listMediaAssets(env, profile, params = {}) {
  requirePermission(profile, "media.manage");
  ensureBinding(env);

  const limit = normalizeLimit(params.limit);
  const chapelId = String(params.chapel_id || "").trim();
  const search = String(params.search || "").trim().toLowerCase();

  let where = "deleted_at IS NULL";
  const bindings = [];

  if (profile.scope_type === "chapel") {
    const scopes = Array.isArray(profile.chapel_scopes) ? profile.chapel_scopes : [];
    if (!scopes.length) return [];
    where += ` AND (scope_type = 'global' OR chapel_id IN (${scopes.map(() => "?").join(",")}))`;
    bindings.push(...scopes);
  }

  if (chapelId) {
    requireChapelScope(profile, chapelId);
    where += " AND chapel_id = ?";
    bindings.push(chapelId);
  }

  if (search) {
    where += " AND (lower(original_filename) LIKE ? OR lower(COALESCE(alt_text, '')) LIKE ?)";
    const pattern = `%${search.replace(/[%_]/g, "")}%`;
    bindings.push(pattern, pattern);
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      public_path,
      original_filename,
      stored_filename,
      content_type,
      size_bytes,
      etag,
      alt_text,
      scope_type,
      chapel_id,
      uploaded_by_email,
      created_at
    FROM media_assets
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...bindings, limit).all();

  return (result.results || []).map(assetDto);
}

export async function uploadMediaAsset(env, profile, identity, formData) {
  requirePermission(profile, "media.manage");
  ensureBinding(env);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new MediaLibraryError("media_file_required", 400);
  }

  if (!file.size) throw new MediaLibraryError("media_file_empty", 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new MediaLibraryError("media_file_too_large", 413, {
      max_bytes: MAX_UPLOAD_BYTES
    });
  }

  const contentType = String(file.type || "").toLowerCase();
  const extension = ALLOWED_TYPES.get(contentType);
  if (!extension) {
    throw new MediaLibraryError("media_type_not_allowed", 415, {
      allowed_types: [...ALLOWED_TYPES.keys()]
    });
  }

  const rawScope = String(formData.get("scope_type") || "global").trim();
  const rawChapel = String(formData.get("chapel_id") || "").trim();
  const resolved = resolveUploadScope(profile, rawScope, rawChapel || null);

  if (resolved.chapelId) {
    await validateChapel(env, resolved.chapelId);
  }

  const id = crypto.randomUUID();
  const storedFilename = safeFilename(file.name, extension);
  const objectKey = `media/${id}/${storedFilename}`;
  const publicPath = `/media/${id}/${storedFilename}`;
  const altText = String(formData.get("alt_text") || "").trim().slice(0, 300);

  let object;
  try {
    object = await env.MEDIA.put(objectKey, file.stream(), {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable"
      },
      customMetadata: {
        asset_id: id,
        original_filename: String(file.name || storedFilename).slice(0, 200),
        scope_type: resolved.scopeType,
        chapel_id: resolved.chapelId || ""
      }
    });

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO media_assets (
          id,
          object_key,
          public_path,
          original_filename,
          stored_filename,
          content_type,
          size_bytes,
          etag,
          alt_text,
          scope_type,
          chapel_id,
          uploaded_by_subject,
          uploaded_by_email
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        objectKey,
        publicPath,
        String(file.name || storedFilename).slice(0, 200),
        storedFilename,
        contentType,
        file.size,
        object?.httpEtag || object?.etag || null,
        altText || null,
        resolved.scopeType,
        resolved.chapelId,
        identity.subject,
        identity.email || null
      ),
      env.DB.prepare(`
        INSERT INTO content_history (
          resource_type,
          resource_key,
          action,
          actor_subject,
          actor_email,
          after_json,
          metadata_json
        )
        VALUES ('media_asset', ?, 'UPLOAD', ?, ?, ?, ?)
      `).bind(
        id,
        identity.subject,
        identity.email || null,
        JSON.stringify({
          id,
          public_path: publicPath,
          content_type: contentType,
          size_bytes: file.size,
          scope_type: resolved.scopeType,
          chapel_id: resolved.chapelId,
          alt_text: altText
        }),
        JSON.stringify({ source: "cloudflare_r2_media" })
      )
    ]);
  } catch (error) {
    if (object) {
      try { await env.MEDIA.delete(objectKey); } catch (_) {}
    }
    throw error;
  }

  const row = await env.DB.prepare(`
    SELECT * FROM media_assets WHERE id = ? LIMIT 1
  `).bind(id).first();

  return assetDto(row);
}

async function findMediaUsage(env, publicPath) {
  const statements = [
    env.DB.prepare(`
      SELECT key AS resource_key
      FROM site_sections
      WHERE instr(COALESCE(data_json, ''), ?) > 0
      LIMIT 20
    `).bind(publicPath),

    env.DB.prepare(`
      SELECT id AS resource_key
      FROM chapels
      WHERE instr(COALESCE(page_json, ''), ?) > 0
      LIMIT 20
    `).bind(publicPath),

    env.DB.prepare(`
      SELECT id AS resource_key
      FROM sermons
      WHERE
        COALESCE(thumbnail_url, '') = ?
        OR instr(COALESCE(public_json, ''), ?) > 0
      LIMIT 20
    `).bind(publicPath, publicPath),

    env.DB.prepare(`
      SELECT id AS resource_key
      FROM broadcasts
      WHERE instr(COALESCE(public_json, ''), ?) > 0
      LIMIT 20
    `).bind(publicPath)
  ];

  let results;
  try {
    // D1 batch executes these read statements sequentially in one database call.
    // This avoids the delete-only concurrent Promise.all fan-out that could
    // surface as a generic D1 internal error in production.
    results = await env.DB.batch(statements);
  } catch (error) {
    console.error("[MediaLibraryUsageCheck]", {
      code: error?.code || "d1_usage_check_failed",
      name: error?.name || "Error"
    });
    throw new MediaLibraryError("media_usage_check_failed", 500);
  }

  const usages = [];
  const types = ["section", "chapel", "sermon", "broadcast"];

  results.forEach((result, index) => {
    for (const row of result?.results || []) {
      usages.push({
        type: types[index],
        key: row.resource_key
      });
    }
  });

  return usages;
}

export async function deleteMediaAsset(env, profile, identity, assetId) {
  requirePermission(profile, "media.manage");
  ensureBinding(env);

  const row = await env.DB.prepare(`
    SELECT *
    FROM media_assets
    WHERE id = ?
      AND deleted_at IS NULL
    LIMIT 1
  `).bind(assetId).first();

  if (!row) throw new MediaLibraryError("media_asset_not_found", 404);

  if (profile.scope_type === "chapel") {
    if (row.scope_type !== "chapel" || !row.chapel_id) {
      throw new MediaLibraryError("media_scope_denied", 403);
    }
    requireChapelScope(profile, row.chapel_id);
  }

  const usages = await findMediaUsage(env, row.public_path);
  if (usages.length) {
    throw new MediaLibraryError("media_asset_in_use", 409, { usages });
  }

  try {
    await env.MEDIA.delete(row.object_key);
  } catch (error) {
    console.error("[MediaLibraryR2Delete]", {
      asset_id: assetId,
      code: error?.code || "r2_delete_failed",
      name: error?.name || "Error"
    });
    throw new MediaLibraryError("media_r2_delete_failed", 502);
  }

  try {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE media_assets
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND deleted_at IS NULL
      `).bind(assetId),

      env.DB.prepare(`
        INSERT INTO content_history (
          resource_type,
          resource_key,
          action,
          actor_subject,
          actor_email,
          before_json,
          metadata_json
        )
        VALUES ('media_asset', ?, 'DELETE', ?, ?, ?, ?)
      `).bind(
        assetId,
        identity.subject,
        identity.email || null,
        JSON.stringify(assetDto(row)),
        JSON.stringify({
          source: "cloudflare_r2_media",
          object_key: row.object_key
        })
      )
    ]);
  } catch (error) {
    // R2 is already deleted. Preserve the real failure stage in logs/API
    // instead of collapsing it into generic internal_error.
    console.error("[MediaLibraryMetadataDelete]", {
      asset_id: assetId,
      code: error?.code || "d1_media_delete_failed",
      name: error?.name || "Error"
    });
    throw new MediaLibraryError("media_metadata_delete_failed", 500);
  }

  return { ok: true, id: assetId };
}
