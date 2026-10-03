import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const required = [
  "public-worker/src/index.js",
  "admin-worker/src/index.js",
  "wrangler.public.example.jsonc",
  "wrangler.admin.example.jsonc",
  "migrations/0001_cloudflare_foundation.sql"
];

const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)));

if (missing.length) {
  console.error("Cloudflare foundation check FAILED.");
  for (const rel of missing) console.error(`- Missing: ${rel}`);
  process.exit(1);
}

const admin = fs.readFileSync(path.join(root, "admin-worker/src/index.js"), "utf8");
if (!admin.includes("admin_not_enabled")) {
  console.error("Cloudflare foundation check FAILED: Admin Worker is not fail-closed.");
  process.exit(1);
}

console.log("Cloudflare foundation check: PASS");
console.log("Admin Worker remains fail-closed until Access/JWT implementation.");
