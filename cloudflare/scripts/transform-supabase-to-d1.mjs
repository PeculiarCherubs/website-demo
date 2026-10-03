import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const cloudflareRoot = path.resolve(import.meta.dirname, "..");
const inputPath = path.resolve(
  process.argv[2] || path.join(cloudflareRoot, "migration-data", "supabase-site-content.json")
);
const outDir = path.join(cloudflareRoot, "migration-data");
const sqlPath = path.join(outDir, "d1-import.generated.sql");
const reportPath = path.join(outDir, "d1-import-report.json");

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const rows = Array.isArray(raw) ? raw : raw.rows;

if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error("Input export does not contain site_content rows.");
}

const byKey = {};
const metadata = {};
for (const row of rows) {
  byKey[row.key] = row.data;
  metadata[row.key] = {
    updated_at: row.updated_at || null,
    updated_by: row.updated_by || null
  };
}

const warnings = [];
const errors = [];
const sermonReview = [];

const sermonOverridePath = path.join(outDir, "sermon-chapel-overrides.json");
let sermonChapelOverrides = {};
if (fs.existsSync(sermonOverridePath)) {
  sermonChapelOverrides = JSON.parse(fs.readFileSync(sermonOverridePath, "utf8"));
}

function stableJson(value) {
  if (value === undefined) return null;
  return value;
}

function sqlString(value) {
  if (value === null || typeof value === "undefined") return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return sqlString(JSON.stringify(stableJson(value)));
}

function boolInt(value, defaultValue = true) {
  if (value === false || value === 0 || value === "false") return 0;
  if (value === true || value === 1 || value === "true") return 1;
  return defaultValue ? 1 : 0;
}

function normalizeChapelId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (["general", "mother", "motherchurch", "mother_church", "mother-church"].includes(raw)) {
    return "peculiar-hq";
  }
  return raw;
}

function safeId(prefix, obj) {
  const canonical = JSON.stringify(obj);
  const hash = crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `${prefix}-${hash}`;
}

function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return null;
}

function ensureDateString(value) {
  if (!value) return null;
  const text = String(value).trim();
  return text || null;
}

const siteSections = [];
const chapels = [];
const sermons = [];
const broadcasts = [];

// ---------------------------------------------------------------------------
// Page sections
// ---------------------------------------------------------------------------

const relationalKeys = new Set(["chapels", "sermons", "livestream"]);

for (const [key, data] of Object.entries(byKey)) {
  if (relationalKeys.has(key)) continue;

  siteSections.push({
    key,
    data,
    updated_at: metadata[key]?.updated_at,
    updated_by: metadata[key]?.updated_by
  });
}

// Preserve section-level metadata without duplicating relational collections.
const chapelsSection = byKey.chapels || {};

const canonicalCurrentLocations = [
  {
    id: "peculiar-hq",
    name: "Peculiar HQ",
    subtitle: "The headquarters worship location of Peculiar Cherubs.",
    status: "Peculiar HQ",
    logo: "assets/logos/mother-church.png",
    href: "peculiar-hq.html"
  },
  ...(Array.isArray(chapelsSection.current) ? chapelsSection.current : [])
    .map(item => ({
      ...item,
      id: normalizeChapelId(item?.id)
    }))
    .filter(item =>
      item.id &&
      item.id !== "peculiar-hq"
    )
];

siteSections.push({
  key: "chapels_meta",
  data: {
    hero: {
      ...(chapelsSection.hero || {}),
      eyebrow: "Worship Locations",
      description:
        "Peculiar HQ and each PDCM chapel carry the vision of Peculiar Cherubs while serving their worshipping communities."
    },
    current: canonicalCurrentLocations,
    upcoming: chapelsSection.upcoming || []
  },
  updated_at: metadata.chapels?.updated_at,
  updated_by: metadata.chapels?.updated_by
});

const sermonsSection = byKey.sermons || {};
siteSections.push({
  key: "sermons_meta",
  data: {
    hero: sermonsSection.hero || {}
  },
  updated_at: metadata.sermons?.updated_at,
  updated_by: metadata.sermons?.updated_by
});

