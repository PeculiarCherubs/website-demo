import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(root, "..");
const issues = [];

const required = [
  "migrations/0006_cms_write_api_foundation.sql",
  "admin-worker/src/adminContent.js",
  "admin-worker/src/adminAccess.js",
  "admin-worker/src/index.js",
  "admin-worker/src/rbac.js",
  "wrangler.admin.staging.jsonc",
  "docs/STAGE_5_CMS_READ_WRITE_API.md"
];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    issues.push(`Missing Stage 5 file: ${rel}`);
  }
}

for (const rel of [
  "js/data/adminRuntimeConfig.js",
  "js/data/adminDataClient.js"
]) {
  if (!fs.existsSync(path.join(repoRoot, rel))) {
    issues.push(`Missing browser Admin adapter: ${rel}`);
  }
}

const auth = fs.readFileSync(
  path.join(root, "admin-worker/src/auth.js"),
  "utf8"
);
for (const marker of [
  "cf-access-jwt-assertion",
  "jwtVerify",
  "createRemoteJWKSet",
  "TEAM_DOMAIN",
  "POLICY_AUD"
]) {
  if (!auth.includes(marker)) {
    issues.push(`Static Assets Access fallback missing: ${marker}`);
  }
}

const worker = fs.readFileSync(path.join(root, "admin-worker/src/index.js"), "utf8");
for (const marker of [
  "/api/cms/sections",
  "/api/cms/history",
  "/api/cms/admins/invite",
  "writeScopedChapel",
  "writeScopedBroadcast",
  "upsertScopedSermon",
  "env.ASSETS.fetch"
]) {
  if (!worker.includes(marker)) {
    issues.push(`Admin Worker marker missing: ${marker}`);
  }
}

const content = fs.readFileSync(
  path.join(root, "admin-worker/src/adminContent.js"),
  "utf8"
);
for (const marker of [
  "cms_section_versions",
  "content_conflict",
  "request_id",
  "publish_jobs",
  "content_history",
  "versionAdvanceStatement"
]) {
  if (!content.includes(marker)) {
    issues.push(`Mutation safety marker missing: ${marker}`);
  }
}

const cfg = fs.readFileSync(
  path.join(root, "wrangler.admin.staging.jsonc"),
  "utf8"
);
for (const marker of [
  '"binding": "ASSETS"',
  '"run_worker_first": true',
  '"CMS_PROVIDER": "cloudflare-d1"'
]) {
  if (!cfg.includes(marker)) {
    issues.push(`Admin staging config marker missing: ${marker}`);
  }
}

const adminJs = fs.readFileSync(path.join(repoRoot, "js/admin.js"), "utf8");
for (const marker of [
  "isCloudflareAdminMode()",
  "checkCloudflareAuthStatus()",
  "global.AdminDataClient.saveSection",
  "global.AdminDataClient.saveChapel"
]) {
  if (!adminJs.includes(marker)) {
    issues.push(`Admin UI Cloudflare integration marker missing: ${marker}`);
  }
}

if (issues.length) {
  console.error("Cloudflare Stage 5 check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Cloudflare Stage 5 check: PASS");
console.log("D1 CMS reads/writes, optimistic concurrency, audit correlation, Access invitations and protected Admin assets are present.");
