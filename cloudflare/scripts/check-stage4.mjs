import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(root, "..");
const issues = [];

const required = [
  "migrations/0005_public_contract_payloads.sql",
  "public-worker/src/contentContract.js",
  "public-worker/src/publicApi.js",
  "public-worker/src/index.js",
  "wrangler.public.staging.jsonc",
  "docs/STAGE_4_PUBLIC_READ_API_PARITY.md"
];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    issues.push(`Missing Stage 4 file: ${rel}`);
  }
}

if (!fs.existsSync(path.join(repoRoot, ".assetsignore"))) {
  issues.push("Missing root .assetsignore.");
}

const worker = fs.readFileSync(path.join(root, "public-worker/src/index.js"), "utf8");
for (const marker of [
  "/api/public/sections",
  "/api/public/manifest",
  "/js/data/runtimeConfig.js",
  "assertDatabaseReady",
  "env.ASSETS.fetch"
]) {
  if (!worker.includes(marker)) {
    issues.push(`Public Worker marker missing: ${marker}`);
  }
}

const cfg = fs.readFileSync(path.join(root, "wrangler.public.staging.jsonc"), "utf8");
for (const marker of [
  '"PUBLIC_PROVIDER": "cloudflare"',
  '"/js/data/runtimeConfig.js"',
  '"/admin/*"'
]) {
  if (!cfg.includes(marker)) {
    issues.push(`Staging public config marker missing: ${marker}`);
  }
}

const transform = fs.readFileSync(
  path.join(root, "scripts/transform-supabase-to-d1.mjs"),
  "utf8"
);
for (const marker of [
  "public_json",
  "canonicalCurrentLocations",
  "Peculiar HQ"
]) {
  if (!transform.includes(marker)) {
    issues.push(`Stage 3 transformer parity marker missing: ${marker}`);
  }
}

const ignore = fs.readFileSync(path.join(repoRoot, ".assetsignore"), "utf8");
for (const marker of ["admin/", "cloudflare/", "supabase/", "scripts/", "docs/"]) {
  if (!ignore.includes(marker)) {
    issues.push(`.assetsignore does not exclude ${marker}`);
  }
}

if (issues.length) {
  console.error("Cloudflare Stage 4 check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Cloudflare Stage 4 check: PASS");
console.log("Public API, D1 contract projection, staging provider injection and asset hardening are present.");
