import {
  PUBLIC_SECTION_KEYS,
  canonicalLocationKey,
  parseJson,
  projectChapels,
  projectSermons,
  projectLivestream
} from "../../public-worker/src/contentContract.js";
import {
  hasPermission,
  canAccessChapel,
  CmsAuthorizationError
} from "./rbac.js";

const SPECIAL_META = Object.freeze({
  chapels: "chapels_meta",
  sermons: "sermons_meta",
  livestream: "livestream_meta"
});

const SECTION_PERMISSION = Object.freeze({
  publications: "publications.manage",
  events: "events.manage",
  ministries: "ministries.manage",
  bibleCollege: "ministries.manage",
  about: "about.manage",
  quickLinks: "quicklinks.manage",
  give: "giving.manage",
  site: "site.manage",
  navigation: "site.manage",
  home: "site.manage",
  chapels: "ministries.manage",
  sermons: "sermons.manage",
  livestream: "livestream.manage"
});

export class CmsContentError extends Error {
  constructor(code, status = 400, details = null) {
    super(code);
    this.name = "CmsContentError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function sqlJson(value) {
  return JSON.stringify(value ?? {});
}

function nowIso() {
  return new Date().toISOString();
}

function requestId(value) {
  const id = String(value || "").trim();
  if (id && id.length <= 128) return id;
  return crypto.randomUUID();
}

function isGlobal(profile) {
  return profile?.role_key === "super_admin" || profile?.scope_type === "global";
}

function requireGlobalSectionPermission(profile, key) {
  if (hasPermission(profile, "advanced.manage")) return;

  const permission = SECTION_PERMISSION[key];
  if (!permission || !hasPermission(profile, permission)) {
    throw new CmsAuthorizationError("cms_permission_denied", 403);
  }

  if (["chapels", "sermons", "livestream"].includes(key) && !isGlobal(profile)) {
    throw new CmsAuthorizationError("global_scope_required", 403);
  }
}

function requireScopedPermission(profile, chapelId, permissionKeys) {
  const canonical = canonicalLocationKey(chapelId);

  if (!canAccessChapel(profile, canonical)) {
    throw new CmsAuthorizationError("chapel_scope_denied", 403);
  }

  if (
    !permissionKeys.some(permission => hasPermission(profile, permission)) &&
    !hasPermission(profile, "advanced.manage")
  ) {
    throw new CmsAuthorizationError("cms_permission_denied", 403);
  }

  return canonical;
}

function normalizeExpectedVersion(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CmsContentError("content_version_required", 409);
  }
  return parsed;
}

function versionAdvanceStatement(env, key, expectedVersion, actor, reqId) {
  return env.DB.prepare(`
    UPDATE cms_section_versions
    SET
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = ?,
      last_request_id = ?
    WHERE section_key = ?
      AND version = ?
  `).bind(actor, reqId, key, expectedVersion);
}

function guardSql() {
  return `EXISTS (
    SELECT 1
    FROM cms_section_versions
    WHERE section_key = ?
      AND last_request_id = ?
  )`;
}

function historyStatement(env, {
  key,
  action,
  actor,
  email,
  beforeData,
  afterData,
  requestId: reqId,
  fromVersion,
  toVersion,
  metadata = {}
}) {
  return env.DB.prepare(`
    INSERT INTO content_history (
      resource_type,
      resource_key,
      action,
      actor_subject,
      actor_email,
      before_json,
      after_json,
      request_id,
      from_version,
      to_version,
      metadata_json
    )
    SELECT
      'section',
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    WHERE ${guardSql()}
  `).bind(
    key,
    action,
    actor,
    email || null,
    beforeData === null ? null : sqlJson(beforeData),
    afterData === null ? null : sqlJson(afterData),
    reqId,
    fromVersion,
    toVersion,
    sqlJson(metadata),
    key,
    reqId
  );
}

