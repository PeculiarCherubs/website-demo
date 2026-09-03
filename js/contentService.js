/**
 * ContentService.js
 * Unified JavaScript service for fetching site content from Supabase DB ('pdcm') or local JSON fallback.
 */
(function (global) {
  const SUPABASE_CONFIG = {
    url: 'https://iyihwxtkgawphsnrxvop.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWh3eHRrZ2F3cGhzbnJ4dm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MjA3NjIsImV4cCI6MjEwMzk5Njc2Mn0.61qJQ8ev9LFap1bu4A1Lr7Wy8JVvczZVb_KmhlalSQ8',
    tableName: 'site_content',
    localFallbackPath: 'content/site-content.json'
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

  // Section mappings required for specific pages (plus shared 'site', 'navigation', 'chapels')
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

  const cache = {};

  const ContentService = {
    config: SUPABASE_CONFIG,

    /**
     * Checks if a given page is set to fetch from Supabase DB.
     */
    isDbReroutedPage(pageName) {
      return DB_REROUTED_PAGES.has(pageName);
    },

    /**
     * Fetches a single section from Supabase DB site_content table.
     */
    async fetchSectionFromDB(sectionKey) {
      if (cache[sectionKey]) {
        return cache[sectionKey];
      }

      const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tableName}?key=eq.${encodeURIComponent(sectionKey)}&select=key,data`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Accept': 'application/json'
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch section '${sectionKey}' from Supabase: ${response.status} ${response.statusText}`);
      }

      const rows = await response.json();
      if (!rows || rows.length === 0) {
        throw new Error(`Section '${sectionKey}' not found in Supabase DB.`);
      }

      const data = rows[0].data;
      cache[sectionKey] = data;
      return data;
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

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
            'Accept': 'application/json'
          },
          cache: 'no-store'
        });

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
     * Fetches entire content from local JSON file.
     */
    async fetchLocalFallback() {
      const response = await fetch(SUPABASE_CONFIG.localFallbackPath, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Local content fallback failed with status ${response.status}.`);
      }
      return await response.json();
    },

    /**
     * Main entry point for pages to get their required content.
     * Determines whether to load from Supabase DB or local JSON.
     */
    async getPageContent(pageName) {
      const isRerouted = this.isDbReroutedPage(pageName);

      if (isRerouted) {
        try {
          console.log(`[ContentService] Fetching content for page '${pageName}' from Supabase DB ('pdcm')...`);

          const pageSpecificSections = PAGE_SECTION_MAP[pageName] || [pageName];
          const requiredSections = ['site', 'navigation', 'chapels', ...pageSpecificSections];

          const sectionsData = await this.fetchSectionsFromDB(requiredSections);
          const fullContent = { ...sectionsData };

          fullContent._source = 'supabase_db';
          console.log(`[ContentService] Successfully loaded '${pageName}' data from Supabase DB!`, fullContent);
          return fullContent;
        } catch (dbError) {
          console.warn(`[ContentService] Supabase DB fetch failed for '${pageName}'. Falling back to local site-content.json.`, dbError);
          const fallbackContent = await this.fetchLocalFallback();
          fallbackContent._source = 'local_json_fallback';
          return fallbackContent;
        }
      } else {
        console.log(`[ContentService] Fetching content for page '${pageName}' from local site-content.json...`);
        const localContent = await this.fetchLocalFallback();
        localContent._source = 'local_json';
        return localContent;
      }
    }
  };

  global.ContentService = ContentService;
})(typeof window !== 'undefined' ? window : globalThis);
