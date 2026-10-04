const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "js", "admin.js"), "utf8");

const issues = [];

for (const forbidden of [
  'class="admin-select admin-multi-select" multiple',
  "selectedOptions"
]) {
  if (html.includes(forbidden) || js.includes(forbidden)) {
    issues.push(`Legacy multi-select scope UI remains: ${forbidden}`);
  }
}

for (const required of [
  "admin-scope-checkbox-list",
  "getAdminScopeLocations()",
  "getSelectedAdminScopeKeys(containerId, context = '')",
  "getSelectedAdminScopeKeys('adminAccessChapels', 'new')",
  "getSelectedAdminScopeKeys('adminScopeChapels', 'edit')",
  "peculiar-hq"
]) {
  if (!html.includes(required) && !js.includes(required)) {
    issues.push(`Scope-selector marker missing: ${required}`);
  }
}

if (issues.length) {
  console.error("Stage 5 scope-selector check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 5 scope-selector check: PASS");
console.log("Chapel/HQ scopes use explicit checkboxes and controlled selected keys.");
