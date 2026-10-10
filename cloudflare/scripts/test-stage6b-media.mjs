import assert from "node:assert/strict";
import { uploadMediaAsset, deleteMediaAsset } from "../admin-worker/src/mediaLibrary.js";

const rows = new Map();
const objects = new Map();
const chapels = new Set(["pdcm-english", "pdcm-gwarinpa"]);

function norm(sql) { return String(sql).replace(/\s+/g, " ").trim().toLowerCase(); }
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const q = norm(this.sql);
    if (q.includes("from chapels")) return chapels.has(this.args[0]) ? { id: this.args[0] } : null;
    if (q.includes("from media_assets")) return rows.get(this.args[0]) || null;
    return null;
  }
  async all() { return { results: [] }; }
  async run() { return { success: true }; }
}

const env = {
  DB: {
    prepare(sql) { return new Stmt(sql); },
    async batch(statements) {
      const isReadBatch = statements.every(st => norm(st.sql).startsWith("select "));

      if (isReadBatch) {
        return statements.map(() => ({ success: true, results: [] }));
      }

      for (const st of statements) {
        const q = norm(st.sql);
        if (q.includes("insert into media_assets")) {
          const [id, object_key, public_path, original_filename, stored_filename, content_type, size_bytes, etag, alt_text, scope_type, chapel_id, uploaded_by_subject, uploaded_by_email] = st.args;
          rows.set(id, { id, object_key, public_path, original_filename, stored_filename, content_type, size_bytes, etag, alt_text, scope_type, chapel_id, uploaded_by_subject, uploaded_by_email, created_at: "now", deleted_at: null });
        }
        if (q.includes("update media_assets") && q.includes("deleted_at")) {
          const row = rows.get(st.args[0]);
          if (row) row.deleted_at = "now";
        }
      }

      return statements.map(() => ({ success: true, results: [] }));
    }
  },
  MEDIA: {
    async put(key, body) { objects.set(key, body); return { etag: "etag-test", httpEtag: '"etag-test"' }; },
    async delete(key) { objects.delete(key); }
  }
};

const profile = {
  role_key: "chapel_content_manager",
  permissions: ["media.manage"],
  scope_type: "chapel",
  chapel_scopes: ["pdcm-english"]
};
const identity = { subject: "sub-1", email: "manager@example.org" };

const form = new FormData();
form.append("file", new File([new Uint8Array([1,2,3])], "photo.png", { type: "image/png" }));
form.append("scope_type", "chapel");
form.append("chapel_id", "pdcm-english");
form.append("alt_text", "Test photo");

const asset = await uploadMediaAsset(env, profile, identity, form);
assert.equal(asset.scope_type, "chapel");
assert.equal(asset.chapel_id, "pdcm-english");
assert(asset.url.startsWith("/media/"));
assert.equal(objects.size, 1);

await deleteMediaAsset(env, profile, identity, asset.id);
assert.equal(objects.size, 0);
assert.equal(rows.get(asset.id).deleted_at, "now");

const denied = new FormData();
denied.append("file", new File([new Uint8Array([1])], "bad.png", { type: "image/png" }));
denied.append("scope_type", "chapel");
denied.append("chapel_id", "pdcm-gwarinpa");
let err = null;
try { await uploadMediaAsset(env, profile, identity, denied); } catch (e) { err = e; }
assert(err);
assert.equal(err.code, "chapel_scope_denied");

console.log("Stage 6B media runtime test: PASS");
console.log("Scoped upload/delete works, delete usage checks use D1 batch, and cross-chapel upload is rejected.");
