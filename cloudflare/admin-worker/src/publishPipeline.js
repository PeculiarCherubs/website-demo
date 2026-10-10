import { PUBLIC_SECTION_KEYS } from "../../public-worker/src/contentContract.js";
import { loadPublicSections } from "../../public-worker/src/publicApi.js";
import { CmsAuthorizationError } from "./rbac.js";

const SNAPSHOT_PREFIX = "public/sections/";
const MANIFEST_KEY = "public/manifest.json";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export class PublishPipelineError extends Error {
  constructor(code, status = 500) {
    super(code);
    this.name = "PublishPipelineError";
    this.code = code;
    this.status = status;
  }
}

function requireSuperAdmin(profile) {
  if (profile?.role_key !== "super_admin") {
    throw new CmsAuthorizationError("super_admin_required", 403);
  }
}

function requireBindings(env) {
  if (!env?.DB) {
    throw new PublishPipelineError("publish_database_unavailable", 503);
  }
  if (!env?.PUBLIC_SNAPSHOTS) {
    throw new PublishPipelineError("r2_public_snapshot_binding_missing", 503);
  }
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function cleanError(error) {
  return String(error?.code || error?.message || "publish_failed")
    .slice(0, 500);
}

function snapshotKey(sectionKey) {
  return `${SNAPSHOT_PREFIX}${sectionKey}.json`;
}

async function recoverStuckProcessingJobs(env) {
  await env.DB.prepare(`
    UPDATE publish_jobs
    SET
      status = 'pending',
      processing_started_at = NULL,
      last_error = COALESCE(last_error, 'recovered_stale_processing_job')
    WHERE status = 'processing'
      AND processing_started_at IS NOT NULL
      AND datetime(processing_started_at) <= datetime('now', '-15 minutes')
  `).run();
}

async function claimJob(env, id) {
  const result = await env.DB.prepare(`
    UPDATE publish_jobs
    SET
      status = 'processing',
      attempts = attempts + 1,
      processing_started_at = CURRENT_TIMESTAMP,
      last_attempt_at = CURRENT_TIMESTAMP,
      last_error = NULL
    WHERE id = ?
      AND status = 'pending'
  `).bind(id).run();

  return Number(result?.meta?.changes || 0) === 1;
}

async function markFailed(env, id, error) {
  await env.DB.prepare(`
    UPDATE publish_jobs
    SET
      status = 'failed',
      last_error = ?,
      processing_started_at = NULL
    WHERE id = ?
  `).bind(cleanError(error), id).run();
}

async function writeManifest(env) {
  const state = await env.DB.prepare(`
    SELECT
      resource_key,
      published_version,
      object_key,
      etag,
      request_id,
      published_at
    FROM publication_state
    WHERE resource_type = 'section'
    ORDER BY resource_key
  `).all();

  const byKey = Object.fromEntries(
    (state.results || []).map(row => [
      row.resource_key,
      {
        version: Number(row.published_version || 1),
        object_key: row.object_key,
        etag: row.etag || null,
        request_id: row.request_id || null,
        published_at: row.published_at || null
      }
    ])
  );

  const payload = {
    ok: true,
    contract: "peculiar-cherubs-public-v1",
    publication_pipeline: "cloudflare-stage-6a-v1",
    generated_at: new Date().toISOString(),
    sections: PUBLIC_SECTION_KEYS,
    publication: byKey
  };

  await env.PUBLIC_SNAPSHOTS.put(
    MANIFEST_KEY,
    JSON.stringify(payload),
    {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "public, max-age=60"
      },
      customMetadata: {
        contract: "peculiar-cherubs-public-v1",
        pipeline: "cloudflare-stage-6a-v1"
      }
    }
  );

  return payload;
}

