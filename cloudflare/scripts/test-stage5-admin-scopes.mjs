import assert from "node:assert/strict";
import {
  inviteAdmin,
  setAdminScopes,
  CmsAdminAccessError
} from "../admin-worker/src/adminAccess.js";

const knownChapels = new Set([
  "peculiar-hq",
  "pdcm-english",
  "pdcm-gwarinpa",
  "pdcm-byazhin",
  "pdcm-mega-youth"
]);

const inviteRows = new Map();
const adminRows = new Map([
  ["subject-existing", {
    access_subject: "subject-existing",
    email: "existing@example.org",
    role_key: "chapel_content_manager"
  }]
]);
const scopeRows = new Map();

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

class FakeStatement {
  constructor(sql) {
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const sql = normalizeSql(this.sql);

    if (sql.includes("from cms_roles") && sql.includes("where role_key = ?")) {
      return {
        role_key: this.args[0],
        label: "Role",
        description: "",
        sort_order: 1
      };
    }

    if (sql.includes("from cms_admins") && sql.includes("lower(email)")) {
      const email = String(this.args[0] || "").toLowerCase();
      return [...adminRows.values()].find(
        row => String(row.email).toLowerCase() === email
      ) || null;
    }

    if (
      sql.includes("from cms_admins") &&
      sql.includes("where access_subject = ?")
    ) {
      const row = adminRows.get(this.args[0]);
      return row ? { role_key: row.role_key } : null;
    }

    if (sql.includes("from cms_admin_invites") && sql.includes("lower(email)")) {
      const email = String(this.args[0] || "").toLowerCase();
      const row = inviteRows.get(email);
      return row ? { ...row } : null;
    }

    return null;
  }

  async all() {
    const sql = normalizeSql(this.sql);

    if (sql.includes("from chapels") && sql.includes("published = 1")) {
      return {
        results: this.args
          .filter(key => knownChapels.has(String(key)))
          .map(id => ({ id: String(id) }))
      };
    }

    return { results: [] };
  }

  async run() {
    const sql = normalizeSql(this.sql);

    if (sql.includes("insert into cms_admin_invites")) {
      const [
        email,
        roleKey,
        scopeType,
        chapelKeysJson,
        invitedBy
      ] = this.args;

      inviteRows.set(String(email).toLowerCase(), {
        email,
        role_key: roleKey,
        scope_type: scopeType,
        chapel_keys_json: chapelKeysJson,
        enabled: 1,
        invited_by: invitedBy
      });
    }

    if (sql.includes("update cms_admin_invites")) {
      const [scopeType, chapelKeysJson, email] = this.args;
      const key = String(email).toLowerCase();
      const existing = inviteRows.get(key);
      if (existing) {
        inviteRows.set(key, {
          ...existing,
          scope_type: scopeType,
          chapel_keys_json: chapelKeysJson
        });
      }
    }

    return { success: true };
  }
}

const env = {
  DB: {
    prepare(sql) {
      return new FakeStatement(sql);
    },

    async batch(statements) {
      for (const statement of statements) {
        const sql = normalizeSql(statement.sql);

        if (
          sql.startsWith("delete from cms_admin_scopes") &&
          sql.includes("where access_subject = ?")
        ) {
          scopeRows.set(statement.args[0], []);
          continue;
        }

        if (sql.includes("insert into cms_admin_scopes")) {
          const subject = statement.args[0];
          const existing = scopeRows.get(subject) || [];

          if (sql.includes("values (?, 'chapel', ?)")) {
            existing.push({
              scope_type: "chapel",
              scope_key: statement.args[1]
            });
          } else if (sql.includes("values (?, 'global', '*')")) {
            existing.push({
              scope_type: "global",
              scope_key: "*"
            });
          }

          scopeRows.set(subject, existing);
        }
      }

      return statements.map(() => ({ success: true }));
    }
  }
};

const superAdminProfile = {
  role_key: "super_admin",
  permissions: ["admins.manage"]
};

const identity = {
  subject: "subject-super",
  email: "super@example.org"
};

// 1) New invitation with one chapel must persist the selected scope.
const inviteResult = await inviteAdmin(
  env,
  superAdminProfile,
  identity,
  {
    email: "new.manager@example.org",
    role_key: "chapel_content_manager",
    scope_type: "chapel",
    chapel_keys: ["pdcm-english"]
  }
);

assert.equal(inviteResult.ok, true);
assert.deepEqual(inviteResult.chapel_scopes, ["pdcm-english"]);

const savedInvite = inviteRows.get("new.manager@example.org");
assert(savedInvite, "Invite row should have been written.");
assert.equal(savedInvite.scope_type, "chapel");
assert.deepEqual(
  JSON.parse(savedInvite.chapel_keys_json),
  ["pdcm-english"]
);

// 2) Existing chapel manager scope update must persist to cms_admin_scopes.
const scopeResult = await setAdminScopes(
  env,
  superAdminProfile,
  "subject-existing",
  {
    scope_type: "chapel",
    chapel_keys: ["pdcm-gwarinpa", "pdcm-byazhin"]
  }
);

assert.equal(scopeResult.ok, true);
assert.deepEqual(
  scopeRows.get("subject-existing"),
  [
    { scope_type: "chapel", scope_key: "pdcm-gwarinpa" },
    { scope_type: "chapel", scope_key: "pdcm-byazhin" }
  ]
);

// 3) Invalid location keys must still fail closed.
let invalidError = null;
try {
  await inviteAdmin(
    env,
    superAdminProfile,
    identity,
    {
      email: "bad.scope@example.org",
      role_key: "chapel_content_manager",
      scope_type: "chapel",
      chapel_keys: ["not-a-real-chapel"]
    }
  );
} catch (err) {
  invalidError = err;
}

assert(invalidError instanceof CmsAdminAccessError);
assert.equal(invalidError.code, "unknown_chapel_scope");
assert.equal(invalidError.status, 400);

console.log("Stage 5 admin-scope runtime test: PASS");
console.log("Invite scopes persist, existing-admin scopes persist, and invalid chapel keys fail closed.");
