/**
 * supabaseProvider.js
 * Supabase BaaS Provider Implementation for Peculiar Cherubs Website & CMS.
 * Encapsulates all Supabase PostgREST, GoTrue Auth, and PostgreSQL RPC endpoints.
 */
(function (global) {
  'use strict';

  class SupabaseProvider {
    constructor(config = {}) {
      this.providerName = 'supabase';
      this.url = (config.url || 'https://iyihwxtkgawphsnrxvop.supabase.co').replace(/\/+$/, '');
      this.anonKey = config.anonKey || '';
      this.tableName = config.tableName || 'site_content';
      this.timeoutMs = Number(config.fetchTimeoutMs || config.timeoutMs || 4000);

      this.content = {
        fetchSections: this.fetchSections.bind(this),
        fetchSectionsWithMeta: this.fetchSectionsWithMeta.bind(this),
        getSection: this.getSection.bind(this),
        getSectionVersion: this.getSectionVersion.bind(this)
      };

      this.auth = {
        signIn: this.signIn.bind(this),
        signOut: this.signOut.bind(this),
        refreshSession: this.refreshSession.bind(this),
        requestPasswordReset: this.requestPasswordReset.bind(this),
        resetPassword: this.resetPassword.bind(this),
        updatePassword: this.updatePassword.bind(this),
        parseAuthUrlTokens: this.parseAuthUrlTokens.bind(this)
      };

      this.rbac = {
        isCmsAdmin: this.isCmsAdmin.bind(this),
        getAccessProfile: this.getAccessProfile.bind(this),
        listRoles: this.listRoles.bind(this),
        listAdmins: this.listAdmins.bind(this),
        assignAdminRole: this.assignAdminRole.bind(this),
        setAdminRole: this.setAdminRole.bind(this),
        removeAdmin: this.removeAdmin.bind(this)
      };

      this.mutations = {
        upsertSection: this.upsertSection.bind(this),
        updateChapelContent: this.updateChapelContent.bind(this),
        updateChapelBroadcast: this.updateChapelBroadcast.bind(this),
        upsertChapelSermon: this.upsertChapelSermon.bind(this),
        deleteChapelSermon: this.deleteChapelSermon.bind(this)
      };
    }

    /**
     * Creates a safe AbortSignal with timeout
     */
    getAbortSignal(timeoutMs = this.timeoutMs) {
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        try {
          return AbortSignal.timeout(timeoutMs);
        } catch (e) {
          // Fallback
        }
      }
      if (typeof AbortController !== 'undefined') {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeoutMs);
        return controller.signal;
      }
      return null;
    }

    /**
     * Non-destructive health check
     */
    async testConnection() {
      const endpoint = `${this.url}/rest/v1/${this.tableName}?select=key&limit=1`;
      const signal = this.getAbortSignal(3500);

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Accept': 'application/json'
        },
        signal,
        cache: 'no-store'
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }

      return {
        ok: true,
        message: 'Successfully connected to Supabase PostgREST & verified site_content.'
      };
    }

    /* -------------------------------------------------------------------------
     * CONTENT METHODS
     * ------------------------------------------------------------------------- */

    async fetchSections(sectionKeys, options = {}) {
      const uniqueKeys = [...new Set(sectionKeys)];
      if (uniqueKeys.length === 0) return {};

      const keysFilter = uniqueKeys.map(k => encodeURIComponent(k)).join(',');
      const endpoint = `${this.url}/rest/v1/${this.tableName}?key=in.(${keysFilter})&select=key,data,updated_at`;
      const signal = options.signal || this.getAbortSignal();

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Accept': 'application/json'
        },
        signal,
        cache: 'no-store'
      });

      if (!resp.ok) {
        throw new Error(`Supabase query failed with status ${resp.status}`);
      }

      const rows = await resp.json();
      const result = {};
      rows.forEach(row => {
        result[row.key] = row.data;
      });
      return result;
    }

    async fetchSectionsWithMeta(sectionKeys, options = {}) {
      const uniqueKeys = [...new Set(sectionKeys)];
      if (uniqueKeys.length === 0) return {};

      const keysFilter = uniqueKeys.map(k => encodeURIComponent(k)).join(',');
      const endpoint = `${this.url}/rest/v1/${this.tableName}?key=in.(${keysFilter})&select=key,data,updated_at`;
      const signal = options.signal || this.getAbortSignal();

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Accept': 'application/json'
        },
        signal,
        cache: 'no-store'
      });

      if (!resp.ok) {
        throw new Error(`Supabase query failed with status ${resp.status}`);
      }

      const rows = await resp.json();
      const result = {};
      rows.forEach(row => {
        result[row.key] = {
          data: row.data,
          updated_at: row.updated_at || null
        };
      });
      return result;
    }

    async getSection(sectionKey, options = {}) {
      const endpoint = `${this.url}/rest/v1/${this.tableName}?key=eq.${encodeURIComponent(sectionKey)}&select=key,data,updated_at`;
      const signal = options.signal || this.getAbortSignal();

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Accept': 'application/json'
        },
        signal,
        cache: 'no-store'
      });

      if (!resp.ok) {
        throw new Error(`Supabase getSection('${sectionKey}') failed: ${resp.status}`);
      }

      const rows = await resp.json();
      if (!rows || rows.length === 0) {
        throw new Error(`Section '${sectionKey}' not found in Supabase.`);
      }
      return rows[0].data;
    }

    async getSectionVersion(sectionKey, options = {}) {
      const endpoint = `${this.url}/rest/v1/${this.tableName}?key=eq.${encodeURIComponent(sectionKey)}&select=key,updated_at`;
      const signal = options.signal || this.getAbortSignal(2500);

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Accept': 'application/json'
        },
        signal,
        cache: 'no-store'
      });

      if (!resp.ok) return null;
      const rows = await resp.json();
      return rows && rows[0] ? (rows[0].updated_at || null) : null;
    }

    /* -------------------------------------------------------------------------
     * AUTH METHODS
     * ------------------------------------------------------------------------- */

    async signIn(email, password) {
      const endpoint = `${this.url}/auth/v1/token?grant_type=password`;
      const signal = this.getAbortSignal(6000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password }),
        signal
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.msg || detail.error_description || 'Invalid email or password.');
      }

      const payload = await resp.json();
      return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresIn: payload.expires_in,
        tokenType: payload.token_type,
        user: payload.user
      };
    }

    async signOut(session) {
      if (!session?.accessToken) return;
      const endpoint = `${this.url}/auth/v1/logout`;
      const signal = this.getAbortSignal(3000);

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`
        },
        signal
      }).catch(() => { });
    }

    async refreshSession(session) {
      if (!session?.refreshToken) return null;
      const endpoint = `${this.url}/auth/v1/token?grant_type=refresh_token`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
        signal
      });

      if (!resp.ok) return null;
      const payload = await resp.json();
      return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresIn: payload.expires_in,
        tokenType: payload.token_type,
        user: payload.user || session.user
      };
    }

    async requestPasswordReset(email, redirectUrl) {
      const endpoint = `${this.url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectUrl)}`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email }),
        signal
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.msg || detail.error_description || 'Could not send recovery link.');
      }
    }

    async resetPassword(newPassword, token) {
      const endpoint = `${this.url}/auth/v1/user`;
      const signal = this.getAbortSignal(6000);

      const resp = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: newPassword }),
        signal
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.msg || detail.error_description || 'Could not update password.');
      }

      const updatedUser = await resp.json();
      return {
        accessToken: token,
        refreshToken: '',
        expiresIn: 3600,
        user: updatedUser
      };
    }

    async updatePassword(newPassword, session) {
      const token = typeof session === 'string' ? session : session?.accessToken;
      return this.resetPassword(newPassword, token);
    }

    parseAuthUrlTokens() {
      const result = {
        accessToken: null,
        refreshToken: null,
        type: null,
        expiresIn: null,
        error: null,
        errorDescription: null
      };

      if (typeof window !== 'undefined' && window.location.hash && window.location.hash.length > 1) {
        try {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          result.accessToken = hashParams.get('access_token');
          result.refreshToken = hashParams.get('refresh_token');
          result.type = hashParams.get('type');
          result.expiresIn = hashParams.get('expires_in');
          result.error = hashParams.get('error');
          result.errorDescription = hashParams.get('error_description');
        } catch (e) { }
      }

      if (typeof window !== 'undefined' && window.location.search && window.location.search.length > 1) {
        try {
          const searchParams = new URLSearchParams(window.location.search);
          if (!result.error && searchParams.get('error')) {
            result.error = searchParams.get('error');
            result.errorDescription = searchParams.get('error_description');
          }
        } catch (e) { }
      }

      return result;
    }

    /* -------------------------------------------------------------------------
     * RBAC METHODS
     * ------------------------------------------------------------------------- */

    async isCmsAdmin(accessToken) {
      if (!accessToken) return false;
      const endpoint = `${this.url}/rest/v1/rpc/is_cms_admin`;
      const signal = this.getAbortSignal(4000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: '{}',
        signal
      });

      if (!resp.ok) return false;
      return (await resp.json()) === true;
    }

    async getAccessProfile(accessToken) {
      if (!accessToken) return null;
      const endpoint = `${this.url}/rest/v1/rpc/cms_get_access_profile`;
      const signal = this.getAbortSignal(4000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: '{}',
        signal
      });

      if (!resp.ok) {
        // Fallback for simple admin
        const isAdmin = await this.isCmsAdmin(accessToken);
        return isAdmin ? { role: 'super_admin', role_key: 'super_admin', permissions: ['*'], isSuperAdmin: true, scope_type: 'global', chapel_scopes: [] } : null;
      }

      const rows = await resp.json();
      const raw = Array.isArray(rows) ? (rows[0] || null) : rows;
      if (!raw) return null;
      const roleKey = raw.role_key || raw.role || '';
      const isSuper = ['super_admin', 'superadmin', 'admin'].includes(String(roleKey).toLowerCase().trim());
      return {
        ...raw,
        role: roleKey || (isSuper ? 'super_admin' : 'editor'),
        role_key: roleKey || (isSuper ? 'super_admin' : 'editor'),
        isSuperAdmin: isSuper || Boolean(raw.isSuperAdmin),
        permissions: isSuper
          ? (Array.isArray(raw.permissions) && raw.permissions.includes('*') ? raw.permissions : [...(raw.permissions || []), '*'])
          : (raw.permissions || [])
      };
    }

    async listRoles(session) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_list_roles`;
      const signal = this.getAbortSignal(4000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: '{}',
        signal
      });

      if (!resp.ok) throw new Error(`Failed to list roles (${resp.status})`);
      return await resp.json();
    }

    async listAdmins(session) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_list_admins`;
      const signal = this.getAbortSignal(4000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: '{}',
        signal
      });

      if (!resp.ok) throw new Error(`Failed to list admins (${resp.status})`);
      return await resp.json();
    }

    async assignAdminRole(session, params) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_assign_admin_role`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params),
        signal
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || `Failed to assign role (${resp.status})`);
      }
      return await resp.json();
    }

    async setAdminRole(session, params) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_set_admin_role`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params),
        signal
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || `Failed to set role (${resp.status})`);
      }
      return await resp.json();
    }

    async removeAdmin(session, targetUserId) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_remove_admin`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_target_user_id: targetUserId }),
        signal
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || `Failed to remove admin (${resp.status})`);
      }
      return await resp.json();
    }

    /* -------------------------------------------------------------------------
     * MUTATION METHODS
     * ------------------------------------------------------------------------- */

    async upsertSection(sectionKey, sectionData, session, options = {}) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_upsert_site_content`;
      const signal = this.getAbortSignal(6000);

      const payload = {
        p_key: sectionKey,
        p_data: sectionData,
        p_expected_updated_at: options.expectedUpdatedAt || options.expectedVersion || null
      };

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let detail = {};
        try { detail = JSON.parse(errText); } catch (e) { }
        const msg = [detail?.code, detail?.message, detail?.details, detail?.hint, errText].filter(Boolean).join(' ') || `Save failed (${resp.status})`;
        const err = new Error(msg);
        err.status = resp.status;
        err.detail = detail;
        throw err;
      }

      const result = await resp.json();
      const savedRow = Array.isArray(result) ? result[0] : result;
      return {
        success: true,
        key: savedRow?.key || sectionKey,
        data: savedRow?.data ?? sectionData,
        updated_at: savedRow?.updated_at || new Date().toISOString()
      };
    }

    async updateChapelContent(chapelId, payload, session) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_update_chapel_content`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_chapel_id: chapelId, p_payload: payload }),
        signal
      });

      if (!resp.ok) throw new Error(`Chapel content update failed: ${resp.status}`);
      return await resp.json();
    }

    async updateChapelBroadcast(chapelId, payload, session) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_update_chapel_broadcast`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_chapel_id: chapelId, p_payload: payload }),
        signal
      });

      if (!resp.ok) throw new Error(`Chapel broadcast update failed: ${resp.status}`);
      return await resp.json();
    }

    async upsertChapelSermon(chapelId, sermon, session) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_upsert_chapel_sermon`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_chapel_id: chapelId, p_sermon: sermon }),
        signal
      });

      if (!resp.ok) throw new Error(`Chapel sermon upsert failed: ${resp.status}`);
      return await resp.json();
    }

    async deleteChapelSermon(chapelId, sermonId, session) {
      const endpoint = `${this.url}/rest/v1/rpc/cms_delete_chapel_sermon`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_chapel_id: chapelId, p_sermon_id: sermonId }),
        signal
      });

      if (!resp.ok) throw new Error(`Chapel sermon delete failed: ${resp.status}`);
      return await resp.json();
    }
  }

  // Register in BackendAdapter
  if (global.BackendAdapter) {
    global.BackendAdapter.register('supabase', SupabaseProvider);
  }

  global.SupabaseProvider = SupabaseProvider;
})(typeof window !== 'undefined' ? window : globalThis);