function publishJobStatement(env, key, targetVersion, reqId) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO publish_jobs (
      resource_type,
      resource_key,
      target_version,
      status,
      request_id
    )
    SELECT
      'section',
      ?,
      ?,
      'pending',
      ?
    WHERE ${guardSql()}
  `).bind(key, targetVersion, reqId, key, reqId);
}

async function sectionVersionMap(env, keys) {
  if (!keys.length) return new Map();

  const marks = keys.map(() => "?").join(",");
  const result = await env.DB.prepare(`
    SELECT section_key, version, updated_at, updated_by
    FROM cms_section_versions
    WHERE section_key IN (${marks})
  `).bind(...keys).all();

  return new Map(
    (result.results || []).map(row => [row.section_key, row])
  );
}

async function loadSiteRows(env, keys) {
  if (!keys.length) return new Map();
  const marks = keys.map(() => "?").join(",");
  const result = await env.DB.prepare(`
    SELECT key, data_json, version, updated_at, updated_by
    FROM site_sections
    WHERE key IN (${marks})
  `).bind(...keys).all();

  return new Map((result.results || []).map(row => [row.key, row]));
}

async function loadChapels(env) {
  const result = await env.DB.prepare(`
    SELECT
      id, slug, title, short_title, page_json, location_type,
      published, version, updated_at, updated_by
    FROM chapels
    WHERE published = 1
    ORDER BY
      CASE location_type WHEN 'hq' THEN 0 ELSE 1 END,
      title
  `).all();
  return result.results || [];
}

async function loadSermons(env) {
  const result = await env.DB.prepare(`
    SELECT
      id, chapel_id, public_json, title, speaker, service_type,
      sermon_date, video_url, thumbnail_url, description, tags_json,
      published, source_broadcast_id, version, updated_at, updated_by
    FROM sermons
    WHERE published = 1
    ORDER BY
      CASE WHEN sermon_date IS NULL OR sermon_date = '' THEN 1 ELSE 0 END,
      sermon_date DESC,
      updated_at DESC
  `).all();
  return result.results || [];
}

async function loadBroadcasts(env) {
  const result = await env.DB.prepare(`
    SELECT
      id, chapel_id, public_json, title, speaker, service_type, platform,
      video_url, youtube_channel_url, facebook_video_url, facebook_page_url,
      starts_at, ends_at, status_override, bulletin, schedule_json,
      recap_url, published_sermon_id, version, updated_at, updated_by
    FROM broadcasts
    ORDER BY chapel_id
  `).all();
  return result.results || [];
}

export function validateSectionKeys(rawKeys) {
  const keys = [...new Set(
    String(rawKeys || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
  )];

  if (!keys.length) throw new CmsContentError("section_keys_required", 400);
  if (keys.length > 20) throw new CmsContentError("too_many_section_keys", 400);

  const invalid = keys.filter(key => !PUBLIC_SECTION_KEYS.includes(key));
  if (invalid.length) {
    throw new CmsContentError("invalid_section_key", 400, { invalid });
  }

  return keys;
}

export async function loadCmsSections(env, rawKeys) {
  const keys = Array.isArray(rawKeys)
    ? validateSectionKeys(rawKeys.join(","))
    : validateSectionKeys(rawKeys);

  const versions = await sectionVersionMap(env, keys);
  const ordinary = keys.filter(key => !SPECIAL_META[key]);
  const metaKeys = keys.filter(key => SPECIAL_META[key]).map(key => SPECIAL_META[key]);
  const siteRows = await loadSiteRows(env, [...ordinary, ...metaKeys]);

  const needChapels = keys.includes("chapels") || keys.includes("livestream");
  const [chapelRows, sermonRows, broadcastRows] = await Promise.all([
    needChapels ? loadChapels(env) : Promise.resolve([]),
    keys.includes("sermons") ? loadSermons(env) : Promise.resolve([]),
    keys.includes("livestream") ? loadBroadcasts(env) : Promise.resolve([])
  ]);

  const sections = {};

  for (const key of keys) {
    let projected;

    if (key === "chapels") {
      projected = projectChapels(siteRows.get("chapels_meta"), chapelRows);
    } else if (key === "sermons") {
      projected = projectSermons(siteRows.get("sermons_meta"), sermonRows);
    } else if (key === "livestream") {
      projected = projectLivestream(
        siteRows.get("livestream_meta"),
        broadcastRows,
        chapelRows
      );
    } else {
      const row = siteRows.get(key);
      if (!row) continue;
      projected = {
        data: parseJson(row.data_json, {}),
        updated_at: row.updated_at || null,
        version: Number(row.version || 1)
      };
    }

    const sectionVersion = versions.get(key);
    sections[key] = {
      data: projected.data,
      updated_at: sectionVersion?.updated_at || projected.updated_at || null,
      version: Number(sectionVersion?.version || projected.version || 1),
      updated_by: sectionVersion?.updated_by || null
    };
  }

  return sections;
}

function chapelDbShape(id, data) {
  const canonical = canonicalLocationKey(id);
  const href = String(data?.href || `${canonical}.html`);
  const slug = href.replace(/\.html(?:\?.*)?$/, "") || canonical;
  return {
    id: canonical,
    slug,
    title: String(data?.title || data?.shortTitle || canonical),
    shortTitle: String(data?.shortTitle || data?.title || canonical),
    pageJson: {
      ...(data || {}),
      id: canonical,
      href
    },
    locationType: canonical === "peculiar-hq" ? "hq" : "chapel"
  };
}

function sermonDbShape(item, fallbackChapel = "") {
  const id = String(item?.id || "").trim();
  if (!id) throw new CmsContentError("sermon_id_required", 400);

  const chapelId = canonicalLocationKey(
    item?.chapelId || item?.chapel_id || fallbackChapel
  );
  if (!chapelId) throw new CmsContentError("sermon_chapel_required", 400);

  const publicJson = {
    ...(item || {}),
    id,
    chapelId
  };

  return {
    id,
    chapelId,
    publicJson,
    title: String(item?.title || "").trim(),
    speaker: item?.speaker || item?.preacher || null,
    serviceType: item?.serviceType || item?.category || null,
    sermonDate: item?.date || item?.sermonDate || null,
    videoUrl: item?.videoUrl || item?.url || null,
    thumbnailUrl:
      item?.thumbnail ||
      item?.thumbnailUrl ||
      item?.image ||
      null,
    description:
      item?.description ||
      item?.summary ||
      item?.excerpt ||
      null,
    tags: Array.isArray(item?.tags) ? item.tags : [],
    published: item?.published === false ? 0 : 1,
    sourceBroadcastId: item?.sourceBroadcastId || null
  };
}

function broadcastDbShape(chapelId, channel) {
  const canonical = canonicalLocationKey(chapelId);
  const current = channel?.currentBroadcast || {};
  const status = String(channel?.statusOverride || channel?.status || "auto");
  const allowed = new Set(["auto", "live", "upcoming", "recap", "hidden"]);

  let platform = String(
    channel?.defaultPlatform || channel?.platform || "youtube"
  ).toLowerCase();
  if (!["youtube", "facebook"].includes(platform)) platform = "youtube";

  return {
    id: `broadcast-${canonical}`,
    chapelId: canonical,
    publicJson: {
      ...(channel || {}),
      id: canonical,
      chapelId: canonical,
      label:
        canonical === "peculiar-hq"
          ? "Peculiar HQ"
          : (channel?.label || null)
    },
    title: current?.title || channel?.title || null,
    speaker: current?.speaker || channel?.speaker || null,
    serviceType: current?.serviceType || "Sunday Worship",
    platform,
    videoUrl:
      current?.videoUrl ||
      channel?.youtube?.url ||
      channel?.youtube?.videoUrl ||
      null,
    youtubeChannelUrl:
      channel?.youtubeChannelUrl ||
      channel?.youtube?.channelUrl ||
      null,
    facebookVideoUrl:
      current?.facebookVideoUrl ||
      channel?.facebook?.videoUrl ||
      channel?.facebook?.url ||
      null,
    facebookPageUrl:
      channel?.facebookPageUrl ||
      channel?.facebook?.pageUrl ||
      null,
    startsAt: current?.startsAt || null,
    endsAt: current?.endsAt || null,
    statusOverride: allowed.has(status) ? status : "auto",
    bulletin: channel?.bulletin || null,
    schedule: Array.isArray(channel?.schedule) ? channel.schedule : [],
    recapUrl: channel?.replayUrl || channel?.recapUrl || current?.recapUrl || null,
    publishedSermonId: channel?.publishedSermonId || null
  };
}

async function ensureKnownChapel(env, chapelId) {
  const row = await env.DB.prepare(
    "SELECT id FROM chapels WHERE id = ? AND published = 1 LIMIT 1"
  ).bind(chapelId).first();

  if (!row) throw new CmsContentError("unknown_chapel_scope", 400);
}

async function finishSectionWrite(env, key, expectedVersion, reqId) {
  const sections = await loadCmsSections(env, [key]);
  const entry = sections[key];

  if (!entry || Number(entry.version) !== expectedVersion + 1) {
    throw new CmsContentError("content_conflict", 409);
  }

  return {
    key,
    data: entry.data,
    updated_at: entry.updated_at,
    updated_by: entry.updated_by,
    version: entry.version,
    request_id: reqId
  };
}

async function executeMutation(env, statements, key, expectedVersion, reqId) {
  const results = await env.DB.batch(statements);
  const changed = Number(results?.[0]?.meta?.changes || 0);

  if (changed !== 1) {
    throw new CmsContentError("content_conflict", 409);
  }

  return finishSectionWrite(env, key, expectedVersion, reqId);
}

export async function writeCmsSection(env, profile, identity, key, body) {
  if (!PUBLIC_SECTION_KEYS.includes(key)) {
    throw new CmsContentError("invalid_section_key", 400);
  }

  requireGlobalSectionPermission(profile, key);

  const expectedVersion = normalizeExpectedVersion(body?.expected_version);
  const reqId = requestId(body?.request_id);
  const data = body?.data;

  if (data === undefined || data === null || typeof data !== "object") {
    throw new CmsContentError("section_data_required", 400);
  }

  const current = (await loadCmsSections(env, [key]))[key];
  if (!current) throw new CmsContentError("section_not_found", 404);

  const nextVersion = expectedVersion + 1;
  const actor = identity.subject;
  const statements = [
    versionAdvanceStatement(env, key, expectedVersion, actor, reqId)
  ];

  if (!SPECIAL_META[key]) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO site_sections (
          key, data_json, version, published,
          updated_at, updated_by, last_request_id
        )
        SELECT ?, ?, 1, 1, CURRENT_TIMESTAMP, ?, ?
        WHERE ${guardSql()}
        ON CONFLICT(key) DO UPDATE SET
          data_json = excluded.data_json,
          version = site_sections.version + 1,
          published = 1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = excluded.updated_by,
          last_request_id = excluded.last_request_id
      `).bind(
        key,
        sqlJson(data),
        actor,
        reqId,
        key,
        reqId
      )
    );
  } else if (key === "chapels") {
    const details = data?.details && typeof data.details === "object"
      ? data.details
      : {};

    const meta = {
      hero: data?.hero || {},
      current: Array.isArray(data?.current) ? data.current : [],
      upcoming: Array.isArray(data?.upcoming) ? data.upcoming : []
    };

    statements.push(
      env.DB.prepare(`
        INSERT INTO site_sections (
          key, data_json, version, published,
          updated_at, updated_by, last_request_id
        )
        SELECT 'chapels_meta', ?, 1, 1, CURRENT_TIMESTAMP, ?, ?
        WHERE ${guardSql()}
        ON CONFLICT(key) DO UPDATE SET
          data_json = excluded.data_json,
          version = site_sections.version + 1,
          published = 1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = excluded.updated_by,
          last_request_id = excluded.last_request_id
      `).bind(sqlJson(meta), actor, reqId, key, reqId),

      env.DB.prepare(`
        UPDATE chapels
        SET
          published = 0,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = ?,
          last_request_id = ?
        WHERE ${guardSql()}
      `).bind(actor, reqId, key, reqId)
    );

    for (const [rawId, chapelData] of Object.entries(details)) {
      const row = chapelDbShape(rawId, chapelData);
      statements.push(
        env.DB.prepare(`
          INSERT INTO chapels (
            id, slug, title, short_title, page_json, location_type,
            published, version, created_at, updated_at, updated_by,
            last_request_id
          )
          SELECT
            ?, ?, ?, ?, ?, ?, 1, 1,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?
          WHERE ${guardSql()}
          ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            title = excluded.title,
            short_title = excluded.short_title,
            page_json = excluded.page_json,
            location_type = excluded.location_type,
            published = 1,
            version = chapels.version + 1,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = excluded.updated_by,
            last_request_id = excluded.last_request_id
        `).bind(
          row.id,
          row.slug,
          row.title,
          row.shortTitle,
          sqlJson(row.pageJson),
          row.locationType,
          actor,
          reqId,
          key,
          reqId
        )
      );
    }
  } else if (key === "sermons") {
    const items = Array.isArray(data?.items) ? data.items : [];
    const meta = { hero: data?.hero || {} };

    statements.push(
      env.DB.prepare(`
        INSERT INTO site_sections (
          key, data_json, version, published,
          updated_at, updated_by, last_request_id
        )
        SELECT 'sermons_meta', ?, 1, 1, CURRENT_TIMESTAMP, ?, ?
        WHERE ${guardSql()}
        ON CONFLICT(key) DO UPDATE SET
          data_json = excluded.data_json,
          version = site_sections.version + 1,
          published = 1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = excluded.updated_by,
          last_request_id = excluded.last_request_id
      `).bind(sqlJson(meta), actor, reqId, key, reqId),

      env.DB.prepare(`
        UPDATE sermons
        SET
          published = 0,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = ?,
          last_request_id = ?
        WHERE ${guardSql()}
      `).bind(actor, reqId, key, reqId)
    );

    for (const item of items) {
      const row = sermonDbShape(item);
      await ensureKnownChapel(env, row.chapelId);

      statements.push(
        env.DB.prepare(`
          INSERT INTO sermons (
            id, chapel_id, public_json, title, speaker, service_type,
            sermon_date, video_url, thumbnail_url, description, tags_json,
            published, source_broadcast_id, version,
            created_at, updated_at, updated_by, last_request_id
          )
          SELECT
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?
          WHERE ${guardSql()}
          ON CONFLICT(id) DO UPDATE SET
            chapel_id = excluded.chapel_id,
            public_json = excluded.public_json,
            title = excluded.title,
            speaker = excluded.speaker,
            service_type = excluded.service_type,
            sermon_date = excluded.sermon_date,
            video_url = excluded.video_url,
            thumbnail_url = excluded.thumbnail_url,
            description = excluded.description,
            tags_json = excluded.tags_json,
            published = excluded.published,
            source_broadcast_id = excluded.source_broadcast_id,
            version = sermons.version + 1,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = excluded.updated_by,
            last_request_id = excluded.last_request_id
        `).bind(
          row.id,
          row.chapelId,
          sqlJson(row.publicJson),
          row.title,
          row.speaker,
          row.serviceType,
          row.sermonDate,
          row.videoUrl,
          row.thumbnailUrl,
          row.description,
          sqlJson(row.tags),
          row.published,
          row.sourceBroadcastId,
          actor,
          reqId,
          key,
          reqId
        )
      );
    }
  } else if (key === "livestream") {
    const channels = data?.channels && typeof data.channels === "object"
      ? data.channels
      : {};
    const meta = { hero: data?.hero || {} };

    statements.push(
      env.DB.prepare(`
        INSERT INTO site_sections (
          key, data_json, version, published,
          updated_at, updated_by, last_request_id
        )
        SELECT 'livestream_meta', ?, 1, 1, CURRENT_TIMESTAMP, ?, ?
        WHERE ${guardSql()}
        ON CONFLICT(key) DO UPDATE SET
          data_json = excluded.data_json,
          version = site_sections.version + 1,
          published = 1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = excluded.updated_by,
          last_request_id = excluded.last_request_id
      `).bind(sqlJson(meta), actor, reqId, key, reqId),

      env.DB.prepare(`
        DELETE FROM broadcasts
        WHERE ${guardSql()}
      `).bind(key, reqId)
    );

    for (const [rawChapelId, channel] of Object.entries(channels)) {
      const row = broadcastDbShape(rawChapelId, channel);
      await ensureKnownChapel(env, row.chapelId);

      statements.push(
        env.DB.prepare(`
          INSERT INTO broadcasts (
            id, chapel_id, public_json, title, speaker, service_type,
            platform, video_url, youtube_channel_url, facebook_video_url,
            facebook_page_url, starts_at, ends_at, status_override,
            bulletin, schedule_json, recap_url, published_sermon_id,
            version, created_at, updated_at, updated_by, last_request_id
          )
          SELECT
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?
          WHERE ${guardSql()}
        `).bind(
          row.id,
          row.chapelId,
          sqlJson(row.publicJson),
          row.title,
          row.speaker,
          row.serviceType,
          row.platform,
          row.videoUrl,
          row.youtubeChannelUrl,
          row.facebookVideoUrl,
          row.facebookPageUrl,
          row.startsAt,
          row.endsAt,
          row.statusOverride,
          row.bulletin,
          sqlJson(row.schedule),
          row.recapUrl,
          row.publishedSermonId,
          actor,
          reqId,
          key,
          reqId
        )
      );
    }
  }

  statements.push(
    historyStatement(env, {
      key,
      action: "UPDATE",
      actor,
      email: identity.email,
      beforeData: current.data,
      afterData: data,
      requestId: reqId,
      fromVersion: expectedVersion,
      toVersion: nextVersion,
      metadata: { mode: "full_section" }
    }),
    publishJobStatement(env, key, nextVersion, reqId)
  );

  return executeMutation(env, statements, key, expectedVersion, reqId);
}

