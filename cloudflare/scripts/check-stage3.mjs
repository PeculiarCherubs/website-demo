import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const issues = [];

const required = [
  "scripts/export-supabase-site-content.mjs",
  "scripts/transform-supabase-to-d1.mjs",
  "scripts/generate-stage3-validation-sql.mjs",
  "docs/STAGE_3_SUPABASE_D1_IMPORT_REHEARSAL.md"
];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    issues.push(`Missing Stage 3 file: ${rel}`);
  }
}

const transform = fs.readFileSync(
  path.join(root, "scripts/transform-supabase-to-d1.mjs"),
  "utf8"
);

for (const marker of [
  'DELETE FROM broadcasts;',
  'DELETE FROM sermons;',
  'DELETE FROM chapels;',
  'DELETE FROM site_sections;',
  '"peculiar-hq"',
  '"chapels_meta"',
  '"sermons_meta"',
  '"livestream_meta"'
]) {
  if (!transform.includes(marker)) {
    issues.push(`Stage 3 transformer marker missing: ${marker}`);
  }
}

for (const forbidden of [
  "DELETE FROM cms_admins",
  "DELETE FROM cms_roles",
  "DELETE FROM cms_admin_scopes",
  "DELETE FROM content_history"
]) {
  if (transform.includes(forbidden)) {
    issues.push(`Import rehearsal must not reset Stage 2 security state: ${forbidden}`);
  }
}

if (issues.length) {
  console.error("Cloudflare Stage 3 check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Cloudflare Stage 3 check: PASS");
console.log("Import rehearsal tooling preserves Stage 2 CMS security state.");
