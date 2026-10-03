const baseUrl = String(process.argv[2] || "").replace(/\/+$/, "");

if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
  console.error(
    "Usage: node scripts/verify-stage4-public-api.mjs https://<public-staging-worker>.workers.dev"
  );
  process.exit(1);
}

const issues = [];

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" },
    redirect: "follow"
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    throw new Error(`${path} did not return JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

const health = await getJson("/__health");
if (!health.ok || health.stage !== "cloudflare-stage-4") {
  issues.push("Stage 4 health check is not active.");
}
if (health.provider !== "cloudflare") {
  issues.push(`Public staging provider is '${health.provider}', expected 'cloudflare'.`);
}

const manifest = await getJson("/api/public/manifest");
const requiredSections = [
  "site",
  "navigation",
  "home",
  "about",
  "ministries",
  "publications",
  "events",
  "bibleCollege",
  "quickLinks",
  "give",
  "chapels",
  "sermons",
  "livestream"
];

for (const key of requiredSections) {
  if (!manifest.sections?.includes(key)) {
    issues.push(`Manifest missing section '${key}'.`);
  }
}

const payload = await getJson(
  `/api/public/sections?keys=${encodeURIComponent(requiredSections.join(","))}`
);

for (const key of requiredSections) {
  if (!payload.sections?.[key]?.data) {
    issues.push(`Public API did not return section '${key}'.`);
  }
}

const chapels = payload.sections?.chapels?.data;
if (!chapels?.details?.["peculiar-hq"]) {
  issues.push("chapels.details['peculiar-hq'] is missing.");
}
if (!Array.isArray(chapels?.current) ||
    !chapels.current.some(item => item.id === "peculiar-hq")) {
  issues.push("chapels.current does not include Peculiar HQ.");
}

for (const legacy of ["mother-church", "general", "mother"]) {
  if (chapels?.details?.[legacy]) {
    issues.push(`Legacy chapel detail '${legacy}' is still exposed.`);
  }
}

const livestream = payload.sections?.livestream?.data;
if (!livestream?.channels?.["peculiar-hq"]) {
  issues.push("livestream.channels['peculiar-hq'] is missing.");
}
for (const legacy of ["mother-church", "general", "mother"]) {
  if (livestream?.channels?.[legacy]) {
    issues.push(`Legacy livestream channel '${legacy}' is still exposed.`);
  }
}

const sermons = payload.sections?.sermons?.data;
if (!Array.isArray(sermons?.items)) {
  issues.push("sermons.items is not an array.");
} else {
  for (const sermon of sermons.items) {
    if (!sermon.id || !sermon.title || !sermon.chapelId) {
      issues.push(`Sermon projection is incomplete: ${JSON.stringify(sermon)}`);
    }
  }
}

const runtimeResponse = await fetch(`${baseUrl}/js/data/runtimeConfig.js`, {
  cache: "no-store"
});
const runtimeText = await runtimeResponse.text();
if (!runtimeResponse.ok || !runtimeText.includes('"publicProvider": "cloudflare"')) {
  issues.push("Staging runtimeConfig.js is not selecting Cloudflare.");
}

const adminResponse = await fetch(`${baseUrl}/admin/`, {
  redirect: "manual"
});
if (adminResponse.status !== 404) {
  issues.push(`Public staging unexpectedly exposes /admin/ (HTTP ${adminResponse.status}).`);
}

if (issues.length) {
  console.error("Stage 4 public API verification FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 4 public API verification: PASS");
console.log("Cloudflare staging is serving the required public content contract from D1.");
