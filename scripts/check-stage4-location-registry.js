const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const give = fs.readFileSync(path.join(root, "give.html"), "utf8");

const issues = [];

for (const marker of [
  "function worshipLocationRegistry(content)",
  'label: "All Chapels"',
  "...worshipLocationRegistry(content)",
  'const givingLocations = worshipLocationRegistry(content);',
  'document.getElementById("give-location")',
  "activeGivingLocation"
]) {
  if (!script.includes(marker)) issues.push(`Missing registry marker: ${marker}`);
}

if (!give.includes('id="give-location"')) {
  issues.push("Giving page is missing the canonical location selector.");
}

if (!give.includes("Giving Category / Purpose *")) {
  issues.push("Giving purpose field was removed or renamed unexpectedly.");
}

if (script.includes('label: "All Worship Locations"')) {
  issues.push('Church-facing CHAPELS terminology was changed without approval.');
}

if (issues.length) {
  console.error("Stage 4.1 location-registry check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 4.1 location-registry check: PASS");
console.log("CHAPELS terminology is preserved while navigation and Giving share the canonical location registry.");
