import assert from "node:assert/strict";
import { setAdminRole, CmsAdminAccessError } from "../admin-worker/src/adminAccess.js";

const knownChapels = new Set(["pdcm-english", "pdcm-gwarinpa", "peculiar-hq"]);

const admins = new Map([
  ["super-1", { access_subject: "super-1", email: "one@example.org", role_key: "super_admin", enabled: 1 }],
  ["super-2", { access_subject: "super-2", email: "two@example.org", role_key: "super_admin", enabled: 1 }]
]);

const invites = new Map([
  ["pending@example.org", {
    email: "pending@example.org",
    role_key: "super_admin",
    scope_type: "global",
    chapel_keys_json: "[]",
    enabled: 1
  }]
]);

const scopes = new Map([
  ["super-1", [{ scope_type: "global", scope_key: "*" }]],
  ["super-2", [{ scope_type: "global", scope_key: "*" }]]
]);

function norm(value) {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

class Statement {
  constructor(text) { this.sql = text; this.args = []; }
  bind(...args) { this.args = args; return this; }

  async first() {
    const q = norm(this.sql);

    if (q.includes("from cms_roles") && q.includes("where role_key = ?")) {
      return { role_key: this.args[0], label: "Role" };
    }

    if (q.includes("select count(*) as count") && q.includes("role_key = 'super_admin'")) {
      return {
        count: [...admins.values()].filter(
          row => row.role_key === "super_admin" && row.enabled === 1
        ).length
      };
    }

    if (q.includes("from cms_admins") && q.includes("where access_subject = ?")) {
      const row = admins.get(this.args[0]);
      return row ? { role_key: row.role_key } : null;
    }

    if (q.includes("from cms_admin_invites") && q.includes("lower(email)")) {
      return invites.get(String(this.args[0]).toLowerCase()) || null;
    }

    return null;
  }

  async all() {
    const q = norm(this.sql);
    if (q.includes("from chapels") && q.includes("published = 1")) {
      return {
        results: this.args
          .filter(key => knownChapels.has(String(key)))
          .map(id => ({ id: String(id) }))
      };
    }
    return { results: [] };
  }

  async run() {
    const q = norm(this.sql);

    if (q.includes("update cms_admin_invites")) {
      const [roleKey, scopeType, keysJson, email] = this.args;
      const key = String(email).toLowerCase();
      const row = invites.get(key);
      if (row) {
        invites.set(key, {
          ...row,
          role_key: roleKey,
          scope_type: scopeType,
          chapel_keys_json: keysJson
        });
      }
    }

    return { success: true };
  }
}

const env = {
  DB: {
    prepare(text) { return new Statement(text); },

    async batch(statements) {
      for (const statement of statements) {
        const q = norm(statement.sql);

        if (q.includes("update cms_admins") && q.includes("set role_key = ?")) {
          const [roleKey, subject] = statement.args;
          const row = admins.get(subject);
          if (row) admins.set(subject, { ...row, role_key: roleKey });
          continue;
        }

        if (q.startsWith("delete from cms_admin_scopes")) {
          scopes.set(statement.args[0], []);
          continue;
        }

        if (q.includes("insert into cms_admin_scopes")) {
          const subject = statement.args[0];
          const rows = scopes.get(subject) || [];

          if (q.includes("values (?, 'global', '*')")) {
            rows.push({ scope_type: "global", scope_key: "*" });
          } else if (q.includes("values (?, 'chapel', ?)")) {
            rows.push({ scope_type: "chapel", scope_key: statement.args[1] });
          }

          scopes.set(subject, rows);
        }
      }

      return statements.map(() => ({ success: true }));
    }
  }
};

const profile = { role_key: "super_admin", permissions: ["admins.manage"] };

const active = await setAdminRole(env, profile, "super-1", {
  role_key: "chapel_content_manager",
  chapel_keys: ["pdcm-english"]
});

assert.equal(active.ok, true);
assert.equal(admins.get("super-1").role_key, "chapel_content_manager");
assert.deepEqual(scopes.get("super-1"), [
  { scope_type: "chapel", scope_key: "pdcm-english" }
]);

const pending = await setAdminRole(env, profile, "invite:pending@example.org", {
  role_key: "chapel_content_manager",
  chapel_keys: ["pdcm-gwarinpa"]
});

assert.equal(pending.ok, true);
assert.equal(invites.get("pending@example.org").role_key, "chapel_content_manager");
assert.equal(invites.get("pending@example.org").scope_type, "chapel");
assert.deepEqual(
  JSON.parse(invites.get("pending@example.org").chapel_keys_json),
  ["pdcm-gwarinpa"]
);

let lastError = null;
try {
  await setAdminRole(env, profile, "super-2", {
    role_key: "chapel_content_manager",
    chapel_keys: ["peculiar-hq"]
  });
} catch (err) {
  lastError = err;
}

assert(lastError instanceof CmsAdminAccessError);
assert.equal(lastError.code, "last_super_admin_required");
assert.equal(lastError.status, 409);

console.log("Stage 5 role/scope transition runtime test: PASS");
console.log("Active and pending Super Admins can become scoped Chapel Content Managers, while the last active Super Admin remains protected.");
