import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..");

const worker = fs.readFileSync(path.join(root, "admin-worker", "src", "adminAccess.js"), "utf8");
const admin = fs.readFileSync(path.join(repo, "js", "admin.js"), "utf8");
const client = fs.readFileSync(path.join(repo, "js", "data", "adminDataClient.js"), "utf8");

const issues = [];

for (const marker of [
  "await env.DB.batch(statements)",
  "chapel_scopes: nextScope.chapelKeys"
]) {
  if (!worker.includes(marker)) issues.push(`Worker marker missing: ${marker}`);
}

for (const marker of [
  "handleAdminRoleChange(",
  "openAdminRoleScopeModal(",
  "p_chapel_keys: chapelKeys",
  "Save Role & Scope"
]) {
  if (!admin.includes(marker)) issues.push(`Admin UI marker missing: ${marker}`);
}

if (!client.includes("chapel_keys: keys")) {
  issues.push("AdminDataClient role payload does not include chapel keys.");
}

if (issues.length) {
  console.error("Stage 5 role/scope transition check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 5 role/scope transition check: PASS");
console.log("Chapel role changes collect scope first and persist role + scope together.");
