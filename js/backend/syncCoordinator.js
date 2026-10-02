/**
 * syncCoordinator.js
 * Automatic BaaS Synchronization & Failover Reconciler for Peculiar Cherubs Website & CMS.
 *
 * Implements a symmetric, provider-agnostic synchronization architecture:
 * 1. Persistent Local Content Journal: Preserves verified section snapshots and timestamps in client storage.
 * 2. Mutation Outbox: Queues uncommitted/unmirrored writes for guaranteed delivery.
 * 3. Proactive Opportunistic Mirroring: Mirrors writes across backends in the background when online.
 * 4. Symmetric Failover Reconciliation: Reconciles deltas automatically between any two backends
 *    (Supabase <-> PocketBase), falling back seamlessly to the verified local journal if the active
 *    backend has suffered an outage.
 */
(function (global) {
  'use strict';

  const JOURNAL_STORAGE_KEY = 'pdcm_content_journal';
  const OUTBOX_STORAGE_KEY = 'pdcm_mutation_outbox';
  const SYNC_META_STORAGE_KEY = 'pdcm_sync_meta';

  const CANONICAL_SECTIONS = [
    'site', 'navigation', 'home', 'about', 'chapels', 'sermons',
    'livestream', 'publications', 'quickLinks', 'give', 'bibleCollege',
    'ministries', 'events'
  ];

  /**
   * Helper to parse any timestamp representation (ISO string, epoch ms, unix seconds) to epoch ms.
   */
  function parseTimestamp(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') {
      return ts < 10000000000 ? ts * 1000 : ts;
    }
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Safe localStorage helper with in-memory fallback for environments with restricted storage.
   */
  const memoryStorage = {};
  function storageGet(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch (e) {}
    return memoryStorage[key] || null;
  }

  function storageSet(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch (e) {}
    memoryStorage[key] = value;
  }

  const SyncCoordinator = {
    CANONICAL_SECTIONS,

    /**
     * Records a verified section snapshot into the persistent local journal.
     */
    recordSnapshot(sectionKey, sectionData, updatedAt = null, providerName = '') {
      if (!sectionKey || !sectionData) return;
      try {
        const journal = this.getJournal();
        const effectiveUpdatedAt = updatedAt || new Date().toISOString();
        journal[sectionKey] = {
          key: sectionKey,
          data: sectionData,
          updated_at: effectiveUpdatedAt,
          provider: providerName || 'unknown',
          recorded_at: new Date().toISOString()
        };
        storageSet(JOURNAL_STORAGE_KEY, JSON.stringify(journal));
      } catch (err) {
        console.warn('[SyncCoordinator] Could not record snapshot to journal:', err);
      }
    },

    /**
     * Batch records multiple section snapshots into the journal.
     */
    recordMultipleSnapshots(sectionsMap, providerName = '') {
      if (!sectionsMap || typeof sectionsMap !== 'object') return;
      try {
        const journal = this.getJournal();
        const now = new Date().toISOString();
        for (const [key, val] of Object.entries(sectionsMap)) {
          if (!val) continue;
          const data = val.data !== undefined ? val.data : val;
          const updatedAt = val.updated_at || val.updated || now;
          journal[key] = {
            key,
            data,
            updated_at: updatedAt,
            provider: providerName || 'unknown',
            recorded_at: now
          };
        }
        storageSet(JOURNAL_STORAGE_KEY, JSON.stringify(journal));
      } catch (err) {
        console.warn('[SyncCoordinator] Could not batch record snapshots:', err);
      }
    },

    /**
     * Returns the full content journal from storage.
     */
    getJournal() {
      try {
        const raw = storageGet(JOURNAL_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (err) {
        return {};
      }
    },

    /**
     * Returns a single journaled section or null.
     */
    getJournalSection(sectionKey) {
      const journal = this.getJournal();
      return journal[sectionKey] || null;
    },

    /**
     * Enqueues a write mutation to the persistent outbox for guaranteed delivery/mirroring.
     */
    enqueueMutation(sectionKey, sectionData, sourceProvider = '') {
      try {
        const outbox = this.getPendingOutbox();
        const item = {
          id: 'mut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          sectionKey,
          sectionData,
          timestamp: new Date().toISOString(),
          sourceProvider: sourceProvider || '',
          attempts: 0
        };
        outbox.push(item);
        storageSet(OUTBOX_STORAGE_KEY, JSON.stringify(outbox));
        return item;
      } catch (err) {
        console.warn('[SyncCoordinator] Could not enqueue mutation:', err);
        return null;
      }
    },

    /**
     * Returns all pending mutations from the outbox.
     */
    getPendingOutbox() {
      try {
        const raw = storageGet(OUTBOX_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (err) {
        return [];
      }
    },

    /**
     * Removes synced mutation items from the outbox.
     */
    markOutboxSynced(mutationId) {
      try {
        const outbox = this.getPendingOutbox().filter(m => m.id !== mutationId);
        storageSet(OUTBOX_STORAGE_KEY, JSON.stringify(outbox));
      } catch (err) {}
    },

    /**
     * Clears all items in the outbox.
     */
    clearOutbox() {
      try {
        storageSet(OUTBOX_STORAGE_KEY, JSON.stringify([]));
      } catch (err) {}
    },

    /**
     * Proactively attempts opportunistic background mirroring to secondary registered backends.
     */
    async mirrorToSecondary(sectionKey, sectionData, activeProviderName, session = null) {
      if (!global.BackendAdapter || !global.ConfigManager) return;
      const allConfig = global.ConfigManager.getConfig?.() || {};
      const providers = allConfig.providers || {};

      for (const [providerName, cfg] of Object.entries(providers)) {
        if (providerName === activeProviderName) continue;
        try {
          const ProviderClass = global.BackendAdapter.getRegisteredProvider?.(providerName);
          if (!ProviderClass) continue;

          const tempInstance = new ProviderClass(cfg);
          if (typeof tempInstance.mutations?.upsertSection === 'function') {
            await tempInstance.mutations.upsertSection(sectionKey, sectionData, session || {});
            console.log(`[SyncCoordinator] Opportunistically mirrored '${sectionKey}' to '${providerName}'.`);
          }
        } catch (mirrorErr) {
          console.warn(`[SyncCoordinator] Opportunistic mirror to '${providerName}' deferred:`, mirrorErr.message);
        }
      }
    },

    /**
     * Reconciles content deltas between two BaaS providers on switch or manual sync.
     * Symmetric & Provider-Agnostic:
     * - Tests source health.
     * - If source is healthy: reads live sections & metadata directly from source.
     * - If source is down (offline outage): falls back to the verified Local Content Journal & Outbox.
     * - Queries target for existing records and timestamps.
     * - Pushes missing or newer records to target.
     */
    async reconcile({
      sourceProviderName,
      targetProviderName,
      sourceInstance = null,
      targetInstance = null,
      session = null,
      forceLocal = false,
      sections = CANONICAL_SECTIONS
    }) {
      const startTime = Date.now();
      const report = {
        success: false,
        sourceProvider: sourceProviderName,
        targetProvider: targetProviderName,
        sourceMode: 'live_source',
        syncedKeys: [],
        skippedKeys: [],
        errors: [],
        durationMs: 0
      };

      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('cms:sync-started', { detail: { ...report } }));
        }

        // 1. Resolve target provider instance
        let target = targetInstance;
        if (!target && global.BackendAdapter) {
          const ProviderClass = global.BackendAdapter.getRegisteredProvider?.(targetProviderName);
          const targetCfg = global.ConfigManager?.getProviderConfig?.(targetProviderName) || {};
          if (ProviderClass) {
            target = new ProviderClass(targetCfg);
          }
        }
        if (!target) {
          throw new Error(`Target BaaS provider '${targetProviderName}' is not registered or cannot be instantiated.`);
        }

        // 2. Resolve source content: test health or fall back to local journal
        let sourceSections = {};
        let isSourceLive = false;

        if (!forceLocal && sourceInstance) {
          try {
            if (typeof sourceInstance.testConnection === 'function') {
              const test = await sourceInstance.testConnection();
              if (test && test.ok) isSourceLive = true;
            } else {
              isSourceLive = true;
            }
          } catch (e) {
            isSourceLive = false;
          }
        }

        if (isSourceLive && sourceInstance?.content?.fetchSectionsWithMeta) {
          try {
            sourceSections = await sourceInstance.content.fetchSectionsWithMeta(sections);
            report.sourceMode = 'live_source';
            this.recordMultipleSnapshots(sourceSections, sourceProviderName);
          } catch (fetchErr) {
            console.warn(`[SyncCoordinator] Live fetch from '${sourceProviderName}' failed, falling back to local journal:`, fetchErr);
            isSourceLive = false;
          }
        }

        if (!isSourceLive) {
          report.sourceMode = 'local_journal_cache';
          const journal = this.getJournal();
          for (const key of sections) {
            if (journal[key] && journal[key].data !== undefined) {
              sourceSections[key] = {
                data: journal[key].data,
                updated_at: journal[key].updated_at || journal[key].recorded_at || null
              };
            }
          }
        }

        // 3. Fetch existing target sections with metadata for comparison
        let targetSections = {};
        try {
          if (typeof target.content?.fetchSectionsWithMeta === 'function') {
            targetSections = await target.content.fetchSectionsWithMeta(sections);
          } else if (typeof target.content?.fetchSections === 'function') {
            const raw = await target.content.fetchSections(sections);
            for (const [k, v] of Object.entries(raw)) {
              targetSections[k] = { data: v, updated_at: null };
            }
          }
        } catch (targetFetchErr) {
          console.warn(`[SyncCoordinator] Could not fetch existing sections from '${targetProviderName}'. Proceeding with full upsert.`, targetFetchErr);
        }

        // 4. Compare and reconcile deltas
        const effectiveSession = session || global.BackendAdapter?.auth?.getStoredSession?.() || {};

        for (const key of sections) {
          const sourceEntry = sourceSections[key];
          if (!sourceEntry || sourceEntry.data === undefined) {
            continue;
          }

          const targetEntry = targetSections[key];
          let shouldSync = false;

          if (!targetEntry || targetEntry.data === undefined) {
            shouldSync = true;
          } else {
            const sourceTs = parseTimestamp(sourceEntry.updated_at);
            const targetTs = parseTimestamp(targetEntry.updated_at);

            if (sourceTs > targetTs) {
              shouldSync = true;
            } else if (sourceTs === 0 && targetTs === 0) {
              const sourceStr = JSON.stringify(sourceEntry.data);
              const targetStr = JSON.stringify(targetEntry.data);
              if (sourceStr !== targetStr) {
                shouldSync = true;
              }
            }
          }

          if (shouldSync) {
            try {
              if (typeof target.mutations?.upsertSection === 'function') {
                await target.mutations.upsertSection(key, sourceEntry.data, effectiveSession);
                report.syncedKeys.push(key);
                console.log(`[SyncCoordinator] Reconciled section '${key}' -> '${targetProviderName}'.`);
              }
            } catch (upsertErr) {
              report.errors.push({ key, error: upsertErr.message });
              console.error(`[SyncCoordinator] Failed to sync '${key}' to '${targetProviderName}':`, upsertErr);
            }
          } else {
            report.skippedKeys.push(key);
          }
        }

        // 5. Also flush any pending outbox mutations
        const outbox = this.getPendingOutbox();
        for (const mutation of outbox) {
          if (!report.syncedKeys.includes(mutation.sectionKey)) {
            try {
              if (typeof target.mutations?.upsertSection === 'function') {
                await target.mutations.upsertSection(mutation.sectionKey, mutation.sectionData, effectiveSession);
                report.syncedKeys.push(mutation.sectionKey);
                this.markOutboxSynced(mutation.id);
              }
            } catch (outboxErr) {
              report.errors.push({ key: mutation.sectionKey, error: outboxErr.message });
            }
          } else {
            this.markOutboxSynced(mutation.id);
          }
        }

        report.success = report.errors.length === 0;
        report.durationMs = Date.now() - startTime;

        // 6. Record metadata
        const meta = {
          lastSyncAt: new Date().toISOString(),
          lastSyncDirection: `${sourceProviderName} -> ${targetProviderName}`,
          sourceMode: report.sourceMode,
          syncedCount: report.syncedKeys.length,
          skippedCount: report.skippedKeys.length,
          errorsCount: report.errors.length,
          durationMs: report.durationMs
        };
        storageSet(SYNC_META_STORAGE_KEY, JSON.stringify(meta));

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('cms:sync-completed', { detail: { ...report, meta } }));
        }

        return report;
      } catch (fatalErr) {
        report.success = false;
        report.fatalError = fatalErr.message;
        report.durationMs = Date.now() - startTime;
        console.error('[SyncCoordinator] Reconcile error:', fatalErr);

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('cms:sync-failed', { detail: { ...report } }));
        }
        return report;
      }
    },

    /**
     * Returns sync diagnostics & metadata.
     */
    getSyncStatus() {
      try {
        const raw = storageGet(SYNC_META_STORAGE_KEY);
        const meta = raw ? JSON.parse(raw) : null;
        const outbox = this.getPendingOutbox();
        const journal = this.getJournal();
        return {
          meta,
          pendingOutboxCount: outbox.length,
          journaledSectionsCount: Object.keys(journal).length
        };
      } catch (e) {
        return { meta: null, pendingOutboxCount: 0, journaledSectionsCount: 0 };
      }
    }
  };

  // Export globally and CommonJS
  global.SyncCoordinator = SyncCoordinator;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyncCoordinator;
  }
})(typeof window !== 'undefined' ? window : globalThis);
