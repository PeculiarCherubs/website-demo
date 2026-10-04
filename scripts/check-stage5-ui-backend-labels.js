const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "js", "admin.js"), "utf8");

const issues = [];

for (const forbidden of [
  "Save Section to Supabase",
  "Save to Supabase DB",
  "Connected to Supabase DB",
  "live Supabase sections",
  "selected live Supabase",
  "Permissions are enforced by Supabase"
]) {
  if (html.includes(forbidden)) {
    issues.push(`Stale shared CMS label remains: ${forbidden}`);
  }
}

for (const forbidden of [
  "Leadership section header updated live in Supabase DB!",
  "Quick Links page headers updated live in Supabase DB!",
  "Payment Gateway plugin configuration synced live to Supabase DB!",
  "Giving page settings updated live in Supabase DB!",
  "Site settings updated live on Supabase DB!",
  "reconnect to Supabase before saving",
  "scoped saves require Supabase"
]) {
  if (js.includes(forbidden)) {
    issues.push(`Stale runtime CMS message remains: ${forbidden}`);
  }
}

for (const required of [
  "Save Section to CMS",
  "Save to CMS",
  "Connecting to live CMS",
  "active CMS backend"
]) {
  if (!html.includes(required)) {
    issues.push(`Expected provider-neutral CMS wording missing: ${required}`);
  }
}

if (issues.length) {
  console.error("Stage 5 CMS backend-label check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 5 CMS backend-label check: PASS");
console.log("Shared CMS UI no longer mislabels Cloudflare D1 saves as Supabase.");
