import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "admin-worker", "src", "adminAccess.js"),
  "utf8"
);

const issues = [];

const goodCall = /validateChapelKeys\(\s*env,\s*requestChapelKeys\(body\)\s*\)/g;
const matches = source.match(goodCall) || [];

if (matches.length !== 3) {
  issues.push(`Expected 3 validateChapelKeys(env, requestChapelKeys(body)) calls; found ${matches.length}.`);
}

if (/validateChapelKeys\(\s*requestChapelKeys\(body\)\s*\)/.test(source)) {
  issues.push("Broken validateChapelKeys call without env is still present.");
}

if (!source.includes("cms_scope_validation_unavailable")) {
  issues.push("validateChapelKeys environment guard is missing.");
}

if (issues.length) {
  console.error("Stage 5 admin-scope wiring check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 5 admin-scope wiring check: PASS");
console.log("All scope-validation call sites pass env and fail loudly if D1 is unavailable.");
