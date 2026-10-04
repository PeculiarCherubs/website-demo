/**
 * Repository/default Admin runtime.
 * Cloudflare Admin Worker overrides this asset at request time.
 */
(function (global) {
  "use strict";
  global.PeculiarAdminRuntimeConfig = Object.freeze({
    provider: "supabase-legacy",
    apiBase: "/api/cms"
  });
})(typeof window !== "undefined" ? window : globalThis);
