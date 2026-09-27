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

if (issues.length) {
  console.error('Final QA integrity check FAILED');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('Final QA integrity check PASS');
