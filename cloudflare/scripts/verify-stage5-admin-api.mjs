const baseUrl = String(process.argv[2] || "").replace(/\/+$/, "");

if (!baseUrl.startsWith("https://")) {
  console.error(
    "Usage: node scripts/verify-stage5-admin-api.mjs https://<admin-worker>.workers.dev"
  );
  console.error(
    "Run this after signing into Cloudflare Access in a browser. CLI verification cannot reuse your browser Access session automatically."
  );
  process.exit(1);
}

console.log("Stage 5 Admin API URL:");
console.log(`${baseUrl}/__health`);
console.log(`${baseUrl}/api/me`);
console.log(`${baseUrl}/api/cms/sections?keys=site,chapels,sermons,livestream`);
console.log(`${baseUrl}/api/cms/history?limit=10`);
console.log("");
console.log("Because these endpoints are protected by Cloudflare Access, test them in your authenticated browser.");
console.log("Expected health.stage: cloudflare-stage-5");
