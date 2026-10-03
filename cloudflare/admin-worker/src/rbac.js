export class CmsAuthorizationError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.name = "CmsAuthorizationError";
    this.code = code;
    this.status = status;
  }
}

export async function loadCmsProfile(env, identity) {
  const admin = await env.DB
    .prepare(`
      SELECT
        a.access_subject,
        a.email,
        a.role_key,
        a.display_name,
        a.enabled,
        r.label AS role_label
      FROM cms_admins a
      JOIN cms_roles r ON r.role_key = a.role_key
      WHERE a.access_subject = ?
      LIMIT 1
    `)
    .bind(identity.subject)
    .first();

  if (!admin) {
    throw new CmsAuthorizationError("cms_admin_not_authorized", 403);
  }

  if (Number(admin.enabled) !== 1) {
    throw new CmsAuthorizationError("cms_admin_disabled", 403);
  }

  // A token subject is authoritative. Email mismatch is treated as a profile
  // drift signal and surfaced without silently rebinding the account.
  if (String(admin.email || "").toLowerCase() !== identity.email) {
    throw new CmsAuthorizationError("cms_admin_identity_mismatch", 403);
  }

  const [permissionResult, scopeResult] = await Promise.all([
    env.DB
      .prepare(`
        SELECT rp.permission_key
        FROM cms_role_permissions rp
        WHERE rp.role_key = ?
        ORDER BY rp.permission_key
      `)
      .bind(admin.role_key)
      .all(),

    env.DB
      .prepare(`
        SELECT scope_type, scope_key
        FROM cms_admin_scopes
        WHERE access_subject = ?
        ORDER BY scope_type, scope_key
      `)
      .bind(identity.subject)
      .all()
  ]);

  const permissions = (permissionResult.results || []).map(row => row.permission_key);
  const scopes = (scopeResult.results || []).map(row => ({
    type: row.scope_type,
    key: row.scope_key
  }));

  const hasGlobalScope = scopes.some(scope =>
    scope.type === "global" && scope.key === "*"
  );

  const chapelScopes = scopes
    .filter(scope => scope.type === "chapel")
    .map(scope => scope.key);

  return {
    subject: admin.access_subject,
    email: admin.email,
    display_name: admin.display_name || identity.name || null,
    role_key: admin.role_key,
    role_label: admin.role_label,
    permissions,
    scope_type: hasGlobalScope ? "global" : "chapel",
    chapel_scopes: chapelScopes,
    enabled: true
  };
}

export function hasPermission(profile, permissionKey) {
  if (!profile) return false;
  if (profile.role_key === "super_admin") return true;
  return Array.isArray(profile.permissions) &&
    profile.permissions.includes(permissionKey);
}

export function canAccessChapel(profile, chapelId) {
  if (!profile || !chapelId) return false;
  if (profile.role_key === "super_admin") return true;
  if (profile.scope_type === "global") return true;
  return Array.isArray(profile.chapel_scopes) &&
    profile.chapel_scopes.includes(chapelId);
}

export function requirePermission(profile, permissionKey) {
  if (!hasPermission(profile, permissionKey)) {
    throw new CmsAuthorizationError("cms_permission_denied", 403);
  }
}

export function requireChapelScope(profile, chapelId) {
  if (!canAccessChapel(profile, chapelId)) {
    throw new CmsAuthorizationError("chapel_scope_denied", 403);
  }
}