async function publishClaimedJob(env, job) {
  if (job.resource_type !== "section") {
    throw new PublishPipelineError("unsupported_publish_resource_type", 400);
  }

  if (!PUBLIC_SECTION_KEYS.includes(job.resource_key)) {
    throw new PublishPipelineError("unsupported_publish_resource_key", 400);
  }

  const already = await env.DB.prepare(`
    SELECT published_version
    FROM publication_state
    WHERE resource_type = 'section'
      AND resource_key = ?
    LIMIT 1
  `).bind(job.resource_key).first();

  if (
    already &&
    Number(already.published_version || 0) >= Number(job.target_version || 0)
  ) {
    await env.DB.prepare(`
      UPDATE publish_jobs
      SET
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        processing_started_at = NULL,
        last_error = NULL
      WHERE id = ?
    `).bind(job.id).run();

    return { skipped: true, key: job.resource_key };
  }

  const sections = await loadPublicSections(env.DB, [job.resource_key]);
  const section = sections[job.resource_key];

  if (!section) {
    throw new PublishPipelineError("public_snapshot_section_missing", 500);
  }

  const publishedAt = new Date().toISOString();
  const key = snapshotKey(job.resource_key);

  const payload = {
    ok: true,
    contract: "peculiar-cherubs-public-v1",
    publication_pipeline: "cloudflare-stage-6a-v1",
    section_key: job.resource_key,
    published_version: Number(job.target_version),
    published_at: publishedAt,
    request_id: job.request_id || null,
    section
  };

  const object = await env.PUBLIC_SNAPSHOTS.put(
    key,
    JSON.stringify(payload),
    {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "public, max-age=60"
      },
      customMetadata: {
        section: job.resource_key,
        version: String(job.target_version),
        contract: "peculiar-cherubs-public-v1"
      }
    }
  );

  const etag = object?.httpEtag || object?.etag || null;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO publication_state (
        resource_type,
        resource_key,
        published_version,
        object_key,
        etag,
        request_id,
        published_at
      )
      VALUES ('section', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(resource_type, resource_key)
      DO UPDATE SET
        published_version = excluded.published_version,
        object_key = excluded.object_key,
        etag = excluded.etag,
        request_id = excluded.request_id,
        published_at = CURRENT_TIMESTAMP
    `).bind(
      job.resource_key,
      job.target_version,
      key,
      etag,
      job.request_id || null
    ),

    env.DB.prepare(`
      UPDATE publish_jobs
      SET
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        processing_started_at = NULL,
        last_error = NULL
      WHERE id = ?
        AND status = 'processing'
    `).bind(job.id)
  ]);

  return {
    skipped: false,
    key: job.resource_key,
    version: Number(job.target_version),
    object_key: key
  };
}

export async function processPublishJobs(env, options = {}) {
  requireBindings(env);
  await recoverStuckProcessingJobs(env);

  const limit = normalizeLimit(options.limit);

  const result = await env.DB.prepare(`
    SELECT
      id,
      resource_type,
      resource_key,
      target_version,
      status,
      attempts,
      request_id,
      created_at
    FROM publish_jobs
    WHERE status = 'pending'
    ORDER BY id
    LIMIT ?
  `).bind(limit).all();

  const summary = {
    attempted: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    results: []
  };

  for (const job of result.results || []) {
    const claimed = await claimJob(env, job.id);
    if (!claimed) continue;

    summary.attempted += 1;

    try {
      const published = await publishClaimedJob(env, job);
      if (published.skipped) summary.skipped += 1;
      else summary.completed += 1;
      summary.results.push({ id: job.id, ok: true, ...published });
    } catch (error) {
      await markFailed(env, job.id, error);
      summary.failed += 1;
      summary.results.push({
        id: job.id,
        ok: false,
        key: job.resource_key,
        error: cleanError(error)
      });
    }
  }

  if (summary.completed > 0 || summary.skipped > 0) {
    await writeManifest(env);
  }

  return summary;
}

export async function enqueueBootstrapJobs(env, profile) {
  requireSuperAdmin(profile);
  requireBindings(env);

  const versions = await env.DB.prepare(`
    SELECT section_key, version
    FROM cms_section_versions
    WHERE section_key IN (
      'site','navigation','home','about','ministries','publications','events',
      'bibleCollege','quickLinks','give','chapels','sermons','livestream'
    )
    ORDER BY section_key
  `).all();

  const reqId = `bootstrap-${crypto.randomUUID()}`;
  const statements = (versions.results || []).map(row =>
    env.DB.prepare(`
      INSERT OR IGNORE INTO publish_jobs (
        resource_type,
        resource_key,
        target_version,
        status,
        request_id
      )
      VALUES ('section', ?, ?, 'pending', ?)
    `).bind(row.section_key, row.version, reqId)
  );

  if (statements.length) {
    await env.DB.batch(statements);
  }

  return {
    ok: true,
    request_id: reqId,
    enqueued: statements.length
  };
}

export async function bootstrapPublicSnapshots(env, profile) {
  const queued = await enqueueBootstrapJobs(env, profile);
  const processed = await processPublishJobs(env, { limit: MAX_LIMIT });
  return { ...queued, processed };
}

export async function retryFailedPublishJobs(env, profile) {
  requireSuperAdmin(profile);
  requireBindings(env);

  const reset = await env.DB.prepare(`
    UPDATE publish_jobs
    SET
      status = 'pending',
      processing_started_at = NULL
    WHERE status = 'failed'
  `).run();

  const processed = await processPublishJobs(env, { limit: MAX_LIMIT });

  return {
    ok: true,
    reset: Number(reset?.meta?.changes || 0),
    processed
  };
}

export async function runPublishJobs(env, profile) {
  requireSuperAdmin(profile);
  return processPublishJobs(env, { limit: MAX_LIMIT });
}

export async function getPublishStatus(env, profile) {
  requireSuperAdmin(profile);
  requireBindings(env);

  const [counts, states, latestJobs, manifest] = await Promise.all([
    env.DB.prepare(`
      SELECT status, COUNT(*) AS count
      FROM publish_jobs
      GROUP BY status
      ORDER BY status
    `).all(),

    env.DB.prepare(`
      SELECT
        resource_key,
        published_version,
        object_key,
        etag,
        request_id,
        published_at
      FROM publication_state
      WHERE resource_type = 'section'
      ORDER BY resource_key
    `).all(),

    env.DB.prepare(`
      SELECT
        id,
        resource_key,
        target_version,
        status,
        attempts,
        last_error,
        created_at,
        last_attempt_at,
        completed_at
      FROM publish_jobs
      ORDER BY id DESC
      LIMIT 20
    `).all(),

    env.PUBLIC_SNAPSHOTS.head(MANIFEST_KEY)
  ]);

  return {
    ok: true,
    pipeline: "cloudflare-stage-6a-v1",
    counts: Object.fromEntries(
      (counts.results || []).map(row => [row.status, Number(row.count || 0)])
    ),
    sections: states.results || [],
    latest_jobs: latestJobs.results || [],
    r2: {
      public_snapshots_bound: true,
      media_bound: Boolean(env.MEDIA),
      manifest_present: Boolean(manifest),
      manifest_etag: manifest?.httpEtag || manifest?.etag || null
    }
  };
}
