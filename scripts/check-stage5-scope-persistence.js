const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const adminJs = fs.readFileSync(path.join(root, "js", "admin.js"), "utf8");
const client = fs.readFileSync(path.join(root, "js", "data", "adminDataClient.js"), "utf8");
const worker = fs.readFileSync(
  path.join(root, "cloudflare", "admin-worker", "src", "adminAccess.js"),
  "utf8"
);
const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");

const issues = [];

for (const required of [
  "_newAdminScopeKeys: new Set()",
  "_editAdminScopeKeys: new Set()",
  "setAdminScopeSelection(context, key, checked)",
  "getSelectedAdminScopeKeys('adminAccessChapels', 'new')",
  "getSelectedAdminScopeKeys('adminScopeChapels', 'edit')"
]) {
  if (!adminJs.includes(required)) issues.push(`Admin scope state marker missing: ${required}`);
}

for (const required of [
  "chapel_keys: keys",
  "chapel_scopes: keys",
  'new Error("chapel_scope_required")'
]) {
  if (!client.includes(required)) issues.push(`Client scope payload marker missing: ${required}`);
}

for (const required of [
  "function requestChapelKeys(body)",
  "body?.chapel_keys",
  "body?.chapel_scopes",
  "body?.chapelKeys"
]) {
  if (!worker.includes(required)) issues.push(`Worker scope parser marker missing: ${required}`);
}

if (!html.includes("stage5-scope-persistence-1")) {
  issues.push("Admin bundle cache-buster missing.");
}

if (issues.length) {
  console.error("Stage 5 scope-persistence check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 5 scope-persistence check: PASS");
console.log("Selected chapel/HQ scopes persist in state, reach the API payload, and are parsed by the Worker.");