export async function writeScopedChapel(env, profile, identity, chapelId, body) {
  const canonical = requireScopedPermission(
    profile,
    chapelId,
    ["chapel.content.manage", "ministries.manage"]
  );
  await ensureKnownChapel(env, canonical);

  const expectedVersion = normalizeExpectedVersion(body?.expected_version);
  const reqId = requestId(body?.request_id);
  const data = body?.data;
  if (!data || typeof data !== "object") {
    throw new CmsContentError("chapel_data_required", 400);
  }

  const current = (await loadCmsSections(env, ["chapels"])).chapels;
  const row = chapelDbShape(canonical, {
    ...(current?.data?.details?.[canonical] || {}),
    ...data,
    id: canonical
  });

  const statements = [
    versionAdvanceStatement(env, "chapels", expectedVersion, identity.subject, reqId),
    env.DB.prepare(`
      UPDATE chapels
      SET
        slug = ?,
        title = ?,
        short_title = ?,
        page_json = ?,
        location_type = ?,
        published = 1,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = ?,
        last_request_id = ?
      WHERE id = ?
        AND ${guardSql()}
    `).bind(
      row.slug,
      row.title,
      row.shortTitle,
      sqlJson(row.pageJson),
      row.locationType,
      identity.subject,
      reqId,
      canonical,
      "chapels",
      reqId
    ),
    historyStatement(env, {
      key: "chapels",
      action: "UPDATE",
      actor: identity.subject,
      email: identity.email,
      beforeData: current.data?.details?.[canonical] || null,
      afterData: row.pageJson,
      requestId: reqId,
      fromVersion: expectedVersion,
      toVersion: expectedVersion + 1,
      metadata: { mode: "scoped_chapel", chapel_id: canonical }
    }),
    publishJobStatement(env, "chapels", expectedVersion + 1, reqId)
  ];

  return executeMutation(env, statements, "chapels", expectedVersion, reqId);
}