const livestreamSection = byKey.livestream || {};
siteSections.push({
  key: "livestream_meta",
  data: {
    hero: livestreamSection.hero || {}
  },
  updated_at: metadata.livestream?.updated_at,
  updated_by: metadata.livestream?.updated_by
});

// ---------------------------------------------------------------------------
// Chapels
// ---------------------------------------------------------------------------

const detailMap = chapelsSection.details || {};
const currentList = Array.isArray(chapelsSection.current) ? chapelsSection.current : [];

for (const [key, detail] of Object.entries(detailMap)) {
  const id = normalizeChapelId(key || detail?.id);
  if (!id) {
    warnings.push("Skipped a chapel detail with no canonical ID.");
    continue;
  }

  const current = currentList.find(item => normalizeChapelId(item?.id) === id) || {};
  const title = pick(detail, "title", "name") || pick(current, "name") || id;
  const shortTitle = pick(detail, "shortTitle") || title;
  const href = pick(detail, "href") || pick(current, "href");
  const slug = href ? String(href).replace(/\.html(?:\?.*)?$/, "") : id;

  chapels.push({
    id,
    slug,
    title,
    short_title: shortTitle,
    page_json: {
      ...detail,
      id
    },
    location_type: id === "peculiar-hq" ? "hq" : "chapel",
    published: detail?.published === false ? 0 : 1,
    updated_at: metadata.chapels?.updated_at,
    updated_by: metadata.chapels?.updated_by
  });
}

// Peculiar HQ participates in broadcasts/scoping but older source data may
// expose it only through the legacy Mother Church broadcast record.
const channelMap = livestreamSection.channels || {};
const hasHqBroadcast = Object.keys(channelMap).some(
  key => normalizeChapelId(key) === "peculiar-hq"
);

if (hasHqBroadcast && !chapels.some(chapel => chapel.id === "peculiar-hq")) {
  chapels.unshift({
    id: "peculiar-hq",
    slug: "peculiar-hq",
    title: "Peculiar HQ",
    short_title: "Peculiar HQ",
    location_type: "hq",
    page_json: {
      id: "peculiar-hq",
      href: "peculiar-hq.html",
      category: "Peculiar HQ",
      title: "Peculiar HQ",
      shortTitle: "Peculiar HQ",
      summary:
        "The headquarters worship location of Peculiar Cherubs, with its own services, sermons, broadcasts, and church-wide gatherings.",
      image: "assets/hero/mother-church-brand.jpg",
      facts: [],
      overview: [
        "Peculiar HQ is the headquarters worship location of Peculiar Cherubs.",
        "HQ-specific services, sermons, livestreams, and updates are presented on this page."
      ],
      leaders: [],
      functionsTitle: "HQ focus",
      functions: [
        "HQ worship services and church-wide gatherings",
        "HQ sermons and livestream broadcasts",
        "Central church announcements and worship updates"
      ],
      systemGeneratedForMigration: true
    },
    published: 1,
    updated_at: metadata.livestream?.updated_at,
    updated_by: metadata.livestream?.updated_by
  });

  warnings.push(
    "Legacy Mother Church broadcast references were normalized to canonical Peculiar HQ because the source has no Peculiar HQ detail record."
  );
}

const chapelIds = new Set(chapels.map(chapel => chapel.id));

// ---------------------------------------------------------------------------
// Sermons
// ---------------------------------------------------------------------------

const sermonItems = Array.isArray(sermonsSection.items) ? sermonsSection.items : [];
let defaultedSermonChapelCount = 0;
let generatedSermonIdCount = 0;

