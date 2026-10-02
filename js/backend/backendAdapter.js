/**
 * backendAdapter.js
 * Unified BaaS Abstraction Layer & Provider Registry for Peculiar Cherubs Website & CMS.
 * Decouples all UI and content delivery layers from specific backend implementations (Supabase, PocketBase, etc.).
 * Includes session security, log sanitization, and automatic circuit-breaking.
 */
(function (global) {
  'use strict';

  const AUTH_SESSION_KEY = 'pdcm_cms_auth_session';
  const LEGACY_AUTH_SESSION_KEY = 'pdcm_supabase_auth_session';
  const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 1000; // 60s cooldown on failure

  const registeredProviders = {};
  let activeProviderInstance = null;
  let activeProviderName = 'supabase';

  // Circuit breaker state
  const circuitBreaker = {
    isTripped: false,
    trippedAt: 0,
    lastError: null,
    trip(err) {
      this.isTripped = true;
      this.trippedAt = Date.now();
      this.lastError = err;
      console.warn(`[BackendAdapter] Circuit breaker TRIPPED for '${activeProviderName}'. Cooling down for 60s.`, err);
    },
    reset() {
      if (this.isTripped) {
        console.log(`[BackendAdapter] Circuit breaker RESET for '${activeProviderName}'.`);
      }
      this.isTripped = false;
      this.trippedAt = 0;
      this.lastError = null;
    },
    isOpen() {
      if (!this.isTripped) return false;
      if (Date.now() - this.trippedAt > CIRCUIT_BREAKER_COOLDOWN_MS) {
        this.reset();
        return false;
      }
      return true;
    }
  };

  /**
   * Sanitizes logs by redacting sensitive tokens and auth payloads
   */
  function sanitizeForLog(data) {
    if (!data) return data;
    try {
      const clone = JSON.parse(JSON.stringify(data));
      const redactKeys = ['accessToken', 'access_token', 'refreshToken', 'refresh_token', 'password', 'token'];
      const scrub = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
          if (redactKeys.includes(k) && typeof obj[k] === 'string') {
            obj[k] = '[REDACTED]';
          } else if (typeof obj[k] === 'object') {
            scrub(obj[k]);
          }
        }
      };
      scrub(clone);
      return clone;
    } catch (e) {
      return '[Data]';
    }
  }

  const BackendAdapter = {
    /**
     * Registers a BaaS provider implementation
     */
    register(name, ProviderClass) {
      if (typeof ProviderClass !== 'function') {
        throw new Error(`Provider for '${name}' must be a constructor or class.`);
      }
      const normalizedName = String(name).toLowerCase().trim();
      registeredProviders[normalizedName] = ProviderClass;
      console.log(`[BackendAdapter] Registered provider: '${normalizedName}'`);

      const currentTarget = (global.ConfigManager?.getActiveProviderName?.() || activeProviderName).toLowerCase().trim();
      // If this registered provider matches current active provider, instantiate it
      if (normalizedName === currentTarget) {
        activeProviderName = normalizedName;
        this.instantiateActiveProvider();
      }
    },

    registerProvider(name, ProviderClass) {
      return this.register(name, ProviderClass);
    },

    /**
     * Returns a registered provider class
     */
    getRegisteredProvider(name) {
      return registeredProviders[String(name).toLowerCase().trim()] || null;
    },

    /**
     * Instantiates the active provider using current configuration
     */
    instantiateActiveProvider() {
      const configuredName = global.ConfigManager?.getActiveProviderName?.();
      if (configuredName) {
        activeProviderName = configuredName;
      }
      const ProviderClass = registeredProviders[activeProviderName];
      if (!ProviderClass) {
        console.warn(`[BackendAdapter] Active provider '${activeProviderName}' is not yet registered.`);
        return null;
      }

      const cfg = global.ConfigManager?.getActiveProviderConfig?.() || {};
      activeProviderInstance = new ProviderClass(cfg);
      circuitBreaker.reset();
      console.log(`[BackendAdapter] Instantiated active provider: '${activeProviderName}'`);
      return activeProviderInstance;
    },

    /**
     * Returns the active provider instance, ensuring it is initialized
     */
    getActiveProvider() {
      const configuredName = global.ConfigManager?.getActiveProviderName?.();
      if (configuredName && configuredName !== activeProviderName) {
        activeProviderName = configuredName;
        activeProviderInstance = null;
      }
      if (!activeProviderInstance) {
        this.instantiateActiveProvider();
      }
      if (!activeProviderInstance) {
        throw new Error(`No active BaaS provider available for '${activeProviderName}'.`);
      }
      return activeProviderInstance;
    },

    /**
     * Returns the active provider name
     */
    getActiveProviderName() {
      return global.ConfigManager?.getActiveProviderName?.() || activeProviderName;
    },

    /**
     * Switches the active BaaS provider dynamically
     */
    async setActiveProvider(providerName, options = {}) {
      const normalized = String(providerName).toLowerCase().trim();
      const previousProvider = activeProviderName;
      const autoSync = options.autoSync !== false;

      let syncReport = null;
      if (autoSync && global.SyncCoordinator && previousProvider && previousProvider !== normalized) {
        try {
          const sourceInstance = activeProviderInstance;
          syncReport = await global.SyncCoordinator.reconcile({
            sourceProviderName: previousProvider,
            targetProviderName: normalized,
            sourceInstance,
            session: this.auth.getStoredSession()
          });
        } catch (syncErr) {
          console.warn('[BackendAdapter] Automatic failover sync encountered warnings:', syncErr);
        }
      }

      activeProviderName = normalized;
      activeProviderInstance = null;
      if (global.ConfigManager?.setActiveProvider) {
        global.ConfigManager.setActiveProvider(normalized);
      } else {
        this.instantiateActiveProvider();
      }
      return syncReport;
    },

    /**
     * Tests connectivity to a provider without altering current active state
     */
    async testConnection(providerName, customConfig = null) {
      const ProviderClass = registeredProviders[providerName];
      if (!ProviderClass) {
        return {
          ok: false,
          latencyMs: 0,
          error: `Provider '${providerName}' is not registered.`
        };
      }

      const cfg = customConfig || global.ConfigManager?.getProviderConfig?.(providerName) || {};
      const tempProvider = new ProviderClass(cfg);

      const start = Date.now();
      try {
        if (typeof tempProvider.testConnection === 'function') {
          const res = await tempProvider.testConnection();
          return {
            ...res,
            latencyMs: Date.now() - start
          };
        }

        // Generic fallback test: attempt to query 1 section
        await tempProvider.content.fetchSections(['site'], {
          signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(4000) : null
        });

        return {
          ok: true,
          latencyMs: Date.now() - start,
          message: 'Connection and schema verified successfully.'
        };
      } catch (err) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          error: err.message || 'Connection test failed.'
        };
      }
    },

    /**
     * Circuit breaker check
     */
    isCircuitOpen() {
      return circuitBreaker.isOpen();
    },

    /**
     * Public Content Facade
     */
    content: {
      async fetchSections(sectionKeys, options = {}) {
        if (global.ConfigManager?.init) {
          await global.ConfigManager.init();
        }
        if (circuitBreaker.isOpen()) {
          throw new Error(`Circuit breaker open for '${activeProviderName}'. Short-circuiting to fallback.`);
        }
        try {
          const provider = BackendAdapter.getActiveProvider();
          const data = await provider.content.fetchSections(sectionKeys, options);
          circuitBreaker.reset();
          return data;
        } catch (err) {
          circuitBreaker.trip(err);
          throw err;
        }
      },

      async fetchSectionsWithMeta(sectionKeys, options = {}) {
        if (global.ConfigManager?.init) {
          await global.ConfigManager.init();
        }
        if (circuitBreaker.isOpen()) {
          throw new Error(`Circuit breaker open for '${activeProviderName}'. Short-circuiting to fallback.`);
        }
        try {
          const provider = BackendAdapter.getActiveProvider();
          if (typeof provider.content?.fetchSectionsWithMeta === 'function') {
            const data = await provider.content.fetchSectionsWithMeta(sectionKeys, options);
            circuitBreaker.reset();
            return data;
          }
          const plain = await provider.content.fetchSections(sectionKeys, options);
          const mapped = {};
          for (const [k, v] of Object.entries(plain)) {
            mapped[k] = { data: v, updated_at: null };
          }
          circuitBreaker.reset();
          return mapped;
        } catch (err) {
          circuitBreaker.trip(err);
          throw err;
        }
      },

      async getSection(sectionKey, options = {}) {
        if (global.ConfigManager?.init) {
          await global.ConfigManager.init();
        }
        if (circuitBreaker.isOpen()) {
          throw new Error(`Circuit breaker open for '${activeProviderName}'. Short-circuiting to fallback.`);
        }
        try {
          const provider = BackendAdapter.getActiveProvider();
          const data = await provider.content.getSection(sectionKey, options);
          circuitBreaker.reset();
          return data;
        } catch (err) {
          circuitBreaker.trip(err);
          throw err;
        }
      },

      async getSectionVersion(sectionKey, options = {}) {
        try {
          const provider = BackendAdapter.getActiveProvider();
          if (typeof provider.content?.getSectionVersion === 'function') {
            return await provider.content.getSectionVersion(sectionKey, options);
          }
          return null;
        } catch (err) {
          console.warn(`[BackendAdapter] Could not get version for '${sectionKey}':`, err);
          return null;
        }
      }
    },

    /**
     * Authentication Facade
     */
    auth: {
      async signIn(email, password) {
        const provider = BackendAdapter.getActiveProvider();
        const session = await provider.auth.signIn(email, password);
        return BackendAdapter.auth.storeSession(session);
      },

      async signOut() {
        const session = BackendAdapter.auth.getStoredSession();
        try {
          if (session) {
            const provider = BackendAdapter.getActiveProvider();
            await provider.auth.signOut(session);
          }
        } catch (err) {
          console.warn('[BackendAdapter] Remote sign-out failed:', err);
        } finally {
          BackendAdapter.auth.clearSession();
        }
      },

      async refreshSession(session) {
        if (!session?.refreshToken && !session?.accessToken) return null;
        try {
          const provider = BackendAdapter.getActiveProvider();
          const refreshed = await provider.auth.refreshSession(session);
          if (refreshed) {
            return BackendAdapter.auth.storeSession(refreshed);
          }
          BackendAdapter.auth.clearSession();
          return null;
        } catch (err) {
          console.warn('[BackendAdapter] Session refresh failed:', err);
          BackendAdapter.auth.clearSession();
          return null;
        }
      },

      async getValidSession() {
        let session = BackendAdapter.auth.getStoredSession();
        if (!session?.accessToken) return null;

        const SKEW_MS = 60 * 1000;
        if (!session.expiresAt || session.expiresAt - Date.now() <= SKEW_MS) {
          session = await BackendAdapter.auth.refreshSession(session);
        }
        return session;
      },

      getStoredSession() {
        try {
          // Check standard session key
          let raw = sessionStorage.getItem(AUTH_SESSION_KEY);
          // Transparent legacy migration
          if (!raw) {
            raw = sessionStorage.getItem(LEGACY_AUTH_SESSION_KEY);
            if (raw) {
              sessionStorage.setItem(AUTH_SESSION_KEY, raw);
              sessionStorage.removeItem(LEGACY_AUTH_SESSION_KEY);
            }
          }
          return raw ? JSON.parse(raw) : null;
        } catch (err) {
          console.warn('[BackendAdapter] Invalid stored auth session.', err);
          sessionStorage.removeItem(AUTH_SESSION_KEY);
          return null;
        }
      },

      storeSession(payload) {
        if (!payload) return null;
        const expiresIn = Number(payload.expires_in || payload.expiresIn || 3600);
        const session = {
          accessToken: payload.access_token || payload.accessToken || payload.token,
          refreshToken: payload.refresh_token || payload.refreshToken || '',
          tokenType: payload.token_type || payload.tokenType || 'bearer',
          expiresAt: payload.expiresAt || Date.now() + (expiresIn * 1000),
          user: payload.user || payload.record || null,
          provider: activeProviderName
        };

        try {
          sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
        } catch (e) {
          // Storage restricted
        }
        return session;
      },

      clearSession() {
        try {
          sessionStorage.removeItem(AUTH_SESSION_KEY);
          sessionStorage.removeItem(LEGACY_AUTH_SESSION_KEY);
        } catch (e) {
          // Storage restricted
        }
      },

      async requestPasswordReset(email, redirectUrl) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.auth.requestPasswordReset(email, redirectUrl);
      },

      async resetPassword(newPassword, token) {
        const provider = BackendAdapter.getActiveProvider();
        const session = await provider.auth.resetPassword(newPassword, token);
        return BackendAdapter.auth.storeSession(session);
      },

      async updatePassword(newPassword, session) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.auth.updatePassword(newPassword, session);
      },

      parseAuthUrlTokens() {
        const provider = BackendAdapter.getActiveProvider();
        if (typeof provider.auth?.parseAuthUrlTokens === 'function') {
          return provider.auth.parseAuthUrlTokens();
        }
        return { accessToken: null, type: null, error: null };
      },

      clearAuthUrlTokens() {
        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState(null, '', cleanUrl);
        }
      }
    },

    /**
     * Role-Based Access Control (RBAC) Facade
     */
    rbac: {
      async isCmsAdmin(accessTokenOrSession) {
        if (!accessTokenOrSession) return false;
        const provider = BackendAdapter.getActiveProvider();
        return await provider.rbac.isCmsAdmin(accessTokenOrSession);
      },

      async getAccessProfile(accessTokenOrSession) {
        const token = typeof accessTokenOrSession === 'string'
          ? accessTokenOrSession
          : accessTokenOrSession?.accessToken;
        const provider = BackendAdapter.getActiveProvider();
        return await provider.rbac.getAccessProfile(token);
      },

      async listRoles(session) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.rbac.listRoles(session);
      },

      async listAdmins(session) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.rbac.listAdmins(session);
      },

      async assignAdminRole(session, params) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.rbac.assignAdminRole(session, params);
      },

      async setAdminRole(session, params) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.rbac.setAdminRole(session, params);
      },

      async removeAdmin(session, targetUserId) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.rbac.removeAdmin(session, targetUserId);
      }
    },

    /**
     * Content Mutations Facade
     */
    mutations: {
      async upsertSection(sectionKey, sectionData, session, options = {}) {
        const provider = BackendAdapter.getActiveProvider();
        const result = await provider.mutations.upsertSection(sectionKey, sectionData, session, options);

        // Update persistent local journal for offline failover resilience
        if (global.SyncCoordinator?.recordSnapshot) {
          global.SyncCoordinator.recordSnapshot(
            sectionKey,
            sectionData,
            result?.updated_at || new Date().toISOString(),
            activeProviderName
          );
        }

        // Attempt opportunistic secondary mirror in background
        if (global.SyncCoordinator?.mirrorToSecondary) {
          global.SyncCoordinator.mirrorToSecondary(sectionKey, sectionData, activeProviderName, session).catch(err => {
            console.warn('[BackendAdapter] Mirror mutation deferred:', err);
          });
        }

        return result;
      },

      async updateChapelContent(chapelId, payload, session) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.mutations.updateChapelContent(chapelId, payload, session);
      },

      async updateChapelBroadcast(chapelId, payload, session) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.mutations.updateChapelBroadcast(chapelId, payload, session);
      },

      async upsertChapelSermon(chapelId, sermon, session) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.mutations.upsertChapelSermon(chapelId, sermon, session);
      },

      async deleteChapelSermon(chapelId, sermonId, session) {
        const provider = BackendAdapter.getActiveProvider();
        return await provider.mutations.deleteChapelSermon(chapelId, sermonId, session);
      }
    },

    /**
     * BaaS Synchronization & Failover Reconciler Facade
     */
    sync: {
      async reconcile(options = {}) {
        if (!global.SyncCoordinator) throw new Error('SyncCoordinator is unavailable.');
        return await global.SyncCoordinator.reconcile(options);
      },
      getSyncStatus() {
        return global.SyncCoordinator ? global.SyncCoordinator.getSyncStatus() : null;
      }
    },

    sanitizeForLog
  };

  // Wire listener to ConfigManager changes
  if (global.ConfigManager?.subscribe) {
    global.ConfigManager.subscribe((activeName, activeCfg) => {
      activeProviderName = activeName;
      BackendAdapter.instantiateActiveProvider();
    });
  }

  // Listen to window event as backup
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('cms:baas-changed', (e) => {
      if (e.detail?.activeProvider) {
        activeProviderName = e.detail.activeProvider;
        BackendAdapter.instantiateActiveProvider();
      }
    });
  }

  global.BackendAdapter = BackendAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
