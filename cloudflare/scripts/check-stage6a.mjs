import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const issues = [];

const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

for (const rel of [
  "migrations/0007_r2_publish_pipeline.sql",
  "admin-worker/src/publishPipeline.js",
  "public-worker/src/snapshotApi.js"
]) {
  if (!fs.existsSync(path.join(root, rel))) {
    issues.push(`Missing Stage 6A file: ${rel}`);
  }
}

const adminConfig = read("wrangler.admin.staging.jsonc");
for (const marker of [
  '"binding": "PUBLIC_SNAPSHOTS"',
  '"binding": "MEDIA"',
  '"crons"',
  "peculiar-cherubs-public-staging",
  "peculiar-cherubs-media-staging"
]) {
  if (!adminConfig.includes(marker)) issues.push(`Admin staging config missing: ${marker}`);
}

const publicConfig = read("wrangler.public.staging.jsonc");
for (const marker of [
  '"binding": "PUBLIC_SNAPSHOTS"',
  '"PUBLIC_READ_MODE"'
]) {
  if (!publicConfig.includes(marker)) issues.push(`Public staging config missing: ${marker}`);
}

const adminWorker = read("admin-worker/src/index.js");
for (const marker of [
  "/api/cms/publish/status",
  "/api/cms/publish/bootstrap",
  "/api/cms/publish/run",
  "/api/cms/publish/retry-failed",
  "async scheduled(",
  'stage: "cloudflare-stage-6'
]) {
  if (!adminWorker.includes(marker)) issues.push(`Admin Worker Stage 6A marker missing: ${marker}`);
}

const publisher = read("admin-worker/src/publishPipeline.js");
for (const marker of [
  "publication_state",
  "PUBLIC_SNAPSHOTS.put",
  "recoverStuckProcessingJobs",
  "processPublishJobs",
  "peculiar-cherubs-public-v1"
]) {
  if (!publisher.includes(marker)) issues.push(`Publish pipeline marker missing: ${marker}`);
}

const publicWorker = read("public-worker/src/index.js");
for (const marker of [
  "loadSectionsByReadMode",
  "public_read_mode",
  'stage: "cloudflare-stage-6'
]) {
  if (!publicWorker.includes(marker)) issues.push(`Public Worker Stage 6A marker missing: ${marker}`);
}

const migration = read("migrations/0007_r2_publish_pipeline.sql");
for (const marker of [
  "publication_state",
  "processing_started_at",
  "last_attempt_at",
  "cloudflare-stage-6a-v1"
]) {
  if (!migration.includes(marker)) issues.push(`Migration 0007 marker missing: ${marker}`);
}

if (issues.length) {
  console.error("Cloudflare Stage 6A check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Cloudflare Stage 6A check: PASS");
console.log("R2 bindings, publication outbox processing and public snapshot read-mode support are present.");
