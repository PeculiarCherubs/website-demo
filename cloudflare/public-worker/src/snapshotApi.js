import { loadPublicSections } from "./publicApi.js";

const SNAPSHOT_PREFIX = "public/sections/";

async function readSnapshot(bucket, key) {
  if (!bucket) return null;

  try {
    const object = await bucket.get(`${SNAPSHOT_PREFIX}${key}.json`);
    if (!object) return null;

    const payload = JSON.parse(await object.text());

    if (
      payload?.contract !== "peculiar-cherubs-public-v1" ||
      payload?.section_key !== key ||
      !payload?.section?.data
    ) {
      return null;
    }

    return payload.section;
  } catch (_) {
    return null;
  }
}

export async function loadSectionsByReadMode(env, requestedKeys) {
  const mode = String(env.PUBLIC_READ_MODE || "d1").trim();

  if (mode !== "r2-prefer" || !env.PUBLIC_SNAPSHOTS) {
    return {
      source: "d1",
      sections: await loadPublicSections(env.DB, requestedKeys)
    };
  }

  const pairs = await Promise.all(
    requestedKeys.map(async key => [key, await readSnapshot(env.PUBLIC_SNAPSHOTS, key)])
  );

  const sections = {};
  const missing = [];

  for (const [key, section] of pairs) {
    if (section) sections[key] = section;
    else missing.push(key);
  }

  if (missing.length) {
    const fallback = await loadPublicSections(env.DB, missing);
    Object.assign(sections, fallback);
  }

  return {
    source: missing.length ? "r2+d1-fallback" : "r2",
    sections
  };
}
