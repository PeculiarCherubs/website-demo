import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksByTeamDomain = new Map();

export class AccessAuthError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.name = "AccessAuthError";
    this.code = code;
    this.status = status;
  }
}

function normalizeTeamDomain(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("REPLACE_")) return "";
  return raw.startsWith("https://") ? raw.replace(/\/+$/, "") : `https://${raw.replace(/\/+$/, "")}`;
}

function getJwks(teamDomain) {
  if (!jwksByTeamDomain.has(teamDomain)) {
    jwksByTeamDomain.set(
      teamDomain,
      createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
    );
  }
  return jwksByTeamDomain.get(teamDomain);
}

export async function requireAccessIdentity(request, env) {
  const teamDomain = normalizeTeamDomain(env.TEAM_DOMAIN);
  const audience = String(env.POLICY_AUD || "").trim();

  if (!teamDomain || !audience || audience.startsWith("REPLACE_")) {
    throw new AccessAuthError("access_not_configured", 503);
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    throw new AccessAuthError("access_token_required", 403);
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience,
      algorithms: ["RS256"]
    });

    const subject = String(payload.sub || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();

    if (!subject || !email) {
      throw new AccessAuthError("access_identity_incomplete", 403);
    }

    return {
      subject,
      email,
      name: typeof payload.name === "string" ? payload.name : null
    };
  } catch (error) {
    if (error instanceof AccessAuthError) throw error;
    throw new AccessAuthError("access_token_invalid", 403);
  }
}