export async function writeScopedBroadcast(env, profile, identity, chapelId, body) {
  const canonical = requireScopedPermission(
    profile,
    chapelId,
    ["livestream.manage"]
  );
  await ensureKnownChapel(env, canonical);

  const expectedVersion = normalizeExpectedVersion(body?.expected_version);
  const reqId = requestId(body?.request_id);
  const data = body?.data;
  if (!data || typeof data !== "object") {
    throw new CmsContentError("broadcast_data_required", 400);
  }

  const current = (await loadCmsSections(env, ["livestream"])).livestream;
  const row = broadcastDbShape(canonical, data);

  const statements = [
    versionAdvanceStatement(env, "livestream", expectedVersion, identity.subject, reqId),
    env.DB.prepare(`
      INSERT INTO broadcasts (
        id, chapel_id, public_json, title, speaker, service_type,
        platform, video_url, youtube_channel_url, facebook_video_url,
        facebook_page_url, starts_at, ends_at, status_override,
        bulletin, schedule_json, recap_url, published_sermon_id,
        version, created_at, updated_at, updated_by, last_request_id
      )
      SELECT
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?
      WHERE ${guardSql()}
      ON CONFLICT(chapel_id) DO UPDATE SET
        id = excluded.id,
        public_json = excluded.public_json,
        title = excluded.title,
        speaker = excluded.speaker,
        service_type = excluded.service_type,
        platform = excluded.platform,
        video_url = excluded.video_url,
        youtube_channel_url = excluded.youtube_channel_url,
        facebook_video_url = excluded.facebook_video_url,
        facebook_page_url = excluded.facebook_page_url,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        status_override = excluded.status_override,
        bulletin = excluded.bulletin,
        schedule_json = excluded.schedule_json,
        recap_url = excluded.recap_url,
        published_sermon_id = excluded.published_sermon_id,
        version = broadcasts.version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by,
        last_request_id = excluded.last_request_id
    `).bind(
      row.id,
      row.chapelId,
      sqlJson(row.publicJson),
      row.title,
      row.speaker,
      row.serviceType,
      row.platform,
      row.videoUrl,
      row.youtubeChannelUrl,
      row.facebookVideoUrl,
      row.facebookPageUrl,
      row.startsAt,
      row.endsAt,
      row.statusOverride,
      row.bulletin,
      sqlJson(row.schedule),
      row.recapUrl,
      row.publishedSermonId,
      identity.subject,
      reqId,
      "livestream",
      reqId
    ),
    historyStatement(env, {
      key: "livestream",
      action: "UPDATE",
      actor: identity.subject,
      email: identity.email,
      beforeData: current.data?.channels?.[canonical] || null,
      afterData: data,
      requestId: reqId,
      fromVersion: expectedVersion,
      toVersion: expectedVersion + 1,
      metadata: { mode: "scoped_broadcast", chapel_id: canonical }
    }),
    publishJobStatement(env, "livestream", expectedVersion + 1, reqId)
  ];

  return executeMutation(env, statements, "livestream", expectedVersion, reqId);
}

