import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const source = fs.readFileSync(
  path.join(root, "admin-worker", "src", "mediaLibrary.js"),
  "utf8"
);

const issues = [];

const usageStart = source.indexOf("async function findMediaUsage");
const deleteStart = source.indexOf("export async function deleteMediaAsset");
const usageBlock = source.slice(usageStart, deleteStart);

if (!usageBlock.includes("env.DB.batch(statements)")) {
  issues.push("Media usage checks are not executed through D1 batch().");
}

if (usageBlock.includes("Promise.all(")) {
  issues.push("Delete-only concurrent Promise.all D1 fan-out remains.");
}

for (const marker of [
  "instr(COALESCE(data_json, ''), ?) > 0",
  "instr(COALESCE(page_json, ''), ?) > 0",
  "media_usage_check_failed",
  "media_r2_delete_failed",
  "media_metadata_delete_failed"
]) {
  if (!source.includes(marker)) {
    issues.push(`Media delete hardening marker missing: ${marker}`);
  }
}

if (issues.length) {
  console.error("Stage 6B media-delete check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 6B media-delete check: PASS");
console.log("Delete usage detection is sequential D1 batch-based and delete failures are stage-specific.");
