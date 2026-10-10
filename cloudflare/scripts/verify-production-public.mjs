const baseUrl = String(process.argv[2] || "").replace(/\/+$/, "");

if (!baseUrl.startsWith("https://")) {
  console.error(
    "Usage: node scripts/verify-production-public.mjs https://<public-production-domain>"
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
if (health.environment !== "production") {
  issues.push(`Expected production environment; got '${health.environment}'.`);
}
if (health.public_read_mode !== "r2-prefer") {
  issues.push(`Expected r2-prefer; got '${health.public_read_mode}'.`);
}

const payload = await getJson(
  "/api/public/sections?keys=site,navigation,home,about,ministries,publications,events,bibleCollege,quickLinks,give,chapels,sermons,livestream"
);

if (payload.source !== "r2") {
  issues.push(`Expected production public source 'r2'; got '${payload.source}'.`);
}

const expected = [
  "site","navigation","home","about","ministries","publications","events",
  "bibleCollege","quickLinks","give","chapels","sermons","livestream"
];

for (const key of expected) {
  if (!payload.sections?.[key]?.data) {
    issues.push(`Missing canonical production section '${key}'.`);
  }
}

if (issues.length) {
  console.error("Production public verification FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Production public verification: PASS");
console.log("All canonical sections are served from R2 on the production domain.");