export async function upsertScopedSermon(env, profile, identity, sermonId, body) {
  const data = {
    ...(body?.data || {}),
    id: sermonId
  };

  const chapelId = requireScopedPermission(
    profile,
    data.chapelId || data.chapel_id,
    ["sermons.manage"]
  );
  await ensureKnownChapel(env, chapelId);

  const expectedVersion = normalizeExpectedVersion(body?.expected_version);
  const reqId = requestId(body?.request_id);
  const current = (await loadCmsSections(env, ["sermons"])).sermons;
  const before = (current?.data?.items || []).find(item => item.id === sermonId) || null;
  const row = sermonDbShape(data, chapelId);

  const statements = [
    versionAdvanceStatement(env, "sermons", expectedVersion, identity.subject, reqId),
    env.DB.prepare(`
      INSERT INTO sermons (
        id, chapel_id, public_json, title, speaker, service_type,
        sermon_date, video_url, thumbnail_url, description, tags_json,
        published, source_broadcast_id, version,
        created_at, updated_at, updated_by, last_request_id
      )
      SELECT
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?
      WHERE ${guardSql()}
      ON CONFLICT(id) DO UPDATE SET
        chapel_id = excluded.chapel_id,
        public_json = excluded.public_json,
        title = excluded.title,
        speaker = excluded.speaker,
        service_type = excluded.service_type,
        sermon_date = excluded.sermon_date,
        video_url = excluded.video_url,
        thumbnail_url = excluded.thumbnail_url,
        description = excluded.description,
        tags_json = excluded.tags_json,
        published = excluded.published,
        source_broadcast_id = excluded.source_broadcast_id,
        version = sermons.version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by,
        last_request_id = excluded.last_request_id
    `).bind(
      row.id,
      row.chapelId,
      sqlJson(row.publicJson),
      row.title,
      row.speaker,
      row.serviceType,
      row.sermonDate,
      row.videoUrl,
      row.thumbnailUrl,
      row.description,
      sqlJson(row.tags),
      row.published,
      row.sourceBroadcastId,
      identity.subject,
      reqId,
      "sermons",
      reqId
    ),
    historyStatement(env, {
      key: "sermons",
      action: before ? "UPDATE" : "INSERT",
      actor: identity.subject,
      email: identity.email,
      beforeData: before,
      afterData: row.publicJson,
      requestId: reqId,
      fromVersion: expectedVersion,
      toVersion: expectedVersion + 1,
      metadata: { mode: "scoped_sermon", chapel_id: chapelId, sermon_id: sermonId }
    }),
    publishJobStatement(env, "sermons", expectedVersion + 1, reqId)
  ];

  return executeMutation(env, statements, "sermons", expectedVersion, reqId);
}

