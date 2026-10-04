/**
 * Peculiar Cherubs — Cloudflare Admin Data Client
 *
 * Browser-side adapter only. Authorization is always enforced server-side
 * by Cloudflare Access + D1 RBAC/scope checks.
 */
(function (global) {
  "use strict";

  const versions = new Map();

  function cfg() {
    return global.PeculiarAdminRuntimeConfig || {
      provider: "supabase-legacy",
      apiBase: "/api/cms"
    };
  }

  function isCloudflare() {
    return cfg().provider === "cloudflare";
  }

  function api(path = "") {
    return `${String(cfg().apiBase || "/api/cms").replace(/\/$/, "")}${path}`;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const err = new Error(payload.error || `cms_http_${response.status}`);
      err.code = payload.error || "cms_request_failed";
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  function remember(section) {
    if (section?.key && section?.version) {
      versions.set(section.key, Number(section.version));
    }
    return section;
  }

  function requestId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `cms-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const AdminDataClient = {
    isCloudflare,

    async getMe() {
      const payload = await request("/api/me");
      return payload.profile;
    },

    async fetchSections(keys) {
      const list = [...new Set((keys || []).filter(Boolean))];
      const payload = await request(
        `${api("/sections")}?keys=${encodeURIComponent(list.join(","))}`
      );

      const result = payload.sections || {};
      for (const [key, entry] of Object.entries(result)) {
        versions.set(key, Number(entry.version || 1));
      }
      return result;
    },

    getSectionVersion(key) {
      return versions.get(key) || null;
    },

    async saveSection(key, data) {
      const payload = await request(
        api(`/sections/${encodeURIComponent(key)}`),
        {
          method: "PUT",
          body: JSON.stringify({
            data,
            expected_version: this.getSectionVersion(key),
            request_id: requestId()
          })
        }
      );
      return remember(payload.section);
    },

    async saveChapel(chapelKey, data) {
      const payload = await request(
        api(`/chapels/${encodeURIComponent(chapelKey)}`),
        {
          method: "PUT",
          body: JSON.stringify({
            data,
            expected_version: this.getSectionVersion("chapels"),
            request_id: requestId()
          })
        }
      );
      return remember(payload.section);
    },

    async saveBroadcast(chapelKey, data) {
      const payload = await request(
        api(`/broadcasts/${encodeURIComponent(chapelKey)}`),
        {
          method: "PUT",
          body: JSON.stringify({
            data,
            expected_version: this.getSectionVersion("livestream"),
            request_id: requestId()
          })
        }
      );
      return remember(payload.section);
    },

    async saveSermon(chapelKey, data) {
      const sermonId = String(data?.id || "").trim();
      if (!sermonId) throw new Error("sermon_id_required");

      const payload = await request(
        api(`/sermons/${encodeURIComponent(sermonId)}`),
        {
          method: "PUT",
          body: JSON.stringify({
            data: { ...(data || {}), chapelId: chapelKey },
            expected_version: this.getSectionVersion("sermons"),
            request_id: requestId()
          })
        }
      );
      return remember(payload.section);
    },

    async deleteSermon(chapelKey, sermonId) {
      const payload = await request(
        api(`/sermons/${encodeURIComponent(sermonId)}`),
        {
          method: "DELETE",
          body: JSON.stringify({
            chapelId: chapelKey,
            expected_version: this.getSectionVersion("sermons"),
            request_id: requestId()
          })
        }
      );
      return remember(payload.section);
    },

    async inviteAdmin(email, roleKey, scopeType = "global", chapelKeys = []) {
      const keys = Array.isArray(chapelKeys)
        ? [...new Set(chapelKeys.map(String).filter(Boolean))]
        : [];

      if (roleKey === "chapel_content_manager" && keys.length === 0) {
        const err = new Error("chapel_scope_required");
        err.code = "chapel_scope_required";
        err.status = 400;
        throw err;
      }

      return request(api("/admins/invite"), {
        method: "POST",
        body: JSON.stringify({
          email,
          role_key: roleKey,
          scope_type: scopeType,
          chapel_keys: keys,
          chapel_scopes: keys
        })
      });
    },

    async listAccess() {
      const [rolesPayload, adminsPayload] = await Promise.all([
        request(api("/roles")),
        request(api("/admins"))
      ]);

      return {
        roles: rolesPayload.roles || [],
        admins: adminsPayload.admins || []
      };
    },

    async rpc(name, body = {}) {
      if (name === "cms_assign_admin_role") {
        return request(api("/admins/invite"), {
          method: "POST",
          body: JSON.stringify({
            email: body.p_email,
            role_key: body.p_role_key,
            scope_type:
              body.p_role_key === "chapel_content_manager"
                ? "chapel"
                : "global",
            chapel_keys: []
          })
        });
      }

      const target = encodeURIComponent(body.p_user_id || "");

      if (name === "cms_set_admin_role") {
        const keys = Array.isArray(body.p_chapel_keys)
          ? [...new Set(body.p_chapel_keys.map(String).filter(Boolean))]
          : [];

        if (body.p_role_key === "chapel_content_manager" && keys.length === 0) {
          const err = new Error("chapel_scope_required");
          err.code = "chapel_scope_required";
          err.status = 400;
          throw err;
        }

        return request(api(`/admins/${target}/role`), {
          method: "PATCH",
          body: JSON.stringify({
            role_key: body.p_role_key,
            scope_type:
              body.p_role_key === "chapel_content_manager"
                ? "chapel"
                : "global",
            chapel_keys: keys,
            chapel_scopes: keys
          })
        });
      }

      if (name === "cms_set_admin_scopes") {
        const keys = Array.isArray(body.p_chapel_keys)
          ? [...new Set(body.p_chapel_keys.map(String).filter(Boolean))]
          : [];

        if (body.p_scope_type === "chapel" && keys.length === 0) {
          const err = new Error("chapel_scope_required");
          err.code = "chapel_scope_required";
          err.status = 400;
          throw err;
        }

        return request(api(`/admins/${target}/scopes`), {
          method: "PATCH",
          body: JSON.stringify({
            scope_type: body.p_scope_type,
            chapel_keys: keys,
            chapel_scopes: keys
          })
        });
      }

      if (name === "cms_remove_admin") {
        return request(api(`/admins/${target}`), {
          method: "DELETE"
        });
      }

      throw new Error(`unsupported_admin_rpc:${name}`);
    },

    async history(limit = 50) {
      const payload = await request(
        `${api("/history")}?limit=${encodeURIComponent(limit)}`
      );
      return payload.history || [];
    }
  };

  global.AdminDataClient = Object.freeze(AdminDataClient);
})(typeof window !== "undefined" ? window : globalThis);
