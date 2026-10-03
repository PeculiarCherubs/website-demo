import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const issues = [];

const required = [
  "migrations/0002_application_schema.sql",
  "migrations/0003_cms_rbac_seed.sql",
  "admin-worker/src/auth.js",
  "admin-worker/src/rbac.js",
  "admin-worker/src/http.js",
  "admin-worker/src/index.js",
  "wrangler.admin.staging.jsonc",
  "wrangler.public.staging.jsonc"
];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    issues.push(`Missing Stage 2 file: ${rel}`);
  }
}

const admin = fs.readFileSync(path.join(root, "admin-worker/src/index.js"), "utf8");
const auth = fs.readFileSync(path.join(root, "admin-worker/src/auth.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "migrations/0002_application_schema.sql"), "utf8");
const rbac = fs.readFileSync(path.join(root, "migrations/0003_cms_rbac_seed.sql"), "utf8");

for (const marker of [
  "requireAccessIdentity",
  "/api/identity",
  "/api/me",
  "loadCmsProfile"
]) {
  if (!admin.includes(marker)) issues.push(`Admin Worker marker missing: ${marker}`);
}

for (const marker of [
  "cf-access-jwt-assertion",
  "createRemoteJWKSet",
  "jwtVerify",
  "POLICY_AUD",
  "TEAM_DOMAIN"
]) {
  if (!auth.includes(marker)) issues.push(`Access validation marker missing: ${marker}`);
}

for (const table of [
  "site_sections",
  "chapels",
  "sermons",
  "broadcasts",
  "cms_roles",
  "cms_permissions",
  "cms_role_permissions",
  "cms_admins",
  "cms_admin_scopes",
  "content_history",
  "publish_jobs"
]) {
  if (!schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
    issues.push(`D1 table missing from schema: ${table}`);
  }
}

for (const role of [
  "super_admin",
  "content_manager",
  "communications_editor",
  "ministry_editor",
  "chapel_content_manager",
  "giving_editor",
  "site_editor",
  "viewer"
]) {
  if (!rbac.includes(`'${role}'`)) {
    issues.push(`CMS role missing from seed: ${role}`);
  }
}

if (issues.length) {
  console.error("Cloudflare Stage 2 check FAILED.");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Cloudflare Stage 2 check: PASS");
console.log("D1 schema, RBAC seed and Access-JWT validation foundation are present.");
