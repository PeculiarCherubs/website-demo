import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..");

const read = rel => fs.readFileSync(path.join(repo, rel), "utf8");
const issues = [];

const admin = read("js/admin.js");
for (const marker of [
  "renderMinistryLeaderEditorRows",
  "collectMinistryLeaderEditorRows",
  "ministry-leader-image",
  "ministry-leader-bio",
  "Chapel Content Managers cannot delete chapel or ministry records.",
  "adminAddMinistryBtn"
]) {
  if (!admin.includes(marker)) issues.push(`Admin Stage 6C marker missing: ${marker}`);
}

if (admin.includes(`document.querySelectorAll(\`[onclick*="openItemModal('ministries'"]\`).forEach(el => {
          el.classList.add('admin-permission-hidden');`)) {
  issues.push("Legacy hide-all scoped chapel edit logic remains.");
}

const publicScript = read("script.js");
for (const marker of [
  "ministry-leader-photo",
  "ministry-leader-bio",
  "leader.biography",
  "leader.alt"
]) {
  if (!publicScript.includes(marker)) issues.push(`Public leadership marker missing: ${marker}`);
}

const content = fs.readFileSync(
  path.join(root, "admin-worker", "src", "adminContent.js"),
  "utf8"
);

if (!content.includes('chapels: "ministries.manage"')) {
  issues.push("Full-section chapel writes are no longer restricted to ministries.manage.");
}

if (!content.includes('["chapel.content.manage", "ministries.manage"]')) {
  issues.push("Scoped chapel write permission invariant is missing.");
}

for (const name of [
  "wrangler.public.production.example.jsonc",
  "wrangler.admin.production.example.jsonc"
]) {
  const cfg = fs.readFileSync(path.join(root, name), "utf8");
  if (!cfg.includes('"workers_dev": false')) {
    issues.push(`${name} must disable workers.dev for production.`);
  }
  if (!cfg.includes('"custom_domain": true')) {
    issues.push(`${name} must use a Custom Domain.`);
  }
  if (cfg.includes("peculiar-cherubs-staging") || cfg.includes("peculiar-cherubs-media-staging")) {
    issues.push(`${name} contains a staging resource.`);
  }
}

if (issues.length) {
  console.error("Cloudflare Stage 6C check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Cloudflare Stage 6C check: PASS");
console.log("Chapel leader photo/bio support, scoped chapel edit/delete UX, backend authorization invariants and production templates are present.");
