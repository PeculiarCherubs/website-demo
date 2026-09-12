/**
 * ContentService.js
 * Unified JavaScript service for fetching site content from Supabase DB ('pdcm') or local JSON fallback.
 * Implements section-level lazy loading, in-memory caching, deduplicated requests, and on-demand section fetching.
 */
(function (global) {
  const SUPABASE_CONFIG = {
    url: 'https://iyihwxtkgawphsnrxvop.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWh3eHRrZ2F3cGhzbnJ4dm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MjA3NjIsImV4cCI6MjEwMzk5Njc2Mn0.61qJQ8ev9LFap1bu4A1Lr7Wy8JVvczZVb_KmhlalSQ8',
    tableName: 'site_content',
    localFallbackPath: 'content/site-content.json',
    fetchTimeoutMs: 5000
  };

  // Pages currently configured to fetch live data from Supabase DB
  const DB_REROUTED_PAGES = new Set([
    'ministries',
    'ministryDetail',
    'houseFellowships',
    'bibleCollege',
    'publications',
    'publicationDetail',
    'sermons',
    'about',
    'sundaySchoolDetail'
  ]);

  // Critical shared sections required for initial header/footer paint
  const CRITICAL_SECTIONS = ['site', 'navigation', 'chapels'];

  // Primary page-to-section mapping for lazy section loading
  const PAGE_SECTION_MAP = {
    home: ['home'],
    about: ['about'],
    ministries: ['ministries'],
    ministryDetail: ['ministries'],
    houseFellowships: ['ministries'],
    bibleCollege: ['bibleCollege'],
    chapels: ['chapels'],
    sermons: ['sermons'],
    publications: ['publications'],
    publicationDetail: ['publications'],
    sundaySchoolDetail: ['publications'],
    quickLinks: ['quickLinks'],
    events: ['events'],
    give: ['give']
  };

  // In-memory cache for loaded sections
  const cache = {};
  const pendingRequests = {};
  let localFallbackCache = null;

  const ContentService = {
    config: SUPABASE_CONFIG,

    /**
     * Checks if a given page is set to fetch live data from Supabase DB.
     */
    isDbReroutedPage(pageName) {
      return DB_REROUTED_PAGES.has(pageName);
    },

    /**
     * Creates a safe AbortSignal with timeout.
     */
    getAbortSignal(timeoutMs = SUPABASE_CONFIG.fetchTimeoutMs) {
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        try {
          return AbortSignal.timeout(timeoutMs);
        } catch (e) {
          // Fallback if AbortSignal.timeout fails
        }
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
          const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tableName}?key=eq.${encodeURIComponent(sectionKey)}&select=key,data`;
          const signal = this.getAbortSignal();

          const options = {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_CONFIG.anonKey,
              'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
              'Accept': 'application/json'
            },
            cache: 'no-store'
          };
          if (signal) options.signal = signal;

          const response = await fetch(endpoint, options);
          if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
          const rows = await response.json();
          if (!rows || rows.length === 0) throw new Error(`Section '${sectionKey}' not found.`);

          const data = rows[0].data;
          cache[sectionKey] = data;
          return data;
        } catch (err) {
          console.warn(`[ContentService] On-demand load failed for '${sectionKey}', using local fallback.`, err);
          const fallback = await this.fetchLocalFallback();
          const data = fallback[sectionKey] || {};
          cache[sectionKey] = data;
          return data;
        } finally {
          delete pendingRequests[sectionKey];
        }
      })();

      pendingRequests[sectionKey] = reqPromise;
      return await reqPromise;
    },

    /**
     * Fetches multiple sections concurrently from Supabase DB.
     */
    async fetchSectionsFromDB(sectionKeys) {
      const uniqueKeys = [...new Set(sectionKeys)];
      const missingKeys = uniqueKeys.filter(k => !cache[k]);

      if (missingKeys.length > 0) {
        const keysFilter = missingKeys.map(k => encodeURIComponent(k)).join(',');
        const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tableName}?key=in.(${keysFilter})&select=key,data`;
        const signal = this.getAbortSignal();

        const options = {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
            'Accept': 'application/json'
          },
          cache: 'no-store'
        };
        if (signal) options.signal = signal;

        const response = await fetch(endpoint, options);

        if (!response.ok) {
          throw new Error(`Failed to batch fetch sections [${missingKeys.join(', ')}] from Supabase: ${response.status}`);
        }

        const rows = await response.json();
        rows.forEach(row => {
          cache[row.key] = row.data;
        });
      }

      const result = {};
      uniqueKeys.forEach(k => {
        result[k] = cache[k];
      });

      return result;
    },

    /**
     * Fetches local JSON fallback file with in-memory caching.
     */
    async fetchLocalFallback() {
      if (localFallbackCache) {
        return localFallbackCache;
      }
      const response = await fetch(SUPABASE_CONFIG.localFallbackPath, { cache: 'no-store' });
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
          console.log(`[ContentService] Lazy-loading sections for page '${pageName}' from Supabase DB ('pdcm')...`);

          const pageSpecificSections = PAGE_SECTION_MAP[pageName] || [pageName];
          const requiredSections = [...CRITICAL_SECTIONS, ...pageSpecificSections];

          const sectionsData = await this.fetchSectionsFromDB(requiredSections);
          const fullContent = { ...sectionsData };

          fullContent._source = 'supabase_db';
          console.log(`[ContentService] Successfully loaded '${pageName}' sections:`, Object.keys(fullContent));
          return fullContent;
        } catch (dbError) {
          console.warn(`[ContentService] Supabase DB fetch failed for '${pageName}'. Falling back to local site-content.json.`, dbError);
          const fallbackContent = await this.fetchLocalFallback();
          fallbackContent._source = 'local_json_fallback';
          return fallbackContent;
        }
      } else {
        console.log(`[ContentService] Loading content for page '${pageName}' from local site-content.json...`);
        const localContent = await this.fetchLocalFallback();
        localContent._source = 'local_json';
        return localContent;
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

  global.ContentService = ContentService;
})(typeof window !== 'undefined' ? window : globalThis);
