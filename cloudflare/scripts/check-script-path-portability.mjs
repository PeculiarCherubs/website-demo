import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsDir = __dirname;

const issues = [];
const self = path.basename(__filename);

for (const entry of fs.readdirSync(scriptsDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!/\.(?:mjs|js|cjs)$/.test(entry.name)) continue;
  if (entry.name === self) continue;

  const file = path.join(scriptsDir, entry.name);
  const source = fs.readFileSync(file, "utf8");

  if (source.includes("new URL(import.meta.url).pathname")) {
    issues.push(
      `${entry.name}: Windows-unsafe new URL(import.meta.url).pathname`
    );
  }
}

if (issues.length) {
  console.error("Cloudflare script path-portability check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Cloudflare script path-portability check: PASS");
console.log("No Cloudflare checker uses URL pathname conversion that can produce C:\\\\C:\\\\... on Windows.");
