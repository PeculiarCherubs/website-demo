import {
  hasPermission,
  CmsAuthorizationError
} from "./rbac.js";

export class CmsAdminAccessError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "CmsAdminAccessError";
    this.code = code;
    this.status = status;
  }
}

function requireManage(profile) {
  if (!hasPermission(profile, "admins.manage")) {
    throw new CmsAuthorizationError("admin_management_required", 403);
  }
}

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 320) {
    throw new CmsAdminAccessError("valid_email_required", 400);
  }
  return email;
}

async function validateRole(env, roleKey) {
  const role = await env.DB.prepare(`
    SELECT role_key, label, description, sort_order
    FROM cms_roles
    WHERE role_key = ?
    LIMIT 1
  `).bind(roleKey).first();

  if (!role) throw new CmsAdminAccessError("unknown_cms_role", 400);
  return role;
}

async function validateChapelKeys(env, keys) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    throw new CmsAdminAccessError("cms_scope_validation_unavailable", 500);
  }

  const unique = [...new Set((keys || []).map(String).filter(Boolean))];
  if (!unique.length) return [];

  const marks = unique.map(() => "?").join(",");
  const result = await env.DB.prepare(`
    SELECT id
    FROM chapels
    WHERE id IN (${marks})
      AND published = 1
  `).bind(...unique).all();

  const found = new Set((result.results || []).map(row => row.id));
  const invalid = unique.filter(key => !found.has(key));
  if (invalid.length) {
    throw new CmsAdminAccessError("unknown_chapel_scope", 400);
  }

  return unique;
}

function normalizeScope(roleKey, scopeType, chapelKeys) {
  if (roleKey !== "chapel_content_manager") {
    return { scopeType: "global", chapelKeys: [] };
  }

  const keys = [...new Set(chapelKeys || [])];
  if (!keys.length) {
    throw new CmsAdminAccessError("chapel_scope_required", 400);
  }

  return { scopeType: "chapel", chapelKeys: keys };
}

function requestChapelKeys(body) {
  const candidates = [
    body?.chapel_keys,
    body?.chapel_scopes,
    body?.chapelKeys
  ];

  const raw = candidates.find(value => Array.isArray(value)) || [];
  return [...new Set(raw.map(String).map(value => value.trim()).filter(Boolean))];
}

export async function listRoles(env, profile) {
  requireManage(profile);
  const result = await env.DB.prepare(`
    SELECT role_key, label, description
    FROM cms_roles
    ORDER BY sort_order, label
  `).all();
  return result.results || [];
}

export async function listAdmins(env, profile) {
  requireManage(profile);

  const [adminsResult, invitesResult] = await Promise.all([
    env.DB.prepare(`
      SELECT
        a.access_subject AS user_id,
        a.access_subject,
        a.email,
        a.role_key,
        r.label AS role_label,
        a.enabled,
        a.created_at
      FROM cms_admins a
      JOIN cms_roles r ON r.role_key = a.role_key
      ORDER BY lower(a.email)
    `).all(),

    env.DB.prepare(`
      SELECT
        email,
        role_key,
        scope_type,
        chapel_keys_json,
        enabled,
        created_at
      FROM cms_admin_invites
      WHERE enabled = 1
      ORDER BY lower(email)
    `).all()
  ]);

  const active = [];

  for (const admin of adminsResult.results || []) {
    const scopesResult = await env.DB.prepare(`
      SELECT scope_type, scope_key
      FROM cms_admin_scopes
      WHERE access_subject = ?
      ORDER BY scope_type, scope_key
    `).bind(admin.access_subject).all();

    const scopes = scopesResult.results || [];
    const global = scopes.some(
      row => row.scope_type === "global" && row.scope_key === "*"
    );

    active.push({
      ...admin,
      pending: false,
      scope_type: global ? "global" : "chapel",
      chapel_scopes: scopes
        .filter(row => row.scope_type === "chapel")
        .map(row => row.scope_key)
    });
  }

  const pending = (invitesResult.results || []).map(invite => ({
    user_id: `invite:${invite.email}`,
    access_subject: null,
    email: invite.email,
    role_key: invite.role_key,
    role_label: "Pending Access",
    enabled: Boolean(invite.enabled),
    created_at: invite.created_at,
    pending: true,
    scope_type: invite.scope_type,
    chapel_scopes: JSON.parse(invite.chapel_keys_json || "[]")
  }));

  return [...active, ...pending].sort((a, b) =>
    String(a.email).localeCompare(String(b.email))
  );
}

