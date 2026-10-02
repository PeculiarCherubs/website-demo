#!/usr/bin/env node
/**
 * check-sync-integrity.js
 * Automated test suite for BaaS Automatic Synchronization & Failover Reconciler.
 *
 * Verifies:
 * 1. SyncCoordinator contract, methods, and canonical sections.
 * 2. Snapshot journaling and timestamp parsing.
 * 3. Offline source fallback: When source provider is offline/unreachable, deltas are sourced
 *    from the verified local journal.
 * 4. Delta calculation: newer timestamp or missing section triggers target upsert.
 * 5. Outbox queuing and flushing.
 * 6. Symmetric operation (Supabase -> PocketBase and PocketBase -> Supabase).
 */

const assert = require('assert');
const path = require('path');

// Mock browser global environment
global.window = global;
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};

const SyncCoordinator = require(path.resolve(__dirname, '../js/backend/syncCoordinator.js'));

let testPassed = 0;
let testFailed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    testPassed++;
  } catch (err) {
    console.error(`  ✗ ${desc}: ${err.message}`);
    testFailed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    testPassed++;
  } catch (err) {
    console.error(`  ✗ ${desc}: ${err.message}`);
    testFailed++;
  }
}

async function runTests() {
  console.log('Starting BaaS Sync & Failover Integrity Tests...');

  // 1. Contract & Canonical Sections
  it('SyncCoordinator exposes required contract methods', () => {
    assert.strictEqual(typeof SyncCoordinator.recordSnapshot, 'function');
    assert.strictEqual(typeof SyncCoordinator.recordMultipleSnapshots, 'function');
    assert.strictEqual(typeof SyncCoordinator.getJournal, 'function');
    assert.strictEqual(typeof SyncCoordinator.reconcile, 'function');
    assert.strictEqual(typeof SyncCoordinator.getSyncStatus, 'function');
    assert.ok(Array.isArray(SyncCoordinator.CANONICAL_SECTIONS));
    assert.ok(SyncCoordinator.CANONICAL_SECTIONS.includes('home'));
    assert.ok(SyncCoordinator.CANONICAL_SECTIONS.includes('chapels'));
    assert.ok(SyncCoordinator.CANONICAL_SECTIONS.includes('sermons'));
  });

  // 2. Journaling
  it('Records and retrieves verified section snapshots with timestamps', () => {
    global.localStorage.clear();
    const mockData = { title: 'Welcome to Peculiar Cherubs' };
    const ts = '2026-10-02T12:00:00.000Z';
    SyncCoordinator.recordSnapshot('home', mockData, ts, 'supabase');

    const entry = SyncCoordinator.getJournalSection('home');
    assert.ok(entry, 'Journal entry should exist');
    assert.strictEqual(entry.key, 'home');
    assert.strictEqual(entry.data.title, 'Welcome to Peculiar Cherubs');
    assert.strictEqual(entry.updated_at, ts);
    assert.strictEqual(entry.provider, 'supabase');
  });

  // 3. Outbox Operations
  it('Enqueues and clears outbox mutations', () => {
    global.localStorage.clear();
    const item = SyncCoordinator.enqueueMutation('sermons', { items: [] }, 'supabase');
    assert.ok(item && item.id);
    let outbox = SyncCoordinator.getPendingOutbox();
    assert.strictEqual(outbox.length, 1);
    assert.strictEqual(outbox[0].sectionKey, 'sermons');

    SyncCoordinator.markOutboxSynced(item.id);
    outbox = SyncCoordinator.getPendingOutbox();
    assert.strictEqual(outbox.length, 0);
  });

  // 4. Live Reconciliation with Mock Providers (Supabase -> PocketBase)
  await itAsync('Symmetric live sync: updates missing or newer sections on target', async () => {
    global.localStorage.clear();

    const mockSource = {
      testConnection: async () => ({ ok: true }),
      content: {
        fetchSectionsWithMeta: async (keys) => ({
          home: { data: { title: 'Updated in Supabase' }, updated_at: '2026-10-02T15:00:00.000Z' },
          about: { data: { text: 'Old about' }, updated_at: '2026-10-01T10:00:00.000Z' }
        })
      }
    };

    const targetStore = {
      about: { data: { text: 'Old about' }, updated_at: '2026-10-01T10:00:00.000Z' }
    };
    const upsertedKeys = [];

    const mockTarget = {
      content: {
        fetchSectionsWithMeta: async (keys) => targetStore
      },
      mutations: {
        upsertSection: async (key, data, session) => {
          upsertedKeys.push(key);
          targetStore[key] = { data, updated_at: '2026-10-02T15:00:00.000Z' };
          return { success: true };
        }
      }
    };

    const report = await SyncCoordinator.reconcile({
      sourceProviderName: 'supabase',
      targetProviderName: 'pocketbase',
      sourceInstance: mockSource,
      targetInstance: mockTarget,
      sections: ['home', 'about']
    });

    assert.strictEqual(report.success, true);
    assert.strictEqual(report.sourceMode, 'live_source');
    assert.ok(report.syncedKeys.includes('home'), 'home was missing on target and must be synced');
    assert.ok(report.skippedKeys.includes('about'), 'about has identical timestamp and should be skipped');
    assert.strictEqual(targetStore.home.data.title, 'Updated in Supabase');
  });

  // 5. Offline Source Failover: Source DB goes down! Reconciler falls back to local journal
  await itAsync('Offline Source Failover: Slices changes from local journal when source DB is unreachable', async () => {
    global.localStorage.clear();

    // 1. Prior to outage, changes were recorded in local journal
    SyncCoordinator.recordSnapshot(
      'sermons',
      { items: [{ id: 'sermon-1', title: 'Faith Overcomes' }] },
      '2026-10-02T16:00:00.000Z',
      'supabase'
    );

    // 2. Supabase is now DOWN (testConnection fails)
    const deadSource = {
      testConnection: async () => { throw new Error('Network timeout (Supabase Offline 503)'); },
      content: {
        fetchSectionsWithMeta: async () => { throw new Error('Unreachable'); }
      }
    };

    // 3. PocketBase is online and missing 'sermons'
    const targetStore = {};
    const mockTarget = {
      content: {
        fetchSectionsWithMeta: async () => targetStore
      },
      mutations: {
        upsertSection: async (key, data) => {
          targetStore[key] = { data, updated_at: '2026-10-02T16:00:00.000Z' };
          return { success: true };
        }
      }
    };

    const report = await SyncCoordinator.reconcile({
      sourceProviderName: 'supabase',
      targetProviderName: 'pocketbase',
      sourceInstance: deadSource,
      targetInstance: mockTarget,
      sections: ['sermons']
    });

    assert.strictEqual(report.success, true);
    assert.strictEqual(report.sourceMode, 'local_journal_cache', 'Must fall back to local journal when source is down');
    assert.ok(report.syncedKeys.includes('sermons'));
    assert.strictEqual(targetStore.sermons.data.items[0].title, 'Faith Overcomes');
  });

  // 6. Reverse Failback (PocketBase -> Supabase)
  await itAsync('Symmetric reverse failback: PocketBase -> Supabase operates identically', async () => {
    global.localStorage.clear();

    const mockPocketBase = {
      testConnection: async () => ({ ok: true }),
      content: {
        fetchSectionsWithMeta: async () => ({
          chapels: { data: { items: ['chapel-a'] }, updated_at: '2026-10-02T18:00:00.000Z' }
        })
      }
    };

    const supabaseStore = {
      chapels: { data: { items: [] }, updated_at: '2026-10-01T12:00:00.000Z' }
    };

    const mockSupabase = {
      content: {
        fetchSectionsWithMeta: async () => supabaseStore
      },
      mutations: {
        upsertSection: async (key, data) => {
          supabaseStore[key] = { data, updated_at: '2026-10-02T18:00:00.000Z' };
          return { success: true };
        }
      }
    };

    const report = await SyncCoordinator.reconcile({
      sourceProviderName: 'pocketbase',
      targetProviderName: 'supabase',
      sourceInstance: mockPocketBase,
      targetInstance: mockSupabase,
      sections: ['chapels']
    });

    assert.strictEqual(report.success, true);
    assert.ok(report.syncedKeys.includes('chapels'));
    assert.deepStrictEqual(supabaseStore.chapels.data.items, ['chapel-a']);
  });

  console.log(`
Sync Integrity Tests Completed: ${testPassed} passed, ${testFailed} failed.`);
  if (testFailed > 0) {
    process.exit(1);
  }
}

runTests();
