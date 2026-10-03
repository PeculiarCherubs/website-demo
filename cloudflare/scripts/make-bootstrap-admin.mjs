import fs from "node:fs";
import path from "node:path";

const [subjectRaw, emailRaw, displayNameRaw = ""] = process.argv.slice(2);

if (!subjectRaw || !emailRaw) {
  console.error(
    'Usage: node scripts/make-bootstrap-admin.mjs "<ACCESS_SUBJECT>" "<EMAIL>" ["DISPLAY NAME"]'
  );
  process.exit(1);
}

const subject = String(subjectRaw).trim();
const email = String(emailRaw).trim().toLowerCase();
const displayName = String(displayNameRaw || "").trim();

if (!subject || !email.includes("@")) {
  console.error("Invalid Access subject or email.");
  process.exit(1);
}

const sqlString = value => `'${String(value).replaceAll("'", "''")}'`;
const displaySql = displayName ? sqlString(displayName) : "NULL";

const sql = `-- Generated bootstrap for Peculiar Cherubs staging Super Admin.
PRAGMA foreign_keys = ON;

INSERT INTO cms_admins (
  access_subject,
  email,
  role_key,
  display_name,
  enabled,
  updated_at
)
VALUES (
  ${sqlString(subject)},
  ${sqlString(email)},
  'super_admin',
  ${displaySql},
  1,
  CURRENT_TIMESTAMP
)
ON CONFLICT(access_subject) DO UPDATE SET
  email = excluded.email,
  role_key = 'super_admin',
  display_name = COALESCE(excluded.display_name, cms_admins.display_name),
  enabled = 1,
  updated_at = CURRENT_TIMESTAMP;

DELETE FROM cms_admin_scopes
WHERE access_subject = ${sqlString(subject)};

INSERT INTO cms_admin_scopes (access_subject, scope_type, scope_key)
VALUES (${sqlString(subject)}, 'global', '*');

INSERT INTO content_history (
  resource_type,
  resource_key,
  action,
  actor_subject,
  actor_email,
  before_json,
  after_json
)
VALUES (
  'cms_admin',
  ${sqlString(subject)},
  'bootstrap_super_admin',
  ${sqlString(subject)},
  ${sqlString(email)},
  NULL,
  json_object(
    'email', ${sqlString(email)},
    'role_key', 'super_admin',
    'scope_type', 'global'
  )
);
`;

const out = path.resolve("scripts", "bootstrap-super-admin.generated.sql");
fs.writeFileSync(out, sql, "utf8");
console.log(`Generated ${out}`);
console.log("Review the file, then apply it to STAGING with Wrangler.");