export async function inviteAdmin(env, profile, identity, body) {
  requireManage(profile);

  const email = cleanEmail(body?.email);
  const roleKey = String(body?.role_key || "").trim();
  await validateRole(env, roleKey);

  const requestedKeys = await validateChapelKeys(
    env,
    requestChapelKeys(body)
  );
  const scope = normalizeScope(
    roleKey,
    body?.scope_type || (roleKey === "chapel_content_manager" ? "chapel" : "global"),
    requestedKeys
  );

  const existing = await env.DB.prepare(
    "SELECT access_subject FROM cms_admins WHERE lower(email) = lower(?) LIMIT 1"
  ).bind(email).first();

  if (existing) {
    throw new CmsAdminAccessError("cms_admin_already_exists", 409);
  }

  await env.DB.prepare(`
    INSERT INTO cms_admin_invites (
      email,
      role_key,
      scope_type,
      chapel_keys_json,
      enabled,
      invited_by,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      role_key = excluded.role_key,
      scope_type = excluded.scope_type,
      chapel_keys_json = excluded.chapel_keys_json,
      enabled = 1,
      invited_by = excluded.invited_by,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    email,
    roleKey,
    scope.scopeType,
    JSON.stringify(scope.chapelKeys),
    identity.subject
  ).run();

  return {
    ok: true,
    pending: true,
    email,
    role_key: roleKey,
    scope_type: scope.scopeType,
    chapel_scopes: scope.chapelKeys
  };
}

function inviteEmailFromTarget(target) {
  const value = decodeURIComponent(String(target || ""));
  return value.startsWith("invite:") ? value.slice("invite:".length) : null;
}

async function ensureNotLastSuperAdmin(env, subject, nextRole = null) {
  const current = await env.DB.prepare(
    "SELECT role_key FROM cms_admins WHERE access_subject = ? LIMIT 1"
  ).bind(subject).first();

  if (!current) throw new CmsAdminAccessError("cms_admin_not_found", 404);

  if (current.role_key === "super_admin" && nextRole !== "super_admin") {
    const count = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM cms_admins
      WHERE role_key = 'super_admin'
        AND enabled = 1
    `).first();

    if (Number(count?.count || 0) <= 1) {
      throw new CmsAdminAccessError("last_super_admin_required", 409);
    }
  }
}

