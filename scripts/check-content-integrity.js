const fs = require('fs');
const path = require('path');

const contentPath = path.join(__dirname, '..', 'content', 'site-content.json');
const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
const issues = [];

const dummyAccounts = new Set([
  '1012345678',
  '0123456789',
  '5070123456',
  '5080123456',
  '5090123456'
]);

for (const account of content.give?.bankAccounts || []) {
  if (dummyAccounts.has(String(account.accountNumber || ''))) {
    issues.push(`Dummy Giving account remains: ${account.accountNumber}`);
  }
}

if (String(content.give?.whatsappConfirmPhone || '') === '2348000000000') {
  issues.push('Dummy Giving WhatsApp number remains.');
}

for (const item of content.home?.testimonials?.items || []) {
  if (String(item.name || '').trim().toLowerCase() === 'member name') {
    issues.push('Placeholder testimonial identity remains.');
  }
}

for (const item of content.sermons?.items || []) {
  if (String(item.speaker || '').trim().toLowerCase() === 'pastor name') {
    issues.push('Placeholder sermon speaker remains.');
  }
}

for (const item of content.events?.socialFeed || []) {
  if (item.placeholder || String(item.platform || '').trim().toLowerCase() === 'website placeholder') {
    issues.push('Generated event/social placeholder remains.');
  }
}

const idsToCheck = [
  ['sermons', content.sermons?.items || []],
  ['events', content.events?.specialEvents || []],
  ['houseFellowships', content.ministries?.details?.['house-fellowships']?.centres || []]
];

for (const [label, items] of idsToCheck) {
  const seen = new Set();
  for (const item of items) {
    if (!item.id) continue;
    if (seen.has(item.id)) issues.push(`Duplicate ${label} id: ${item.id}`);
    seen.add(item.id);
  }
}

if (issues.length) {
  console.error('Content integrity check FAILED');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('Content integrity check PASS');
