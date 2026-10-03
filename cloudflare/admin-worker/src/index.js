/**
 * Peculiar Cherubs — Admin Cloudflare Worker
 * Stage 2: Access + D1 authorization foundation.
 *
 * CMS HTML remains on the existing Supabase implementation for now.
 * This Worker proves the new authentication/authorization boundary before
 * any administrative write route is migrated.
 */

import { requireAccessIdentity } from "./auth.js";
import { loadCmsProfile } from "./rbac.js";
import { json, requestId, safeErrorResponse } from "./http.js";

async function assertDatabaseReady(env) {
  const row = await env.DB
    .prepare("SELECT value FROM schema_meta WHERE key = 'application_schema' LIMIT 1")
    .first();

  if (!row || row.value !== "cloudflare-stage-2-v1") {
    const err = new Error("d1_stage2_schema_missing");
    err.code = "d1_stage2_schema_missing";
    err.status = 503;
    throw err;
  }
}

export default {
  async fetch(request, env) {
    const id = requestId(request);
    const url = new URL(request.url);

    try {
      // Every Stage 2 Admin route is fail-closed behind a VALID Access token.
      const identity = await requireAccessIdentity(request, env);

      if (url.pathname === "/api/identity" && request.method === "GET") {
        await assertDatabaseReady(env);

        return json({
          ok: true,
          identity: {
            subject: identity.subject,
            email: identity.email,
            name: identity.name
          },
          environment: env.ENVIRONMENT || "staging",
          request_id: id
        });
      }

      if (url.pathname === "/api/me" && request.method === "GET") {
        await assertDatabaseReady(env);
        const profile = await loadCmsProfile(env, identity);

        return json({
          ok: true,
          profile,
          environment: env.ENVIRONMENT || "staging",
          request_id: id
        });
      }

      if (url.pathname === "/__health" && request.method === "GET") {
        await assertDatabaseReady(env);

        return json({
          ok: true,
          service: "peculiar-cherubs-admin",
          stage: "cloudflare-stage-2",
          access_validated: true,
          database_ready: true,
          cms_ui_enabled: false,
          request_id: id
        });
      }

      if (url.pathname === "/" && request.method === "GET") {
        await assertDatabaseReady(env);

        return json({
          ok: true,
          service: "peculiar-cherubs-admin",
          message: "Stage 2 security foundation is active. CMS UI migration has not started.",
          next: ["/api/identity", "/api/me"],
          request_id: id
        });
      }

      return json({
        ok: false,
        error: "not_found",
        request_id: id
      }, 404);

    } catch (error) {
      return safeErrorResponse(error, id);
    }
  }
};
