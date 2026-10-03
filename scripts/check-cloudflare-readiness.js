const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const issues = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const required = [
  'js/data/runtimeConfig.js',
  'js/data/publicDataClient.js',
  'cloudflare/public-worker/src/index.js',
  'cloudflare/admin-worker/src/index.js',
  'cloudflare/migrations/0001_cloudflare_foundation.sql',
  'docs/migration/CLOUDFLARE_MIGRATION_READY_BASELINE.md'
];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    issues.push(`Missing migration-ready file: ${rel}`);
  }
}

const contentService = read('js/contentService.js');
if (!contentService.includes('PublicDataClient')) {
  issues.push('ContentService is not routed through PublicDataClient.');
}
if (contentService.includes('/rest/v1/') || contentService.includes('/auth/v1/')) {
  issues.push('ContentService still contains direct Supabase endpoint logic.');
}

const runtime = read('js/data/runtimeConfig.js');
if (/localStorage\s*\.(getItem|setItem|removeItem)/.test(runtime)) {
  issues.push('Runtime provider selection must not use localStorage.');
}
if (!runtime.includes("publicProvider: 'supabase-legacy'")) {
  issues.push('Migration baseline must remain explicitly on supabase-legacy until cutover.');
}

for (const rel of [
  'js/backend/pocketbaseProvider.js',
  'js/backend/syncCoordinator.js',
  'content/baas-config.json',
  'docs/deployment/POCKETBASE_FLY_IO_GO_LIVE.md'
]) {
  if (fs.existsSync(path.join(root, rel))) {
    issues.push(`Rejected multi-backend artifact present: ${rel}`);
  }
}

const publicScript = read('script.js');
for (const marker of [
  'u.searchParams.set("email"',
  'u.searchParams.set("name"',
  'u.searchParams.set("phone"'
]) {
  if (publicScript.includes(marker)) {
    issues.push('Giving checkout still places donor identity in URL query parameters.');
  }
}

for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  const html = read(name);
  if (!html.includes('js/contentService.js')) continue;

  const a = html.indexOf('js/data/runtimeConfig.js');
  const b = html.indexOf('js/data/publicDataClient.js');
  const c = html.indexOf('js/contentService.js');

  if (!(a >= 0 && b > a && c > b)) {
    issues.push(`${name}: public provider scripts do not load before ContentService.`);
  }
}

if (issues.length) {
  console.error('Cloudflare readiness check FAILED.');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('Cloudflare readiness check: PASS');
console.log('Public reads are decoupled without browser multi-master synchronization.');
