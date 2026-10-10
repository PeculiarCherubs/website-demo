import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const readRepo = rel => fs.readFileSync(path.join(repo, rel), "utf8");
const issues = [];

for (const rel of [
  "migrations/0008_media_library.sql",
  "admin-worker/src/mediaLibrary.js",
  "admin-worker/src/mediaServe.js",
  "public-worker/src/mediaApi.js"
]) {
  if (!fs.existsSync(path.join(root, rel))) issues.push(`Missing Stage 6B file: ${rel}`);
}

const migration = read("migrations/0008_media_library.sql");
for (const marker of ["media_assets", "media.manage", "cloudflare-stage-6b-v1"]) {
  if (!migration.includes(marker)) issues.push(`Migration marker missing: ${marker}`);
}

const adminWorker = read("admin-worker/src/index.js");
for (const marker of ["/api/cms/media", "uploadMediaAsset", "deleteMediaAsset", 'stage: "cloudflare-stage-6b"']) {
  if (!adminWorker.includes(marker)) issues.push(`Admin Worker media marker missing: ${marker}`);
}

const publicWorker = read("public-worker/src/index.js");
for (const marker of ["/media/", "serveMediaObject", 'stage: "cloudflare-stage-6b"']) {
  if (!publicWorker.includes(marker)) issues.push(`Public Worker media marker missing: ${marker}`);
}

const publicConfig = read("wrangler.public.staging.jsonc");
for (const marker of ['"binding": "MEDIA"', '"PUBLIC_READ_MODE": "r2-prefer"', '"/media/*"']) {
  if (!publicConfig.includes(marker)) issues.push(`Public config media marker missing: ${marker}`);
}

const adminHtml = readRepo("admin/index.html");
const adminJs = readRepo("js/admin.js");
const client = readRepo("js/data/adminDataClient.js");
for (const marker of ["panelMedia", "adminMediaUploadForm", "badgeMedia"]) {
  if (!adminHtml.includes(marker)) issues.push(`Admin media UI missing: ${marker}`);
}
for (const marker of ["loadMediaLibrary()", "uploadMediaFromForm()", "deleteMediaAsset(assetId)", "media.manage"]) {
  if (!adminJs.includes(marker)) issues.push(`Admin media controller missing: ${marker}`);
}
for (const marker of ["listMedia(", "uploadMedia(", "deleteMedia(", "instanceof FormData"]) {
  if (!client.includes(marker)) issues.push(`AdminDataClient media marker missing: ${marker}`);
}

if (issues.length) {
  console.error("Cloudflare Stage 6B check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Cloudflare Stage 6B check: PASS");
console.log("R2 media metadata, scoped upload/list/delete APIs, public media serving and CMS Media Library are present.");