export async function deleteScopedSermon(env, profile, identity, sermonId, body) {
  const existing = await env.DB.prepare(`
    SELECT id, chapel_id, public_json
    FROM sermons
    WHERE id = ?
    LIMIT 1
  `).bind(sermonId).first();

  if (!existing) throw new CmsContentError("sermon_not_found", 404);

  const chapelId = requireScopedPermission(
    profile,
    existing.chapel_id,
    ["sermons.manage"]
  );

  const expectedVersion = normalizeExpectedVersion(body?.expected_version);
  const reqId = requestId(body?.request_id);

  const statements = [
    versionAdvanceStatement(env, "sermons", expectedVersion, identity.subject, reqId),
    env.DB.prepare(`
      UPDATE sermons
      SET
        published = 0,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = ?,
        last_request_id = ?
      WHERE id = ?
        AND chapel_id = ?
        AND ${guardSql()}
    `).bind(
      identity.subject,
      reqId,
      sermonId,
      chapelId,
      "sermons",
      reqId
    ),
    historyStatement(env, {
      key: "sermons",
      action: "DELETE",
      actor: identity.subject,
      email: identity.email,
      beforeData: parseJson(existing.public_json, {}),
      afterData: null,
      requestId: reqId,
      fromVersion: expectedVersion,
      toVersion: expectedVersion + 1,
      metadata: { mode: "scoped_sermon", chapel_id: chapelId, sermon_id: sermonId }
    }),
    publishJobStatement(env, "sermons", expectedVersion + 1, reqId)
  ];

  return executeMutation(env, statements, "sermons", expectedVersion, reqId);
}

export async function listHistory(env, profile, limit = 50) {
  if (!hasPermission(profile, "history.view") &&
      !hasPermission(profile, "advanced.manage")) {
    throw new CmsAuthorizationError("cms_permission_denied", 403);
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const result = await env.DB.prepare(`
    SELECT
      id,
      resource_type,
      resource_key,
      action,
      actor_subject,
      actor_email,
      before_json,
      after_json,
      request_id,
      from_version,
      to_version,
      metadata_json,
      created_at
    FROM content_history
    ORDER BY id DESC
    LIMIT ?
  `).bind(safeLimit).all();

  return (result.results || []).map(row => ({
    ...row,
    before: parseJson(row.before_json, null),
    after: parseJson(row.after_json, null),
    metadata: parseJson(row.metadata_json, {})
  }));
}
