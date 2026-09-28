const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const issues = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const requiredRoutes = [
  'index.html',
  'about.html',
  'chapels.html',
  'ministries.html',
  'sermons.html',
  'publications.html',
  'publication.html',
  'publication-detail.html',
  'sunday-school.html',
  'events.html',
  'quick-links.html',
  'give.html',
  'bible-college.html',
  'house-fellowships.html',
  'admin/index.html'
];

for (const route of requiredRoutes) {
  if (!exists(route)) issues.push(`Required route/file missing: ${route}`);
}

for (const rel of [
  'script.js',
  'styles.css',
  'js/contentService.js',
  'js/admin.js',
  'admin/admin.css'
]) {
  const text = read(rel);
  if (/^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m.test(text)) {
    issues.push(`Unresolved Git conflict marker in ${rel}`);
  }
}

const content = JSON.parse(read('content/site-content.json'));
for (const requiredSection of [
  'site',
  'navigation',
  'home',
  'about',
  'chapels',
  'ministries',
  'sermons',
  'publications',
  'quickLinks',
  'give',
  'bibleCollege',
  'events'
]) {
  if (!Object.prototype.hasOwnProperty.call(content, requiredSection)) {
    issues.push(`Fallback content missing required section: ${requiredSection}`);
  }
}


const contentService = read('js/contentService.js');
const homeDependencyMatch = contentService.match(/home:\s*\[([^\]]+)\]/);
if (!homeDependencyMatch) {
  issues.push('Home PAGE_SECTION_MAP entry is missing.');
} else {
  for (const required of ['home', 'ministries', 'sermons', 'quickLinks']) {
    if (!homeDependencyMatch[1].includes(`'${required}'`)) {
      issues.push(`Home page loader is missing required section dependency: ${required}`);
    }
  }
}


const chapelDetailPages = [
  'pdcm-gwarinpa.html',
  'pdcm-english.html',
  'pdcm-byazhin.html',
  'pdcm-mega-youth.html'
];

for (const page of chapelDetailPages) {
  const html = read(page);
  if (!html.includes('data-chapel-sermons-section')) {
    issues.push(`${page} is missing the standardized chapel sermons section.`);
  }
  if (!html.includes('data-ministry-social-section')) {
    issues.push(`${page} is missing the standardized chapel social section.`);
  }
}

const chapelContentService = read('js/contentService.js');
if (!chapelContentService.includes("chapelDetail: ['chapels', 'sermons']")) {
  issues.push('Chapel detail pages must load the unified sermons section.');
}


const scopedAccessFiles = [
  'supabase/migrations/chapel-scoped-cms-access.sql',
  'supabase/audits/chapel-scoped-cms-access-audit.sql',
  'docs/security/CHAPEL_SCOPED_CMS_ACCESS.md'
];

for (const file of scopedAccessFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    issues.push(`Chapel-scoped access file missing: ${file}`);
  }
}

const scopedAdmin = read('js/admin.js');
for (const marker of [
  'chapel.content.manage',
  'isChapelScoped',
  'canManageChapel',
  'cms_update_chapel_content',
  'cms_update_chapel_broadcast',
  'cms_upsert_chapel_sermon',
  'cms_delete_chapel_sermon'
]) {
  if (!scopedAdmin.includes(marker)) {
    issues.push(`Chapel-scoped Admin marker missing: ${marker}`);
  }
}


const livestreamCanonicalizationFiles = [
  'supabase/migrations/livestream-schema-canonicalization.sql',
  'supabase/audits/livestream-schema-canonicalization-audit.sql'
];

for (const file of livestreamCanonicalizationFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    issues.push(`Livestream canonicalization file missing: ${file}`);
  }
}


const liveNavigationCleanupFiles = [
  'supabase/migrations/sermons-live-navigation-cleanup.sql',
  'supabase/audits/sermons-live-navigation-cleanup-audit.sql'
];

for (const file of liveNavigationCleanupFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    issues.push(`Sermons/Live navigation cleanup file missing: ${file}`);
  }
}

const liveCleanupScript = read('script.js');
if (!liveCleanupScript.includes('pills.hidden=live.length<=1')) {
  issues.push('Broadcast Hub is not restricting chapel pills to simultaneous live broadcasts.');
}

if (issues.length) {
  console.error('Final QA integrity check FAILED');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('Final QA integrity check PASS');
