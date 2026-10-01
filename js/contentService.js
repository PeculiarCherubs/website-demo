/**
 * ContentService.js
 * Unified JavaScript service for fetching site content via BackendAdapter or local JSON fallback.
 * Implements section-level lazy loading, in-memory caching, deduplicated requests, on-demand section fetching,
 * and optimistic concurrency metadata tracking.
 */
(function (global) {
  'use strict';

  // Resolve the fallback JSON relative to this script so it works from both
  // root pages and nested pages such as /admin/index.html.
  const CONTENT_SERVICE_SCRIPT_URL =
    typeof document !== 'undefined' && document.currentScript?.src
      ? document.currentScript.src
      : null;

  const LOCAL_FALLBACK_URL = CONTENT_SERVICE_SCRIPT_URL
    ? new URL('../content/site-content.json', CONTENT_SERVICE_SCRIPT_URL).href
    : 'content/site-content.json';

  // Default configuration for backwards-compatibility
  const DEFAULT_CONFIG = {
    url: 'https://iyihwxtkgawphsnrxvop.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWh3eHRrZ2F3cGhzbnJ4dm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MjA3NjIsImV4cCI6MjEwMzk5Njc2Mn0.61qJQ8ev9LFap1bu4A1Lr7Wy8JVvczZVb_KmhlalSQ8',
    tableName: 'site_content',
    localFallbackPath: LOCAL_FALLBACK_URL,
    fetchTimeoutMs: 4000
  };

  // Pages currently configured to fetch live data from BaaS DB
  const DB_REROUTED_PAGES = new Set([
    'home',
    'ministries',
    'ministryDetail',
    'chapelDetail',
    'chapels',
    'houseFellowships',
    'bibleCollege',
    'publications',
    'publicationDetail',
    'sermons',
    'about',
    'sundaySchoolDetail',
    'publicationPost',
    'events',
    'quickLinks',
    'give',
    'live'
  ]);

  // Critical shared sections required for initial header/footer paint
  const CRITICAL_SECTIONS = ['site', 'navigation', 'chapels', 'livestream'];

  // Primary page-to-section mapping for lazy section loading
  const PAGE_SECTION_MAP = {
    home: ['home', 'ministries', 'sermons', 'quickLinks'],
    about: ['about'],
    ministries: ['ministries'],
    ministryDetail: ['ministries'],
    chapelDetail: ['chapels', 'sermons'],
    houseFellowships: ['ministries'],
    bibleCollege: ['bibleCollege'],
    chapels: ['chapels'],
    sermons: ['sermons'],
    live: ['livestream', 'sermons'],
    publications: ['publications'],
    publicationDetail: ['publications'],
    publicationPost: ['publications'],
    sundaySchoolDetail: ['publications'],
    quickLinks: ['quickLinks'],
    events: ['events'],
    give: ['give']
  };

  // In-memory cache for loaded sections
  const cache = {};
  const versions = {};
  const pendingRequests = {};
  let localFallbackCache = null;

  const ContentService = {
    config: DEFAULT_CONFIG,

    /**
     * Checks if a given page is set to fetch live data from BaaS DB.
     */
    isDbReroutedPage(pageName) {
      return DB_REROUTED_PAGES.has(pageName);
    },

    /**
     * Creates a safe AbortSignal with timeout.
     */
    getAbortSignal(timeoutMs = DEFAULT_CONFIG.fetchTimeoutMs) {
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        try {
          return AbortSignal.timeout(timeoutMs);
        } catch (e) {}
      }
      if (typeof AbortController !== 'undefined') {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeoutMs);
        return controller.signal;
      }
      return null;
    },

    /**
     * Fetches a single section lazily / on-demand from DB or cache.
     */
    async getSection(sectionKey) {
      if (cache[sectionKey]) {
        return cache[sectionKey];
      }
      if (pendingRequests[sectionKey]) {
        return await pendingRequests[sectionKey];
      }

      const reqPromise = (async () => {
        try {
          // If BackendAdapter circuit breaker is open, immediately short-circuit to fallback
          if (global.BackendAdapter?.isCircuitOpen?.()) {
            throw new Error('Backend circuit breaker open.');
          }

          let data;
          let updatedAt = null;

          if (global.BackendAdapter?.content?.getSection) {
            data = await global.BackendAdapter.content.getSection(sectionKey);
            const verObj = await global.BackendAdapter.content.getSectionVersion(sectionKey).catch(() => null);
            updatedAt = (typeof verObj === 'string' || typeof verObj === 'number')
              ? verObj
              : (verObj?.updated_at || verObj?.version || null);
          } else {
            // Direct fetch fallback if BackendAdapter not yet registered
            const endpoint = `${this.config.url}/rest/v1/${this.config.tableName}?key=eq.${encodeURIComponent(sectionKey)}&select=key,data,updated_at`;
            const signal = this.getAbortSignal();
            const resp = await fetch(endpoint, {
              headers: {
                'apikey': this.config.anonKey,
                'Authorization': `Bearer ${this.config.anonKey}`,
                'Accept': 'application/json'
              },
              signal,
              cache: 'no-store'
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const rows = await resp.json();
            if (!rows || rows.length === 0) throw new Error(`Section '${sectionKey}' not found.`);
            data = rows[0].data;
            updatedAt = rows[0].updated_at || null;
          }

          cache[sectionKey] = data;
          versions[sectionKey] = updatedAt;
          return data;
        } catch (err) {
          console.warn(`[ContentService] On-demand live load failed for '${sectionKey}', using local fallback.`, err);
          const fallback = await this.fetchLocalFallback();
          return fallback[sectionKey] || {};
        } finally {
          delete pendingRequests[sectionKey];
        }
      })();

      pendingRequests[sectionKey] = reqPromise;
      return await reqPromise;
    },

    /**
     * Fetches multiple sections concurrently from active BaaS DB.
     */
    async fetchSectionsFromDB(sectionKeys) {
      const uniqueKeys = [...new Set(sectionKeys)];
      const missingKeys = uniqueKeys.filter(k => !cache[k]);

      if (missingKeys.length > 0) {
        // If circuit breaker is open, throw immediately to trigger local fallback
        if (global.BackendAdapter?.isCircuitOpen?.()) {
          throw new Error('Backend circuit breaker is open. Short-circuiting to local fallback.');
        }

        if (global.BackendAdapter?.content?.fetchSectionsWithMeta) {
          const fetchedMap = await global.BackendAdapter.content.fetchSectionsWithMeta(missingKeys);
          for (const [k, entry] of Object.entries(fetchedMap)) {
            cache[k] = entry.data;
            versions[k] = entry.updated_at || null;
          }
        } else if (global.BackendAdapter?.content?.fetchSections) {
          const fetchedMap = await global.BackendAdapter.content.fetchSections(missingKeys);
          for (const [k, d] of Object.entries(fetchedMap)) {
            cache[k] = d?.data !== undefined ? d.data : d;
            versions[k] = d?.updated_at || null;
          }
        } else {
          // Direct fetch fallback
          const keysFilter = missingKeys.map(k => encodeURIComponent(k)).join(',');
          const endpoint = `${this.config.url}/rest/v1/${this.config.tableName}?key=in.(${keysFilter})&select=key,data,updated_at`;
          const signal = this.getAbortSignal();

          const resp = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'apikey': this.config.anonKey,
              'Authorization': `Bearer ${this.config.anonKey}`,
              'Accept': 'application/json'
            },
            signal,
            cache: 'no-store'
          });

          if (!resp.ok) {
            throw new Error(`Failed to batch fetch sections [${missingKeys.join(', ')}]: ${resp.status}`);
          }

          const rows = await resp.json();
          rows.forEach(row => {
            cache[row.key] = row.data;
            versions[row.key] = row.updated_at || null;
          });
        }
      }

      const unresolvedKeys = uniqueKeys.filter(
        key => !Object.prototype.hasOwnProperty.call(cache, key)
      );

      if (unresolvedKeys.length > 0) {
        throw new Error(
          `BaaS database is missing required site_content section(s): ${unresolvedKeys.join(', ')}`
        );
      }

      const result = {};
      uniqueKeys.forEach(key => {
        result[key] = cache[key];
      });

      return result;
    },

    /**
     * Keeps the live section cache coherent after a successful CMS write.
     */
    setCachedSection(sectionKey, sectionData, updatedAt = null) {
      cache[sectionKey] = sectionData;
      if (updatedAt !== null && updatedAt !== undefined) {
        versions[sectionKey] = updatedAt;
      }
    },

    /**
     * Returns the optimistic-concurrency version loaded for a section.
     */
    getSectionVersion(sectionKey) {
      return Object.prototype.hasOwnProperty.call(versions, sectionKey)
        ? versions[sectionKey]
        : null;
    },

    /**
     * Clears live BaaS cache so the next read is forced back to the active DB.
     */
    clearCache(sectionKey = null) {
      if (sectionKey) {
        delete cache[sectionKey];
        delete versions[sectionKey];
        delete pendingRequests[sectionKey];
        return;
      }

      Object.keys(cache).forEach(key => delete cache[key]);
      Object.keys(versions).forEach(key => delete versions[key]);
      Object.keys(pendingRequests).forEach(key => delete pendingRequests[key]);
    },

    /**
     * Fetches local JSON fallback file with in-memory caching.
     */
    async fetchLocalFallback() {
      if (localFallbackCache) {
        return localFallbackCache;
      }

      console.log(`[ContentService] Loading local fallback from ${this.config.localFallbackPath}`);

      const response = await fetch(this.config.localFallbackPath, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Local content fallback failed with status ${response.status}.`);
      }
      localFallbackCache = await response.json();
      return localFallbackCache;
    },

    /**
     * Main entry point for page content.
     * Lazy-loads only required critical & page-specific sections.
     */
    async getPageContent(pageName) {
      const isRerouted = this.isDbReroutedPage(pageName);

      if (isRerouted) {
        try {
          const providerName = global.BackendAdapter?.getActiveProviderName?.() || 'live_baas';
          console.log(`[ContentService] Lazy-loading sections for page '${pageName}' from ${providerName}...`);

          const pageSpecificSections = PAGE_SECTION_MAP[pageName] || [pageName];
          const requiredSections = [...CRITICAL_SECTIONS, ...pageSpecificSections];

          const sectionsData = await this.fetchSectionsFromDB(requiredSections);
          const fullContent = { ...sectionsData };

          fullContent._source = `${providerName}_db`;
          console.log(`[ContentService] Successfully loaded '${pageName}' sections from ${providerName}:`, Object.keys(fullContent));
          return fullContent;
        } catch (dbError) {
          console.warn(`[ContentService] Live BaaS DB fetch failed for '${pageName}'. Falling back to local site-content.json.`, dbError);
          const fallbackContent = await this.fetchLocalFallback();
          return {
            ...fallbackContent,
            _source: 'local_json_fallback'
          };
        }
      } else {
        console.log(`[ContentService] Loading content for page '${pageName}' from local site-content.json...`);
        const localContent = await this.fetchLocalFallback();
        return {
          ...localContent,
          _source: 'local_json'
        };
      }
    },

    /**
     * Lazy-load section helper on demand.
     */
    async loadLazySection(sectionKey) {
      console.log(`[ContentService] On-demand lazy-loading section '${sectionKey}'...`);
      return await this.getSection(sectionKey);
    }
  };

  // Sync ContentService.config whenever ConfigManager updates
  if (global.ConfigManager?.subscribe) {
    global.ConfigManager.subscribe((activeName, activeCfg) => {
      if (activeCfg) {
        ContentService.config = {
          ...ContentService.config,
          ...activeCfg,
          url: activeCfg.url || ContentService.config.url,
          anonKey: activeCfg.anonKey || ContentService.config.anonKey,
          tableName: activeCfg.tableName || ContentService.config.tableName
        };
      }
      ContentService.clearCache();
    });
  }

  // Clear cache if provider switches
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('cms:baas-changed', () => {
      ContentService.clearCache();
    });
  }

  global.ContentService = ContentService;
})(typeof window !== 'undefined' ? window : globalThis);
