import {
  PUBLIC_SECTION_KEYS,
  parseJson,
  projectChapels,
  projectSermons,
  projectLivestream
} from "./contentContract.js";

const SPECIAL_SECTION_META = Object.freeze({
  chapels: "chapels_meta",
  sermons: "sermons_meta",
  livestream: "livestream_meta"
});

function unique(values) {
  return [...new Set(values)];
}

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(",");
}

export function validateRequestedKeys(rawKeys) {
  const requested = unique(
    String(rawKeys || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
  );

  if (!requested.length) {
    const err = new Error("section_keys_required");
    err.code = "section_keys_required";
    err.status = 400;
    throw err;
  }

  if (requested.length > 20) {
    const err = new Error("too_many_section_keys");
    err.code = "too_many_section_keys";
    err.status = 400;
    throw err;
  }

  const invalid = requested.filter(key => !PUBLIC_SECTION_KEYS.includes(key));
  if (invalid.length) {
    const err = new Error("invalid_section_key");
    err.code = "invalid_section_key";
    err.status = 400;
    err.invalid = invalid;
    throw err;
  }

  return requested;
}

async function loadSiteSectionRows(db, requested) {
  const databaseKeys = unique(
    requested.map(key => SPECIAL_SECTION_META[key] || key)
  );

  const stmt = db.prepare(`
    SELECT key, data_json, version, updated_at
    FROM site_sections
    WHERE published = 1
      AND key IN (${placeholders(databaseKeys.length)})
  `).bind(...databaseKeys);

  const result = await stmt.all();
  return new Map((result.results || []).map(row => [row.key, row]));
}

async function loadChapels(db) {
  const result = await db.prepare(`
    SELECT
      id,
      slug,
      title,
      short_title,
      page_json,
      location_type,
      published,
      version,
      updated_at
    FROM chapels
    WHERE published = 1
    ORDER BY
      CASE location_type WHEN 'hq' THEN 0 ELSE 1 END,
      title
  `).all();

  return result.results || [];
}

async function loadSermons(db) {
  const result = await db.prepare(`
    SELECT
      id,
      chapel_id,
      public_json,
      title,
      speaker,
      service_type,
      sermon_date,
      video_url,
      thumbnail_url,
      description,
      tags_json,
      published,
      source_broadcast_id,
      version,
      updated_at
    FROM sermons
    WHERE published = 1
    ORDER BY
      CASE WHEN sermon_date IS NULL OR sermon_date = '' THEN 1 ELSE 0 END,
      sermon_date DESC,
      updated_at DESC
  `).all();

  return result.results || [];
}

async function loadBroadcasts(db) {
  const result = await db.prepare(`
    SELECT
      id,
      chapel_id,
      public_json,
      title,
      speaker,
      service_type,
      platform,
      video_url,
      youtube_channel_url,
      facebook_video_url,
      facebook_page_url,
      starts_at,
      ends_at,
      status_override,
      bulletin,
      schedule_json,
      recap_url,
      published_sermon_id,
      version,
      updated_at
    FROM broadcasts
    ORDER BY chapel_id
  `).all();

  return result.results || [];
}

export async function loadPublicSections(db, requestedKeys) {
  const requested = validateRequestedKeys(requestedKeys.join(","));
  const rowsByKey = await loadSiteSectionRows(db, requested);

  const needChapels =
    requested.includes("chapels") ||
    requested.includes("livestream");

  const [chapelRows, sermonRows, broadcastRows] = await Promise.all([
    needChapels ? loadChapels(db) : Promise.resolve([]),
    requested.includes("sermons") ? loadSermons(db) : Promise.resolve([]),
    requested.includes("livestream") ? loadBroadcasts(db) : Promise.resolve([])
  ]);

  const sections = {};

  for (const key of requested) {
    if (key === "chapels") {
      sections.chapels = projectChapels(
        rowsByKey.get(SPECIAL_SECTION_META.chapels),
        chapelRows
      );
      continue;
    }

    if (key === "sermons") {
      sections.sermons = projectSermons(
        rowsByKey.get(SPECIAL_SECTION_META.sermons),
        sermonRows
      );
      continue;
    }

    if (key === "livestream") {
      sections.livestream = projectLivestream(
        rowsByKey.get(SPECIAL_SECTION_META.livestream),
        broadcastRows,
        chapelRows
      );
      continue;
    }

    const row = rowsByKey.get(key);
    if (!row) continue;

    sections[key] = {
      data: parseJson(row.data_json, {}),
      updated_at: row.updated_at || null,
      version: Number(row.version || 1)
    };
  }

  return sections;
}
