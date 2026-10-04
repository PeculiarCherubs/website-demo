/**
 * Peculiar Cherubs — Cloudflare Access identity
 *
 * Preferred path:
 *   Worker-level Access -> ctx.access.getIdentity()
 *
 * Static Assets limitation:
 *   Cloudflare's Static Assets router does not propagate ctx.access to the
 *   user Worker. When the Admin Worker has an assets binding, Access still
 *   protects the Worker, but identity must be recovered from the Access JWT.
 *
 * Therefore this module is deliberately HYBRID:
 *   1. use ctx.access when Cloudflare supplies it;
 *   2. otherwise validate Cf-Access-Jwt-Assertion using the trusted team
 *      domain + Access application AUD.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

export class AccessAuthError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.name = "AccessAuthError";
    this.code = code;
    this.status = status;
  }
}

const jwksCache = new Map();

function normalizeTeamDomain(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return raw.startsWith("https://") ? raw : `https://${raw}`;
}

function getJwks(teamDomain) {
  if (!jwksCache.has(teamDomain)) {
    jwksCache.set(
      teamDomain,
      createRemoteJWKSet(
        new URL(`${teamDomain}/cdn-cgi/access/certs`)
      )
    );
  }
  return jwksCache.get(teamDomain);
}

function normalizeIdentity(identity, aud = "") {
  const email = String(identity?.email || "").trim().toLowerCase();
  const subject = String(
    identity?.user_uuid ||
    identity?.id ||
    identity?.sub ||
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
    aud: String(aud || "")
  };
}

async function nativeAccessIdentity(ctx) {
  if (!ctx?.access) return null;

  try {
    const identity = await ctx.access.getIdentity();
    return normalizeIdentity(identity, ctx.access.aud || "");
  } catch (_) {
    throw new AccessAuthError("access_identity_unavailable", 403);
  }
}

function accessJwtFromRequest(request) {
  return String(
    request.headers.get("cf-access-jwt-assertion") || ""
  ).trim();
}

async function fetchFullIdentity(request, teamDomain) {
  const cookie = request.headers.get("cookie") || "";
  if (!cookie.toLowerCase().includes("cf_authorization=")) return null;

  try {
    const response = await fetch(
      `${teamDomain}/cdn-cgi/access/get-identity`,
      {
        headers: {
          cookie,
          accept: "application/json"
        }
      }
    );

    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function jwtAccessIdentity(request, env) {
  const teamDomain = normalizeTeamDomain(env.TEAM_DOMAIN);
  const audience = String(env.POLICY_AUD || "").trim();

  if (!teamDomain || !audience) {
    throw new AccessAuthError("access_validation_not_configured", 503);
  }

  const token = accessJwtFromRequest(request);
  if (!token) {
    throw new AccessAuthError("access_token_required", 403);
  }

  let payload;
  try {
    const verified = await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience
    });
    payload = verified.payload;
  } catch (_) {
    throw new AccessAuthError("access_token_invalid", 403);
  }

  // The signed token is already authoritative. The identity endpoint is only
  // used to enrich the profile with the stable user_uuid/name/groups when the
  // browser Access cookie is available.
  const fullIdentity = await fetchFullIdentity(request, teamDomain);

  return normalizeIdentity(
    {
      ...payload,
      ...(fullIdentity || {}),
      email: fullIdentity?.email || payload?.email,
      user_uuid:
        fullIdentity?.user_uuid ||
        fullIdentity?.id ||
        payload?.sub
    },
    Array.isArray(payload?.aud)
      ? payload.aud.join(",")
      : payload?.aud || audience
  );
}

export async function requireAccessIdentity(request, ctx, env) {
  const native = await nativeAccessIdentity(ctx);
  if (native) return native;

  return jwtAccessIdentity(request, env);
}
