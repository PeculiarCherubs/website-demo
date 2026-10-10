const baseUrl = String(process.argv[2] || "").replace(/\/+$/, "");

if (!baseUrl.startsWith("https://")) {
  console.error(
    "Usage: node scripts/verify-stage6a-public-api.mjs https://<public-staging-worker>.workers.dev"
  );
  process.exit(1);
}

const issues = [];

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

const health = await getJson("/__health");
if (health.stage !== "cloudflare-stage-6a") {
  issues.push(`Expected Stage 6A health, got '${health.stage}'.`);
}
if (health.publication_pipeline !== "cloudflare-stage-6a-v1") {
  issues.push("Publication pipeline schema marker is missing.");
}

const payload = await getJson("/api/public/sections?keys=site,home,chapels,sermons,livestream");
if (!["d1", "r2", "r2+d1-fallback"].includes(payload.source)) {
  issues.push(`Unexpected public source '${payload.source}'.`);
}
for (const key of ["site", "home", "chapels", "sermons", "livestream"]) {
  if (!payload.sections?.[key]?.data) {
    issues.push(`Missing public section '${key}'.`);
  }
}

if (issues.length) {
  console.error("Stage 6A public API verification FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 6A public API verification: PASS");
console.log(`Public source: ${payload.source}`);