for (const item of sermonItems) {
  let id = String(pick(item, "id", "slug", "sermonId") || "").trim();
  if (!id) {
    id = safeId("sermon", item);
    generatedSermonIdCount += 1;
  }

  let chapelId = normalizeChapelId(
    pick(item, "chapelId", "chapel_id", "chapel", "locationId")
  );

  if (!chapelId) {
    chapelId = normalizeChapelId(
      sermonChapelOverrides[id] ||
      sermonChapelOverrides[String(pick(item, "title") || "").trim()] ||
      ""
    );

    if (!chapelId) {
      sermonReview.push({
        id,
        title: pick(item, "title") || "(untitled)",
        speaker: pick(item, "speaker", "preacher"),
        date: pick(item, "date", "sermonDate", "sermon_date", "publishedAt")
      });
      continue;
    }
  }

  if (!chapelIds.has(chapelId)) {
    errors.push(
      `Sermon '${pick(item, "title") || "(untitled)"}' references unknown worship location '${chapelId}'.`
    );
    continue;
  }

  const title = String(pick(item, "title") || "").trim();
  if (!title) {
    errors.push(`Sermon '${id}' has no title.`);
    continue;
  }

  sermons.push({
    id,
    chapel_id: chapelId,
    public_json: {
      ...item,
      id,
      chapelId,
      title
    },
    title,
    speaker: pick(item, "speaker", "preacher"),
    service_type: pick(item, "serviceType", "service_type", "category"),
    sermon_date: ensureDateString(pick(item, "date", "sermonDate", "sermon_date", "publishedAt")),
    video_url: pick(item, "videoUrl", "video", "youtubeUrl", "url"),
    thumbnail_url: pick(item, "thumbnail", "thumbnailUrl", "image"),
    description: pick(item, "description", "summary", "excerpt"),
    tags_json: Array.isArray(item.tags) ? item.tags : [],
    published: item.published === false ? 0 : 1,
    source_broadcast_id: pick(item, "sourceBroadcastId", "source_broadcast_id"),
    updated_at: metadata.sermons?.updated_at,
    updated_by: metadata.sermons?.updated_by
  });
}

if (generatedSermonIdCount > 0) {
  warnings.push(
    `${generatedSermonIdCount} sermon(s) had no stable ID and received deterministic migration IDs.`
  );
}

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------

for (const [rawKey, channel] of Object.entries(channelMap)) {
  const chapelId = normalizeChapelId(rawKey || channel?.chapelId || channel?.id);
  if (!chapelId) {
    warnings.push("Skipped a broadcast channel with no canonical chapel ID.");
    continue;
  }

  if (!chapelIds.has(chapelId)) {
    errors.push(`Broadcast references unknown chapel '${chapelId}'.`);
    continue;
  }

  const current = channel?.currentBroadcast || {};
  const statusRaw = String(
    pick(channel, "statusOverride", "status") || "auto"
  ).toLowerCase();

  const allowedStatuses = new Set(["auto", "live", "upcoming", "recap", "hidden"]);
  const statusOverride = allowedStatuses.has(statusRaw) ? statusRaw : "auto";
  if (statusOverride !== statusRaw) {
    warnings.push(
      `Broadcast '${chapelId}' status '${statusRaw}' was normalized to 'auto'.`
    );
  }

  let platform = String(
    pick(channel, "platform", "defaultPlatform") || "youtube"
  ).toLowerCase();

  if (!["youtube", "facebook"].includes(platform)) platform = "youtube";

  broadcasts.push({
    id: `broadcast-${chapelId}`,
    chapel_id: chapelId,
    public_json: {
      ...channel,
      id: chapelId,
      chapelId,
      label: chapelId === "peculiar-hq"
        ? "Peculiar HQ"
        : (channel?.label || null)
    },
    title: pick(current, "title") || pick(channel, "title"),
    speaker: pick(current, "speaker") || pick(channel, "speaker"),
    service_type: pick(current, "serviceType") || "Sunday Worship",
    platform,
    video_url:
      pick(current, "videoUrl") ||
      pick(channel?.youtube || {}, "url", "videoUrl") ||
      null,
    youtube_channel_url:
      pick(channel, "youtubeChannelUrl") ||
      pick(channel?.youtube || {}, "channelUrl") ||
      null,
    facebook_video_url:
      pick(current, "facebookVideoUrl") ||
      pick(channel?.facebook || {}, "videoUrl", "url") ||
      null,
    facebook_page_url:
      pick(channel, "facebookPageUrl") ||
      pick(channel?.facebook || {}, "pageUrl") ||
      null,
    starts_at: ensureDateString(pick(current, "startsAt")),
    ends_at: ensureDateString(pick(current, "endsAt")),
    status_override: statusOverride,
    bulletin: pick(channel, "bulletin"),
    schedule_json: Array.isArray(channel.schedule) ? channel.schedule : [],
    recap_url: pick(channel, "replayUrl", "recapUrl") || pick(current, "recapUrl"),
    published_sermon_id: pick(channel, "publishedSermonId"),
    updated_at: metadata.livestream?.updated_at,
    updated_by: metadata.livestream?.updated_by
  });
}

