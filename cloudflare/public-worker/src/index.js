/**
 * Peculiar Cherubs — Public Cloudflare Worker
 * Stage 1 foundation only.
 *
 * Responsibilities in the final architecture:
 * - serve public static assets;
 * - expose public read-only API routes;
 * - never expose CMS write routes.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/__health") {
      return Response.json({
        ok: true,
        service: "peculiar-cherubs-public",
        stage: "cloudflare-foundation"
      });
    }

    // Public API will be introduced in the next migration stage.
    if (url.pathname.startsWith("/api/public/")) {
      return Response.json(
        {
          error: "not_implemented",
          message: "Public API is not enabled in the foundation stage."
        },
        { status: 501 }
      );
    }

    // Static assets are served by the Workers Assets binding.
    return env.ASSETS.fetch(request);
  }
};
