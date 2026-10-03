/**
 * Peculiar Cherubs — Admin Cloudflare Worker
 * Stage 1 foundation only.
 *
 * SECURITY NOTE:
 * The Admin Worker is intentionally CLOSED in this stage.
 * Do not serve the CMS until:
 * 1. Cloudflare Access protects the admin hostname, and
 * 2. the Worker validates the Cloudflare Access JWT itself.
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/__health") {
      return Response.json({
        ok: true,
        service: "peculiar-cherubs-admin",
        stage: "cloudflare-foundation",
        cmsEnabled: false
      });
    }

    return Response.json(
      {
        error: "admin_not_enabled",
        message:
          "The Admin Worker remains closed until Cloudflare Access and JWT validation are configured."
      },
      { status: 503 }
    );
  }
};
