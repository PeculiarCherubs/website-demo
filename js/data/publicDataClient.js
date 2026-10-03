/**
 * Peculiar Cherubs — PublicDataClient
 *
 * Public read abstraction for the Supabase -> Cloudflare migration.
 *
 * It deliberately does NOT:
 * - choose providers from browser storage;
 * - perform CMS writes;
 * - mirror one backend to another;
 * - use browser data as recovery authority.
 */
(function (global) {
  'use strict';

  const cfg = global.PeculiarRuntimeConfig || {};
  let circuitOpenUntil = 0;

  function timeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      try { return AbortSignal.timeout(ms); } catch (_) {}
    }
    if (typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    }
    return undefined;
  }

  function getProviderName() {
    return cfg.publicProvider || 'supabase-legacy';
  }

  function isCircuitOpen() {
    return Date.now() < circuitOpenUntil;
  }

  function openCircuit() {
    circuitOpenUntil = Date.now() + Number(cfg.circuitBreakerMs || 60000);
  }

  function resetCircuitBreaker() {
    circuitOpenUntil = 0;
  }

  function sanitizedError(err) {
    return {
      name: err?.name || 'Error',
      message: String(err?.message || 'Public data request failed.').slice(0, 240),
      status: Number(err?.status || 0) || undefined
    };
  }

  async function readSupabaseLegacy(sectionKeys) {
    const scfg = cfg.supabaseLegacy || {};
    if (!scfg.url || !scfg.anonKey || !scfg.tableName) {
      throw new Error('Legacy Supabase public-read configuration is incomplete.');
    }

    const filter = sectionKeys.map(key => encodeURIComponent(key)).join(',');
    const endpoint =
      `${scfg.url}/rest/v1/${scfg.tableName}?key=in.(${filter})&select=key,data,updated_at`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: scfg.anonKey,
        Authorization: `Bearer ${scfg.anonKey}`,
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal: timeoutSignal(Number(cfg.fetchTimeoutMs || 4000))
    });

    if (!response.ok) {
      const err = new Error(`Legacy public provider returned HTTP ${response.status}.`);
      err.status = response.status;
      throw err;
    }

    const rows = await response.json();
    const result = {};

    for (const row of Array.isArray(rows) ? rows : []) {
      result[row.key] = {
        data: row.data,
        updated_at: row.updated_at || null
      };
    }

    return result;
  }

  async function readCloudflare(sectionKeys) {
    const base = String(cfg.cloudflare?.publicApiBase || '/api/public').replace(/\/$/, '');
    const response = await fetch(
      `${base}/sections?keys=${encodeURIComponent(sectionKeys.join(','))}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: timeoutSignal(Number(cfg.fetchTimeoutMs || 4000))
      }
    );

    if (!response.ok) {
      const err = new Error(`Cloudflare public provider returned HTTP ${response.status}.`);
      err.status = response.status;
      throw err;
    }

    const payload = await response.json();
    const source = payload?.sections || payload || {};
    const result = {};

    for (const key of sectionKeys) {
      const entry = source[key];
      if (!entry) continue;

      result[key] = Object.prototype.hasOwnProperty.call(entry, 'data')
        ? {
            data: entry.data,
            updated_at: entry.updated_at || entry.version || null
          }
        : {
            data: entry,
            updated_at: null
          };
    }

    return result;
  }

  const PublicDataClient = {
    getProviderName,
    isCircuitOpen,
    resetCircuitBreaker,

    async fetchSectionsWithMeta(sectionKeys) {
      const keys = [...new Set((sectionKeys || []).filter(Boolean))];
      if (!keys.length) return {};

      if (isCircuitOpen()) {
        const err = new Error('Public data provider circuit breaker is temporarily open.');
        err.code = 'provider_circuit_open';
        throw err;
      }

      try {
        const result = getProviderName() === 'cloudflare'
          ? await readCloudflare(keys)
          : await readSupabaseLegacy(keys);

        resetCircuitBreaker();
        return result;
      } catch (err) {
        if (!err?.status || Number(err.status) >= 500) {
          openCircuit();
        }
        console.warn('[PublicDataClient] provider read failed:', sanitizedError(err));
        throw err;
      }
    },

    async getSectionWithMeta(sectionKey) {
      const result = await this.fetchSectionsWithMeta([sectionKey]);
      if (!result[sectionKey]) {
        const err = new Error(`Public section '${sectionKey}' was not returned by the provider.`);
        err.code = 'section_missing';
        throw err;
      }
      return result[sectionKey];
    },

    async getSection(sectionKey) {
      return (await this.getSectionWithMeta(sectionKey)).data;
    }
  };

  global.PublicDataClient = Object.freeze(PublicDataClient);
})(typeof window !== 'undefined' ? window : globalThis);