// ---------------------------------------------------------------------------
// Referential validation before generating SQL.
// ---------------------------------------------------------------------------

const sermonIds = new Set(sermons.map(item => item.id));

for (const broadcast of broadcasts) {
  if (
    broadcast.published_sermon_id &&
    !sermonIds.has(broadcast.published_sermon_id)
  ) {
    warnings.push(
      `Broadcast '${broadcast.chapel_id}' references missing published sermon '${broadcast.published_sermon_id}'; reference cleared for rehearsal.`
    );
    broadcast.published_sermon_id = null;
  }
}

const duplicateCheck = (rows, key, label) => {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row[key])) errors.push(`Duplicate ${label}: ${row[key]}`);
    seen.add(row[key]);
  }
};

duplicateCheck(chapels, "id", "chapel ID");
duplicateCheck(sermons, "id", "sermon ID");
duplicateCheck(broadcasts, "chapel_id", "broadcast chapel");

if (sermonReview.length) {
  const reviewReport = {
    ok: false,
    input: inputPath,
    generated_at: new Date().toISOString(),
    requires_sermon_chapel_mapping: sermonReview,
    allowed_location_ids: [...chapelIds].sort(),
    override_file: sermonOverridePath,
    warnings,
    errors
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(reviewReport, null, 2) + "\n");
  console.error("Transformation paused: one or more sermons need an explicit worship-location mapping.");
  for (const item of sermonReview) console.error(`- ${item.id}: ${item.title}`);
  console.error(`Create ${sermonOverridePath} and map each listed sermon ID to a canonical location ID.`);
  console.error(`Review: ${reportPath}`);
  process.exit(2);
}

