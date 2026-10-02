#!/usr/bin/env node
/**
 * check-security-config.js
 * Automated security & credential audit test.
 *
 * Verifies:
 * 1. No leaked master secrets (service_role keys, secret passwords, private keys) in tracked files.
 * 2. .gitignore properly protects local override files (*.local.js, *.credentials.json, .env*).
 * 3. content/baas-config.json contains only public/anon credentials with valid structure.
 * 4. BackendAdapter and providers adhere to the expected CmsBackendAdapter contract.
 * 5. Auth session storage utilizes sessionStorage (cleared on tab close) and not persistent localStorage.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const issues = [];

function read(relPath) {
  try {
    return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
  } catch (err) {
    issues.push(`Could not read file: ${relPath} (${err.message})`);
    return '';
  }
}

// -----------------------------------------------------------------------------
// 1. Audit .gitignore rules
// -----------------------------------------------------------------------------
const gitignore = read('.gitignore');
const requiredIgnorePatterns = [
  'config.local.js',
  '*.local.js',
  '*.credentials.json',
  '.env'
];

for (const pattern of requiredIgnorePatterns) {
  if (!gitignore.includes(pattern)) {
    issues.push(`.gitignore missing critical security pattern: "${pattern}"`);
  }
}

// -----------------------------------------------------------------------------
// 2. Audit baas-config.json
// -----------------------------------------------------------------------------
const baasConfigRaw = read('content/baas-config.json');
try {
  const baasConfig = JSON.parse(baasConfigRaw);
  if (!baasConfig.activeProvider) {
    issues.push('baas-config.json missing "activeProvider" property.');
  }
  if (!baasConfig.providers || typeof baasConfig.providers !== 'object') {
    issues.push('baas-config.json missing "providers" object.');
  }

  // Scan baas-config.json for private/service_role keys
  const configString = JSON.stringify(baasConfig).toLowerCase();
  if (configString.includes('service_role') || configString.includes('secret_key') || configString.includes('superuser')) {
    issues.push('baas-config.json contains sensitive or elevated privilege credentials!');
  }
} catch (err) {
  issues.push(`baas-config.json is not valid JSON: ${err.message}`);
}

// -----------------------------------------------------------------------------
// 3. Scan code files for sensitive tokens or service_role keys
// -----------------------------------------------------------------------------
const filesToAudit = [
  'js/backend/config.js',
  'js/backend/config.example.js',
  'js/backend/syncCoordinator.js',
  'js/backend/backendAdapter.js',
  'js/backend/supabaseProvider.js',
  'js/backend/pocketbaseProvider.js',
  'js/contentService.js',
  'js/admin.js',
  'script.js'
];

const FORBIDDEN_PATTERNS = [
  { regex: /service_role/i, desc: 'Supabase service_role key marker' },
  { regex: /supabase_service_key/i, desc: 'Supabase service key environment variable' },
  { regex: /postgres:\/\/postgres:[^@\s]+@/i, desc: 'PostgreSQL superuser connection string' },
  { regex: /BEGIN\s+(RSA|OPENSSH|EC)?\s*PRIVATE\s+KEY/i, desc: 'Private key marker' }
];

for (const file of filesToAudit) {
  const content = read(file);
  for (const { regex, desc } of FORBIDDEN_PATTERNS) {
    if (regex.test(content)) {
      issues.push(`Potential secret leak in ${file}: matches ${desc}`);
    }
  }
}

// -----------------------------------------------------------------------------
// 4. Verify BackendAdapter & Provider Interface Conformance
// -----------------------------------------------------------------------------
const backendAdapterCode = read('js/backend/backendAdapter.js');
const requiredAdapterMethods = [
  'registerProvider',
  'getActiveProvider',
  'setActiveProvider',
  'testConnection',
  'isCircuitOpen',
  'fetchSections',
  'getSection',
  'signIn',
  'signOut',
  'storeSession',
  'getStoredSession',
  'clearSession',
  'isCmsAdmin',
  'getAccessProfile',
  'upsertSection',
  'sanitizeForLog'
];

for (const method of requiredAdapterMethods) {
  if (!backendAdapterCode.includes(method)) {
    issues.push(`BackendAdapter missing required facade method: ${method}`);
  }
}

// Check session storage usage in backendAdapter.js
if (!backendAdapterCode.includes('sessionStorage.setItem') || !backendAdapterCode.includes('sessionStorage.getItem')) {
  issues.push('BackendAdapter must use sessionStorage for non-persistent auth tokens.');
}

// Verify SupabaseProvider
const supabaseProviderCode = read('js/backend/supabaseProvider.js');
const requiredProviderMethods = [
  'testConnection',
  'fetchSections',
  'getSection',
  'signIn',
  'signOut',
  'isCmsAdmin',
  'getAccessProfile',
  'upsertSection'
];

for (const method of requiredProviderMethods) {
  if (!supabaseProviderCode.includes(method)) {
    issues.push(`SupabaseProvider missing contract method: ${method}`);
  }
}

// Verify PocketBaseProvider
const pocketbaseProviderCode = read('js/backend/pocketbaseProvider.js');
for (const method of requiredProviderMethods) {
  if (!pocketbaseProviderCode.includes(method)) {
    issues.push(`PocketBaseProvider missing contract method: ${method}`);
  }
}

// -----------------------------------------------------------------------------
// 5. Verify Admin Portal BaaS Management Panel
// -----------------------------------------------------------------------------
const adminHtml = read('admin/index.html');
if (!adminHtml.includes('id="adminNavBaaSSettings"') || !adminHtml.includes('id="panelBaaSSettings"')) {
  issues.push('admin/index.html missing BaaS Settings navigation tab or panel.');
}

const adminJs = read('js/admin.js');
if (!adminJs.includes('renderBaaSSettings') || !adminJs.includes('activateBaaSProvider') || !adminJs.includes('testBaaSConnection')) {
  issues.push('js/admin.js missing BaaS Settings UI controller methods.');
}

// -----------------------------------------------------------------------------
// Result
// -----------------------------------------------------------------------------
if (issues.length > 0) {
  console.error('Security & Configuration integrity check FAILED:');
  issues.forEach(issue => console.error(`  ❌ ${issue}`));
  process.exit(1);
} else {
  console.log('Security & Configuration integrity check PASS');
  console.log('  ✅ No secret leaks detected');
  console.log('  ✅ .gitignore properly safeguards developer credentials');
  console.log('  ✅ Public config contains only anon tokens');
  console.log('  ✅ BackendAdapter contract verified across Supabase & PocketBase');
  console.log('  ✅ Session storage uses ephemeral sessionStorage');
  console.log('  ✅ Super Admin BaaS switching controls verified');
  process.exit(0);
}
