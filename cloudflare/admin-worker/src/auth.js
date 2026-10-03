/**
 * Peculiar Cherubs — Cloudflare Worker Access identity
 *
 * Worker-level Cloudflare Access now provides a trusted `ctx.access` object
 * after Access has authenticated the request. Cloudflare explicitly documents
 * `ctx.access.getIdentity()` as requiring no additional JWT parsing/config.
 *
 * IMPORTANT:
 * This assumes the Worker itself is protected through the Workers & Pages
 * Access integration. If Access is not applied, ctx.access is undefined and
 * the request fails closed.
 */

export class AccessAuthError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.name = "AccessAuthError";
    this.code = code;
    this.status = status;
  }
}

export async function requireAccessIdentity(ctx) {
  if (!ctx?.access) {
    throw new AccessAuthError("access_required", 403);
  }

  let identity;
  try {
    identity = await ctx.access.getIdentity();
  } catch (_) {
    throw new AccessAuthError("access_identity_unavailable", 403);
  }

  const email = String(identity?.email || "").trim().toLowerCase();

  // Cloudflare identity payloads may expose a stable identity as user_uuid
  // or id depending on identity source/version. Prefer those; email is only
  // the final compatibility fallback.
  const subject = String(
    identity?.user_uuid ||
    identity?.id ||
    email
  ).trim();

  if (!subject || !email) {
    throw new AccessAuthError("access_identity_incomplete", 403);
  }

  return {
    subject,
    email,
    name: typeof identity?.name === "string" ? identity.name : null,
    groups: Array.isArray(identity?.groups) ? identity.groups : [],
    aud: String(ctx.access.aud || "")
  };
}
