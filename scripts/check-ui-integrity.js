const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const issues = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const publicCss = read('styles.css');
const adminCss = read('admin/admin.css');

const publicRootCount = (publicCss.match(/(^|\n)\s*:root\s*\{/g) || []).length;
if (publicRootCount !== 1) {
  issues.push(`styles.css must contain exactly one public :root token block; found ${publicRootCount}.`);
}

for (const token of [
  '--radius-pill',
  '--shadow-md',
  '--section-space',
  '--transition-base',
  '--focus-ring',
  '--mother-church-logo',
  '--ss-font-scale'
]) {
  if (!publicCss.includes(token)) issues.push(`Missing shared design token: ${token}`);
}

if (!publicCss.includes('CSS / UI STANDARDIZATION LAYER')) {
  issues.push('Public UI standardization layer is missing.');
}

if (!adminCss.includes('ADMIN UI STANDARDIZATION')) {
  issues.push('Admin UI standardization layer is missing.');
}

if (!adminCss.includes('@import "../styles.css";')) {
  issues.push('Admin CSS no longer imports the shared public design system.');
}

if (!publicCss.includes('@media (prefers-reduced-motion: reduce)')) {
  issues.push('Reduced-motion accessibility handling is missing.');
}

// Shared footer styling should be class-based rather than repeated inline styles.
for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  const html = read(file);
  if (/class="brand"\s+style="color:\s*white;?\s*margin-bottom:\s*1rem/i.test(html)) {
    issues.push(`${file} still carries repeated inline footer-brand styling.`);
  }
}

// Ensure every public page still links the canonical stylesheet.
for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  if (file === 'pdcms.html') continue;
  const html = read(file);
  if (!html.includes('href="styles.css"')) {
    issues.push(`${file} does not reference canonical styles.css.`);
  }
}

if (issues.length) {
  console.error('CSS/UI integrity check FAILED');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('CSS/UI integrity check PASS');