export async function setAdminRole(env, profile, target, body) {
  requireManage(profile);

  const roleKey = String(body?.role_key || "").trim();
  await validateRole(env, roleKey);

  const requestedKeys = roleKey === "chapel_content_manager"
    ? await validateChapelKeys(env, requestChapelKeys(body))
    : [];

  const nextScope = normalizeScope(
    roleKey,
    roleKey === "chapel_content_manager" ? "chapel" : "global",
    requestedKeys
  );

  const inviteEmail = inviteEmailFromTarget(target);
  if (inviteEmail) {
    const invite = await env.DB.prepare(`
      SELECT email
      FROM cms_admin_invites
      WHERE lower(email) = lower(?)
      LIMIT 1
    `).bind(inviteEmail).first();

    if (!invite) throw new CmsAdminAccessError("cms_invite_not_found", 404);

    await env.DB.prepare(`
      UPDATE cms_admin_invites
      SET
        role_key = ?,
        scope_type = ?,
        chapel_keys_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE lower(email) = lower(?)
    `).bind(
      roleKey,
      nextScope.scopeType,
      JSON.stringify(nextScope.chapelKeys),
      inviteEmail
    ).run();

    return {
      ok: true,
      pending: true,
      role_key: roleKey,
      scope_type: nextScope.scopeType,
      chapel_scopes: nextScope.chapelKeys
    };
  }

  await ensureNotLastSuperAdmin(env, target, roleKey);

  const statements = [
    env.DB.prepare(`
      UPDATE cms_admins
      SET
        role_key = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE access_subject = ?
    `).bind(roleKey, target),

    env.DB.prepare(
      "DELETE FROM cms_admin_scopes WHERE access_subject = ?"
    ).bind(target)
  ];

  if (nextScope.scopeType === "global") {
    statements.push(
      env.DB.prepare(`
        INSERT INTO cms_admin_scopes (
          access_subject, scope_type, scope_key
        )
        VALUES (?, 'global', '*')
      `).bind(target)
    );
  } else {
    for (const key of nextScope.chapelKeys) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO cms_admin_scopes (
            access_subject, scope_type, scope_key
          )
          VALUES (?, 'chapel', ?)
        `).bind(target, key)
      );
    }
  }

  await env.DB.batch(statements);

  return {
    ok: true,
    pending: false,
    role_key: roleKey,
    scope_type: nextScope.scopeType,
    chapel_scopes: nextScope.chapelKeys
  };
}

export async function setAdminScopes(env, profile, target, body) {
  requireManage(profile);

  const inviteEmail = inviteEmailFromTarget(target);
  const requestedKeys = await validateChapelKeys(
    env,
    requestChapelKeys(body)
  );

  if (inviteEmail) {
    const invite = await env.DB.prepare(`
      SELECT email, role_key
      FROM cms_admin_invites
      WHERE lower(email) = lower(?)
      LIMIT 1
    `).bind(inviteEmail).first();

    if (!invite) throw new CmsAdminAccessError("cms_invite_not_found", 404);

    const scope = normalizeScope(
      invite.role_key,
      body?.scope_type || "global",
      requestedKeys
    );

    await env.DB.prepare(`
      UPDATE cms_admin_invites
      SET
        scope_type = ?,
        chapel_keys_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE lower(email) = lower(?)
    `).bind(
      scope.scopeType,
      JSON.stringify(scope.chapelKeys),
      inviteEmail
    ).run();

    return { ok: true, pending: true };
  }

  const admin = await env.DB.prepare(`
    SELECT role_key
    FROM cms_admins
    WHERE access_subject = ?
    LIMIT 1
  `).bind(target).first();

  if (!admin) throw new CmsAdminAccessError("cms_admin_not_found", 404);

  const scope = normalizeScope(
    admin.role_key,
    body?.scope_type || "global",
    requestedKeys
  );

  const statements = [
    env.DB.prepare(
      "DELETE FROM cms_admin_scopes WHERE access_subject = ?"
    ).bind(target)
  ];

  if (scope.scopeType === "global") {
    statements.push(
      env.DB.prepare(`
        INSERT INTO cms_admin_scopes (
          access_subject, scope_type, scope_key
        )
        VALUES (?, 'global', '*')
      `).bind(target)
    );
  } else {
    for (const key of scope.chapelKeys) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO cms_admin_scopes (
            access_subject, scope_type, scope_key
          )
          VALUES (?, 'chapel', ?)
        `).bind(target, key)
      );
    }
  }

  await env.DB.batch(statements);
  return { ok: true };
}

export async function removeAdmin(env, profile, identity, target) {
  requireManage(profile);

  const inviteEmail = inviteEmailFromTarget(target);
  if (inviteEmail) {
    await env.DB.prepare(
      "DELETE FROM cms_admin_invites WHERE lower(email) = lower(?)"
    ).bind(inviteEmail).run();
    return { ok: true, pending: true };
  }

  if (target === identity.subject) {
    throw new CmsAdminAccessError("cannot_remove_current_admin", 409);
  }

  await ensureNotLastSuperAdmin(env, target, null);

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM cms_admin_scopes WHERE access_subject = ?"
    ).bind(target),
    env.DB.prepare(
      "DELETE FROM cms_admins WHERE access_subject = ?"
    ).bind(target)
  ]);

  return { ok: true };
}
