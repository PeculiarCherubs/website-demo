import fs from "node:fs";
import path from "node:path";

const cloudflareRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(cloudflareRoot, "..");
const runtimeConfigPath = path.join(repoRoot, "js", "data", "runtimeConfig.js");
const outDir = path.join(cloudflareRoot, "migration-data");
const outFile = path.join(outDir, "supabase-site-content.json");

function readLegacyConfig() {
  const envUrl = process.env.SUPABASE_URL?.trim();
  const envKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (envUrl && envKey) {
    return { url: envUrl.replace(/\/+$/, ""), anonKey: envKey };
  }

  if (!fs.existsSync(runtimeConfigPath)) {
    throw new Error(
      "Could not find js/data/runtimeConfig.js. Set SUPABASE_URL and SUPABASE_ANON_KEY instead."
    );
  }

  const text = fs.readFileSync(runtimeConfigPath, "utf8");
  const urlMatch = text.match(/supabaseLegacy:[\s\S]*?url:\s*['"]([^'"]+)['"]/);
  const keyMatch = text.match(/supabaseLegacy:[\s\S]*?anonKey:\s*['"]([^'"]+)['"]/);

  if (!urlMatch || !keyMatch) {
    throw new Error(
      "Legacy Supabase config could not be read. Set SUPABASE_URL and SUPABASE_ANON_KEY."
    );
  }

  return {
    url: urlMatch[1].replace(/\/+$/, ""),
    anonKey: keyMatch[1]
  };
}

const { url, anonKey } = readLegacyConfig();
const endpoint =
  `${url}/rest/v1/site_content?select=key,data,updated_at,updated_by&order=key.asc`;

console.log("Exporting canonical public site_content from Supabase...");
const response = await fetch(endpoint, {
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: "application/json"
  }
});

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`Supabase export failed (${response.status}): ${detail.slice(0, 500)}`);
}

const rows = await response.json();

if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error("Supabase returned no site_content rows. Import rehearsal stopped.");
}

for (const row of rows) {
  if (!row?.key || typeof row.data === "undefined") {
    throw new Error("Export contains an invalid site_content row.");
  }
}

fs.mkdirSync(outDir, { recursive: true });

const payload = {
  exported_at: new Date().toISOString(),
  source: "supabase.site_content",
  row_count: rows.length,
  rows
};

fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");

console.log(`Export complete: ${outFile}`);
console.log(`Rows: ${rows.length}`);
console.log("This file is ignored by Git and is for migration/recovery use only.");
