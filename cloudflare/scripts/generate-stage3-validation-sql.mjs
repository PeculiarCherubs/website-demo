import fs from "node:fs";
import path from "node:path";

const cloudflareRoot = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(cloudflareRoot, "migration-data", "d1-import-report.json");
const outPath = path.join(cloudflareRoot, "migration-data", "d1-validation.generated.sql");

if (!fs.existsSync(reportPath)) {
  throw new Error("Run transform-supabase-to-d1.mjs first.");
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (!report.ok) throw new Error("Transformation report is not successful.");

const q = [];
q.push("-- GENERATED Stage 3 D1 validation queries.");
q.push("SELECT 'site_sections' AS resource, COUNT(*) AS actual_count, " +
       `${Number(report.output.site_sections)} AS expected_count FROM site_sections;`);
q.push("SELECT 'chapels' AS resource, COUNT(*) AS actual_count, " +
       `${Number(report.output.chapels)} AS expected_count FROM chapels;`);
q.push("SELECT 'sermons' AS resource, COUNT(*) AS actual_count, " +
       `${Number(report.output.sermons)} AS expected_count FROM sermons;`);
q.push("SELECT 'broadcasts' AS resource, COUNT(*) AS actual_count, " +
       `${Number(report.output.broadcasts)} AS expected_count FROM broadcasts;`);
q.push("");
q.push("SELECT id, slug, title, location_type, published FROM chapels ORDER BY id;");
q.push("");
q.push("SELECT chapel_id, status_override, title, video_url, starts_at, ends_at FROM broadcasts ORDER BY chapel_id;");
q.push("");
q.push("SELECT chapel_id, COUNT(*) AS sermon_count FROM sermons GROUP BY chapel_id ORDER BY chapel_id;");
q.push("");
q.push(`SELECT COUNT(*) AS broken_sermon_chapel_refs
FROM sermons s
LEFT JOIN chapels c ON c.id = s.chapel_id
WHERE c.id IS NULL;`);
q.push("");
q.push(`SELECT COUNT(*) AS broken_broadcast_chapel_refs
FROM broadcasts b
LEFT JOIN chapels c ON c.id = b.chapel_id
WHERE c.id IS NULL;`);
q.push("");
q.push(`SELECT COUNT(*) AS broken_published_sermon_refs
FROM broadcasts b
LEFT JOIN sermons s ON s.id = b.published_sermon_id
WHERE b.published_sermon_id IS NOT NULL
  AND s.id IS NULL;`);
q.push("");
q.push("SELECT key, value, updated_at FROM schema_meta WHERE key IN ('architecture','application_schema','cms_rbac_seed','worship_location_model','last_import_rehearsal') ORDER BY key;");

fs.writeFileSync(outPath, q.join("\n\n") + "\n", "utf8");
console.log(`Generated ${outPath}`);
