/**
 * config.js
 * Central BaaS Configuration Manager for Peculiar Cherubs Website & CMS.
 * Handles dynamic BaaS provider configuration, local overrides, and observable change events.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY_ACTIVE = 'pdcm_active_baas_provider';
  const STORAGE_KEY_CONFIG = 'pdcm_baas_config_override';

  // Base script URL for relative path resolution across root and /admin/
  const SCRIPT_URL =
    typeof document !== 'undefined' && document.currentScript?.src
  function getConfigCandidates() {
    const urls = [];
    if (typeof document !== 'undefined') {
      const script = document.currentScript || document.querySelector?.('script[src*="config.js"]');
      if (script?.src) {
        try { urls.push(new URL('../../content/baas-config.json', script.src).href); } catch (e) { }
      }
      if (typeof location !== 'undefined' && location.href) {
        try {
          if (location.pathname.includes('/admin')) {
            urls.push(new URL('../content/baas-config.json', location.href).href);
          }
          urls.push(new URL('content/baas-config.json', location.href).href);
        } catch (e) { }
      }
    }
    urls.push('content/baas-config.json', '../content/baas-config.json', '../../content/baas-config.json');
    return [...new Set(urls)];
  }

  // Fallback defaults in case remote baas-config.json cannot be fetched
  const DEFAULT_CONFIG = {
    activeProvider: 'supabase',
    providers: {
      supabase: {
        name: 'Supabase',
        url: 'https://iyihwxtkgawphsnrxvop.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWh3eHRrZ2F3cGhzbnJ4dm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MjA3NjIsImV4cCI6MjEwMzk5Njc2Mn0.61qJQ8ev9LFap1bu4A1Lr7Wy8JVvczZVb_KmhlalSQ8',
        tableName: 'site_content',
        fetchTimeoutMs: 4000
      },
      pocketbase: {
        name: 'PocketBase',
        url: 'http://127.0.0.1:8090',
        contentCollection: 'site_content',
        usersCollection: 'users',
        fetchTimeoutMs: 4000
      }
    }
  };

  let currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  let isInitialized = false;
  let initPromise = null;
  const subscribers = new Set();

  const ConfigManager = {
    /**
     * Initializes configuration by fetching content/baas-config.json
     * and merging any Super Admin localStorage overrides or local development configs.
     */
    async init() {
      if (initPromise) return initPromise;

      initPromise = (async () => {
        let remoteJson = null;
        for (const candidate of getConfigCandidates()) {
          try {
            const resp = await fetch(candidate, { cache: 'no-store' });
            if (resp.ok) {
              remoteJson = await resp.json();
              if (remoteJson && remoteJson.providers) break;
            }
          } catch (e) {
            // try next candidate
          }
        }

        // In Node test environments
        if (!remoteJson && typeof require !== 'undefined' && typeof process !== 'undefined') {
          try {
            const fs = require('fs');
            const path = require('path');
            const localPath = path.resolve(__dirname, '../../content/baas-config.json');
            if (fs.existsSync(localPath)) {
              remoteJson = JSON.parse(fs.readFileSync(localPath, 'utf8'));
            }
          } catch (e) { }
        }

        if (remoteJson && remoteJson.providers) {
          if (remoteJson.activeProvider) {
            currentConfig.activeProvider = String(remoteJson.activeProvider).toLowerCase().trim();
          }
          currentConfig.providers = { ...currentConfig.providers, ...remoteJson.providers };
        } else {
          console.warn('[ConfigManager] Could not load remote baas-config.json, using defaults.');
        }

        // Apply local storage overrides if set by Super Admin in this browser
        try {
          if (typeof localStorage !== 'undefined') {
            const savedProvider = localStorage.getItem(STORAGE_KEY_ACTIVE);
            const normalizedSaved = savedProvider ? String(savedProvider).toLowerCase().trim() : null;
            if (normalizedSaved && currentConfig.providers[normalizedSaved]) {
              currentConfig.activeProvider = normalizedSaved;
            }
            const savedOverrides = localStorage.getItem(STORAGE_KEY_CONFIG);
            if (savedOverrides) {
              const parsed = JSON.parse(savedOverrides);
              if (parsed && typeof parsed === 'object') {
                currentConfig.providers = { ...currentConfig.providers, ...parsed };
              }
            }
          }
        } catch (e) {
          // Ignore storage restrictions
        }

        // Apply global.CMS_LOCAL_CONFIG if developer specified one in config.local.js
        if (global.CMS_LOCAL_CONFIG && typeof global.CMS_LOCAL_CONFIG === 'object') {
          if (global.CMS_LOCAL_CONFIG.activeProvider) {
            currentConfig.activeProvider = String(global.CMS_LOCAL_CONFIG.activeProvider).toLowerCase().trim();
          }
          if (global.CMS_LOCAL_CONFIG.providers) {
            currentConfig.providers = { ...currentConfig.providers, ...global.CMS_LOCAL_CONFIG.providers };
          }
        }

        isInitialized = true;
        this.notify();
        return currentConfig;
      })();

      return initPromise;
    },

    /**
     * Returns full configuration
     */
    getConfig() {
      return JSON.parse(JSON.stringify(currentConfig));
    },

    /**
     * Returns the name of the currently active BaaS provider ('supabase' | 'pocketbase')
     */
    getActiveProviderName() {
      return (currentConfig.activeProvider || 'supabase').toLowerCase().trim();
    },

    /**
     * Returns the configuration object for the active provider
     */
    getActiveProviderConfig() {
      const key = this.getActiveProviderName();
      return currentConfig.providers[key] || currentConfig.providers.supabase || {};
    },

    /**
     * Returns the configuration for a specific provider
     */
    getProviderConfig(providerName) {
      return currentConfig.providers[providerName] ? JSON.parse(JSON.stringify(currentConfig.providers[providerName])) : null;
    },

    /**
     * Updates settings for a provider
     */
    setProviderConfig(providerName, configObj) {
      if (!currentConfig.providers[providerName]) {
        currentConfig.providers[providerName] = {};
      }
      currentConfig.providers[providerName] = {
        ...currentConfig.providers[providerName],
        ...configObj
      };
      this.persistLocalOverrides();
      this.notify();
    },

    /**
     * Switches the active BaaS provider (e.g. from 'supabase' to 'pocketbase')
     */
    setActiveProvider(providerName) {
      if (!currentConfig.providers[providerName]) {
        throw new Error(`Unknown BaaS provider: '${providerName}'`);
      }
      currentConfig.activeProvider = providerName;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_ACTIVE, providerName);
        }
      } catch (e) {
        // Storage restricted
      }
      this.notify();
    },

    /**
     * Persists provider overrides to localStorage
     */
    persistLocalOverrides() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(currentConfig.providers));
        }
      } catch (e) {
        // Storage restricted
      }
    },

    /**
     * Generates a downloadable / savable JSON string for content/baas-config.json
     */
    getSerializedConfig() {
      return JSON.stringify({
        activeProvider: currentConfig.activeProvider,
        providers: currentConfig.providers
      }, null, 2);
    },

    /**
     * Subscribes to configuration changes
     */
    subscribe(callback) {
      if (typeof callback === 'function') {
        subscribers.add(callback);
      }
      return () => subscribers.delete(callback);
    },

    /**
     * Dispatches notification to subscribers and window event
     */
    notify() {
      const activeName = currentConfig.activeProvider;
      const activeCfg = this.getActiveProviderConfig();

      subscribers.forEach(cb => {
        try {
          cb(activeName, activeCfg, currentConfig);
        } catch (err) {
          console.error('[ConfigManager] Subscriber error:', err);
        }
      });

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('cms:baas-changed', {
          detail: {
            activeProvider: activeName,
            config: activeCfg,
            allConfig: currentConfig
          }
        }));
      }
    }
  };

  // Expose globally
  global.ConfigManager = ConfigManager;

  // Auto-init asynchronously on script load
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => ConfigManager.init());
    } else {
      ConfigManager.init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
