export const PUBLIC_SECTION_KEYS = Object.freeze([
  "site",
  "navigation",
  "home",
  "about",
  "ministries",
  "publications",
  "events",
  "bibleCollege",
  "quickLinks",
  "give",
  "chapels",
  "sermons",
  "livestream"
]);

const LEGACY_HQ_KEYS = new Set([
  "mother-church",
  "general",
  "mother",
  "motherchurch",
  "mother_church"
]);

export function canonicalLocationKey(value) {
  const key = String(value || "").trim();
  return LEGACY_HQ_KEYS.has(key) ? "peculiar-hq" : key;
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function latestTimestamp(values) {
  const valid = values.filter(Boolean);
  if (!valid.length) return null;

  return valid.reduce((latest, candidate) => {
    const latestTime = Date.parse(latest);
    const candidateTime = Date.parse(candidate);

    if (Number.isFinite(candidateTime) && !Number.isFinite(latestTime)) return candidate;
    if (!Number.isFinite(candidateTime) && Number.isFinite(latestTime)) return latest;
    if (Number.isFinite(candidateTime) && candidateTime > latestTime) return candidate;
    return latest;
  }, valid[0]);
}

function maxVersion(values) {
  return values.reduce((max, value) => Math.max(max, Number(value || 0)), 1);
}

export function projectChapels(metaRow, chapelRows) {
  const meta = parseJson(metaRow?.data_json, {});
  const details = {};
  const rows = Array.isArray(chapelRows) ? chapelRows : [];

  for (const row of rows) {
    const id = canonicalLocationKey(row.id);
    const page = parseJson(row.page_json, {});

    details[id] = {
      ...page,
      id,
      href: page.href || row.slug ? `${row.slug || id}.html` : `${id}.html`,
      title: page.title || row.title,
      shortTitle: page.shortTitle || row.short_title || row.title,
      category:
        page.category ||
        (row.location_type === "hq" ? "Peculiar HQ" : "Chapel")
    };
  }

  const existingCurrent = Array.isArray(meta.current) ? meta.current : [];
  const current = [];
  const seen = new Set();

  const addCard = card => {
    const id = canonicalLocationKey(card?.id);
    if (!id || seen.has(id)) return;

    const row = rows.find(item => canonicalLocationKey(item.id) === id);
    const page = row ? parseJson(row.page_json, {}) : {};

    current.push({
      ...card,
      id,
      name: card?.name || row?.title || page.title || id,
      subtitle:
        card?.subtitle ||
        page.summary ||
        "",
      status:
        card?.status ||
        (row?.location_type === "hq" ? "Peculiar HQ" : "Current Chapel"),
      logo:
        card?.logo ||
        page.logo ||
        (row?.location_type === "hq"
          ? "assets/logos/mother-church.png"
          : "assets/logos/pdcm-generic.png"),
      href:
        card?.href ||
        page.href ||
        `${row?.slug || id}.html`
    });
    seen.add(id);
  };

  existingCurrent.forEach(addCard);

  // Ensure every published canonical location is discoverable even when an
  // older source snapshot lacked a current-card entry.
  rows
    .slice()
    .sort((a, b) => {
      const ah = a.location_type === "hq" ? 0 : 1;
      const bh = b.location_type === "hq" ? 0 : 1;
      return ah - bh || String(a.title).localeCompare(String(b.title));
    })
    .forEach(row => addCard({ id: row.id }));

  // HQ is deliberately presented first.
  current.sort((a, b) => {
    if (a.id === "peculiar-hq") return -1;
    if (b.id === "peculiar-hq") return 1;
    return 0;
  });

  return {
    data: {
      hero: meta.hero || {},
      current,
      upcoming: Array.isArray(meta.upcoming) ? meta.upcoming : [],
      details
    },
    updated_at: latestTimestamp([
      metaRow?.updated_at,
      ...rows.map(row => row.updated_at)
    ]),
    version: maxVersion([
      metaRow?.version,
      ...rows.map(row => row.version)
    ])
  };
}

export function projectSermons(metaRow, sermonRows) {
  const meta = parseJson(metaRow?.data_json, {});
  const rows = Array.isArray(sermonRows) ? sermonRows : [];

  const items = rows.map(row => {
    const base = parseJson(row.public_json, {});

    return {
      ...base,
      id: row.id,
      chapelId: canonicalLocationKey(row.chapel_id),
      title: row.title || base.title,
      speaker: row.speaker ?? base.speaker ?? "",
      serviceType: row.service_type ?? base.serviceType ?? base.category ?? "",
      date: row.sermon_date ?? base.date ?? base.sermonDate ?? "",
      videoUrl: row.video_url ?? base.videoUrl ?? base.url ?? "",
      thumbnail:
        row.thumbnail_url ??
        base.thumbnail ??
        base.thumbnailUrl ??
        base.image ??
        "",
      description: row.description ?? base.description ?? "",
      tags: parseJson(row.tags_json, Array.isArray(base.tags) ? base.tags : []),
      published: Number(row.published) === 1
    };
  });

  return {
    data: {
      hero: meta.hero || {},
      items
    },
    updated_at: latestTimestamp([
      metaRow?.updated_at,
      ...rows.map(row => row.updated_at)
    ]),
    version: maxVersion([
      metaRow?.version,
      ...rows.map(row => row.version)
    ])
  };
}

export function projectLivestream(metaRow, broadcastRows, chapelRows = []) {
  const meta = parseJson(metaRow?.data_json, {});
  const rows = Array.isArray(broadcastRows) ? broadcastRows : [];
  const chapelMap = new Map(
    (chapelRows || []).map(row => [canonicalLocationKey(row.id), row])
  );

  const channels = {};

  for (const row of rows) {
    const key = canonicalLocationKey(row.chapel_id);
    const base = parseJson(row.public_json, {});
    const current = {
      ...(base.currentBroadcast || {}),
      title:
        row.title ??
        base.currentBroadcast?.title ??
        base.title ??
        "",
      speaker:
        row.speaker ??
        base.currentBroadcast?.speaker ??
        base.speaker ??
        "",
      serviceType:
        row.service_type ??
        base.currentBroadcast?.serviceType ??
        "Sunday Worship",
      videoUrl:
        row.video_url ??
        base.currentBroadcast?.videoUrl ??
        base.youtube?.url ??
        "",
      startsAt:
        row.starts_at ??
        base.currentBroadcast?.startsAt ??
        "",
      endsAt:
        row.ends_at ??
        base.currentBroadcast?.endsAt ??
        ""
    };

    const chapel = chapelMap.get(key);
    const schedule = parseJson(
      row.schedule_json,
      Array.isArray(base.schedule) ? base.schedule : []
    );

    channels[key] = {
      ...base,
      id: key,
      chapelId: key,
      label:
        key === "peculiar-hq"
          ? "Peculiar HQ"
          : (base.label || chapel?.short_title || chapel?.title || key),
      enabled: base.enabled !== false,
      statusOverride: row.status_override || base.statusOverride || "auto",
      defaultPlatform: row.platform || base.defaultPlatform || "youtube",
      youtubeChannelUrl:
        row.youtube_channel_url ??
        base.youtubeChannelUrl ??
        base.youtube?.channelUrl ??
        "",
      facebookPageUrl:
        row.facebook_page_url ??
        base.facebookPageUrl ??
        base.facebook?.pageUrl ??
        "",
      replayUrl: row.recap_url ?? base.replayUrl ?? base.recapUrl ?? "",
      bulletin: row.bulletin ?? base.bulletin ?? "",
      schedule: Array.isArray(schedule) ? schedule : [],
      youtube: {
        ...(base.youtube || {}),
        channelUrl:
          row.youtube_channel_url ??
          base.youtube?.channelUrl ??
          base.youtubeChannelUrl ??
          "",
        url:
          row.video_url ??
          base.youtube?.url ??
          base.currentBroadcast?.videoUrl ??
          ""
      },
      facebook: {
        ...(base.facebook || {}),
        videoUrl:
          row.facebook_video_url ??
          base.facebook?.videoUrl ??
          base.facebook?.url ??
          "",
        pageUrl:
          row.facebook_page_url ??
          base.facebook?.pageUrl ??
          ""
      },
      currentBroadcast: current
    };
  }

  return {
    data: {
      hero: meta.hero || {},
      channels
    },
    updated_at: latestTimestamp([
      metaRow?.updated_at,
      ...rows.map(row => row.updated_at)
    ]),
    version: maxVersion([
      metaRow?.version,
      ...rows.map(row => row.version)
    ])
  };
}
