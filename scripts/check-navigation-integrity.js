const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const issues = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function localTargetExists(raw) {
  if (!raw) return true;
  const href = String(raw).trim();
  if (
    href === '' ||
    href.startsWith('#') ||
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('javascript:')
  ) return true;

  const pathname = href.split('#')[0].split('?')[0];
  return !pathname || exists(pathname);
}
function hasConflictMarkers(text) {
  return /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m.test(text);
}

for (const rel of ['developer-feature-files', '.vscode', 'assets/events/placeholders']) {
  if (exists(rel)) issues.push(`Stale repository artifact still exists: ${rel}`);
}

const content = JSON.parse(read('content/site-content.json'));
const nav = Array.isArray(content.navigation) ? content.navigation : [];

function inspectNav(items, prefix = 'navigation') {
  items.forEach((item, index) => {
    const at = `${prefix}[${index}]`;
    if (!item.label) issues.push(`${at} has no label.`);
    if (!item.href) issues.push(`${at} has no href.`);
    if (item.href === '#') issues.push(`${at} uses forbidden href="#".`);
    if (!localTargetExists(item.href)) issues.push(`${at} points to missing route: ${item.href}`);
    if (Array.isArray(item.children)) inspectNav(item.children, `${at}.children`);
  });
}
inspectNav(nav);

function walkJson(value, at = 'content') {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkJson(v, `${at}[${i}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    const next = `${at}.${key}`;
    if ((key === 'href' || key === 'pdfUrl') && child === '#') {
      issues.push(`${next} uses forbidden placeholder "#".`);
    }
    walkJson(child, next);
  }
}
walkJson(content);

const htmlFiles = fs.readdirSync(root).filter(name => name.endsWith('.html'));
for (const name of htmlFiles) {
  const html = read(name);

  if (name !== 'pdcms.html') {
    const footerIndex = html.indexOf('<footer');
    if (footerIndex >= 0) {
      const footer = html.slice(footerIndex);
      for (const required of [
        'href="about.html">About Us</a>',
        'href="chapels.html">Chapels</a>',
        'href="ministries.html">Ministries</a>',
        'href="house-fellowships.html">House Fellowships</a>'
      ]) {
        if (!footer.includes(required)) {
          issues.push(`${name} footer missing canonical link: ${required}`);
        }
      }
    }
  }

  const attrs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const target of attrs) {
    if (target === '#') issues.push(`${name} contains static href="#".`);
    if (!localTargetExists(target)) issues.push(`${name} references missing local target: ${target}`);
  }

  if (hasConflictMarkers(html)) issues.push(`${name} contains unresolved Git conflict markers.`);
}

for (const rel of ['script.js', 'styles.css', 'js/admin.js', 'js/contentService.js']) {
  if (hasConflictMarkers(read(rel))) issues.push(`${rel} contains unresolved Git conflict markers.`);
}

if (issues.length) {
  console.error('Repository/navigation integrity check FAILED');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('Repository/navigation integrity check PASS');
