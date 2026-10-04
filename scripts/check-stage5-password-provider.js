const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "js", "admin.js"), "utf8");
const issues = [];

for (const marker of [
  "changePasswordBtn.hidden = this.isCloudflareAdminMode() || !session",
  "Password management is handled by Cloudflare Access",
  "OTP users do not have a CMS password"
]) {
  if (!js.includes(marker)) issues.push(`Missing provider-aware password marker: ${marker}`);
}

if (issues.length) {
  console.error("Stage 5 password-provider check FAILED.");
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Stage 5 password-provider check: PASS");
console.log("Cloudflare Access sessions no longer expose the legacy Supabase password action.");
