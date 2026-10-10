import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const files = [
  "wrangler.public.production.jsonc",
  "wrangler.admin.production.jsonc"
];

const issues = [];

for (const name of files) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) {
    issues.push(`${name} does not exist. Copy it from the matching .example.jsonc template.`);
    continue;
  }

  const source = fs.readFileSync(file, "utf8");

  for (const forbidden of [
    "REPLACE_WITH_",
    "peculiar-cherubs-staging",
    "peculiar-cherubs-public-staging",
    "peculiar-cherubs-media-staging"
  ]) {
    if (source.includes(forbidden)) {
      issues.push(`${name} still contains '${forbidden}'.`);
    }
  }

  if (!source.includes('"workers_dev": false')) {
    issues.push(`${name} must set workers_dev=false.`);
  }

  if (!source.includes('"custom_domain": true')) {
    issues.push(`${name} must configure a Custom Domain.`);
  }

  if (!source.includes('"ENVIRONMENT": "production"')) {
    issues.push(`${name} must declare ENVIRONMENT=production.`);
  }
}

if (issues.length) {
  console.error("Production cutover gate: NOT READY.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Production cutover gate: READY");
console.log("Production Worker configs contain no placeholders or staging resources.");