if (errors.length) {
  const failureReport = {
    ok: false,
    input: inputPath,
    generated_at: new Date().toISOString(),
    warnings,
    errors
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(failureReport, null, 2) + "\n");
  console.error("Transformation stopped because validation errors were found.");
  for (const error of errors) console.error(`- ${error}`);
  console.error(`Review: ${reportPath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SQL generation.
// Staging rehearsal deliberately clears imported content tables but preserves
// RBAC/Admin/security tables created in Stage 2.
// ---------------------------------------------------------------------------

const sql = [];
sql.push("-- GENERATED FILE — Supabase -> D1 staging import rehearsal.");
sql.push("-- Review the accompanying d1-import-report.json before execution.");
sql.push("PRAGMA foreign_keys = ON;");
sql.push("");
sql.push("-- Clear only migrated CONTENT. Preserve cms_admins / roles / scopes / audit.");
sql.push("DELETE FROM broadcasts;");
sql.push("DELETE FROM sermons;");
sql.push("DELETE FROM chapels;");
sql.push("DELETE FROM site_sections;");
sql.push("");

for (const row of siteSections) {
  sql.push(`INSERT INTO site_sections (
  key, data_json, version, published, updated_at, updated_by
) VALUES (
  ${sqlString(row.key)},
  ${jsonSql(row.data)},
  1,
  1,
  ${sqlString(row.updated_at || new Date().toISOString())},
  ${sqlString(row.updated_by)}
);`);
}

for (const row of chapels) {
  sql.push(`INSERT INTO chapels (
  id, slug, title, short_title, page_json, location_type, published, version, updated_at, updated_by
) VALUES (
  ${sqlString(row.id)},
  ${sqlString(row.slug)},
  ${sqlString(row.title)},
  ${sqlString(row.short_title)},
  ${jsonSql(row.page_json)},
  ${sqlString(row.location_type || (row.id === "peculiar-hq" ? "hq" : "chapel"))},
  ${row.published},
  1,
  ${sqlString(row.updated_at || new Date().toISOString())},
  ${sqlString(row.updated_by)}
);`);
}

for (const row of sermons) {
  sql.push(`INSERT INTO sermons (
  id, chapel_id, public_json, title, speaker, service_type, sermon_date, video_url,
  thumbnail_url, description, tags_json, published, source_broadcast_id,
  version, updated_at, updated_by
) VALUES (
  ${sqlString(row.id)},
  ${sqlString(row.chapel_id)},
  ${jsonSql(row.public_json || {})},
  ${sqlString(row.title)},
  ${sqlString(row.speaker)},
  ${sqlString(row.service_type)},
  ${sqlString(row.sermon_date)},
  ${sqlString(row.video_url)},
  ${sqlString(row.thumbnail_url)},
  ${sqlString(row.description)},
  ${jsonSql(row.tags_json)},
  ${row.published},
  ${sqlString(row.source_broadcast_id)},
  1,
  ${sqlString(row.updated_at || new Date().toISOString())},
  ${sqlString(row.updated_by)}
);`);
}

for (const row of broadcasts) {
  sql.push(`INSERT INTO broadcasts (
  id, chapel_id, public_json, title, speaker, service_type, platform, video_url,
  youtube_channel_url, facebook_video_url, facebook_page_url,
  starts_at, ends_at, status_override, bulletin, schedule_json,
  recap_url, published_sermon_id, version, updated_at, updated_by
) VALUES (
  ${sqlString(row.id)},
  ${sqlString(row.chapel_id)},
  ${jsonSql(row.public_json || {})},
  ${sqlString(row.title)},
  ${sqlString(row.speaker)},
  ${sqlString(row.service_type)},
  ${sqlString(row.platform)},
  ${sqlString(row.video_url)},
  ${sqlString(row.youtube_channel_url)},
  ${sqlString(row.facebook_video_url)},
  ${sqlString(row.facebook_page_url)},
  ${sqlString(row.starts_at)},
  ${sqlString(row.ends_at)},
  ${sqlString(row.status_override)},
  ${sqlString(row.bulletin)},
  ${jsonSql(row.schedule_json)},
  ${sqlString(row.recap_url)},
  ${sqlString(row.published_sermon_id)},
  1,
  ${sqlString(row.updated_at || new Date().toISOString())},
  ${sqlString(row.updated_by)}
);`);
}

sql.push("");
sql.push(`INSERT INTO schema_meta (key, value)
VALUES ('last_import_rehearsal', ${sqlString(new Date().toISOString())})
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(sqlPath, sql.join("\n\n") + "\n", "utf8");

const report = {
  ok: true,
  generated_at: new Date().toISOString(),
  source_exported_at: raw.exported_at || null,
  source_row_count: rows.length,
  output: {
    site_sections: siteSections.length,
    chapels: chapels.length,
    sermons: sermons.length,
    broadcasts: broadcasts.length
  },
  source: {
    chapel_details: Object.keys(detailMap).length,
    sermon_items: sermonItems.length,
    broadcast_channels: Object.keys(channelMap).length
  },
  migration_decisions: {
    synthetic_peculiar_hq: chapels.some(
      row => row.id === "peculiar-hq" && row.page_json?.systemGeneratedForMigration === true
    ),
    sermon_chapel_overrides_applied: Object.keys(sermonChapelOverrides).length,
    deterministic_sermon_ids_generated: generatedSermonIdCount
  },
  warnings,
  errors: []
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("Transformation complete.");
console.log(`SQL:    ${sqlPath}`);
console.log(`Report: ${reportPath}`);
console.log("");
console.log(`site_sections: ${siteSections.length}`);
console.log(`chapels:       ${chapels.length}`);
console.log(`sermons:       ${sermons.length}`);
console.log(`broadcasts:    ${broadcasts.length}`);
if (warnings.length) {
  console.log("");
  console.log("Review warnings before import:");
  for (const warning of warnings) console.log(`- ${warning}`);
}
