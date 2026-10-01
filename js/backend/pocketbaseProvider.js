/**
 * pocketbaseProvider.js
 * PocketBase BaaS Provider Implementation for Peculiar Cherubs Website & CMS.
 * Implements the standardized CmsBackendAdapter interface using PocketBase REST API.
 */
(function (global) {
  'use strict';

  class PocketBaseProvider {
    constructor(config = {}) {
      this.providerName = 'pocketbase';
      this.url = (config.url || 'http://127.0.0.1:8090').replace(/\/+$/, '');
      this.contentCollection = config.contentCollection || 'site_content';
      this.usersCollection = config.usersCollection || 'users';
      this.rolesCollection = config.rolesCollection || 'cms_roles';
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
        } catch (e) { }
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
      const endpoint = `${this.url}/api/health`;
      const signal = this.getAbortSignal(3500);

      try {
        const resp = await fetch(endpoint, { signal, cache: 'no-store' });
        if (resp.ok) {
          return {
            ok: true,
            message: 'Successfully connected to PocketBase server (/api/health).'
          };
        }
      } catch (e) {
        // Try fallback to content collection check
      }

      // Fallback check against content collection
      const collEndpoint = `${this.url}/api/collections/${this.contentCollection}/records?perPage=1`;
      const collResp = await fetch(collEndpoint, {
        signal: this.getAbortSignal(3500),
        cache: 'no-store'
      });

      if (!collResp.ok && collResp.status !== 403 && collResp.status !== 401) {
        throw new Error(`PocketBase connection failed with status ${collResp.status}`);
      }

      return {
        ok: true,
        message: `PocketBase endpoint verified (${this.contentCollection} collection reachable).`
      };
    }

    /* -------------------------------------------------------------------------
     * CONTENT METHODS
     * ------------------------------------------------------------------------- */

    async fetchSections(sectionKeys, options = {}) {
      const uniqueKeys = [...new Set(sectionKeys)];
      if (uniqueKeys.length === 0) return {};

      // Build PocketBase filter: (key='home' || key='chapels' || ...)
      const filterClause = uniqueKeys.map(k => `key='${encodeURIComponent(k)}'`).join('||');
      const endpoint = `${this.url}/api/collections/${this.contentCollection}/records?filter=(${filterClause})&perPage=50`;
      const signal = options.signal || this.getAbortSignal();

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal,
        cache: 'no-store'
      });

      if (!resp.ok) {
        throw new Error(`PocketBase fetch failed with status ${resp.status}`);
      }

      const payload = await resp.json();
      const items = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload) ? payload : []);
      const result = {};

      items.forEach(item => {
        result[item.key] = (typeof item.data === 'string') ? JSON.parse(item.data) : item.data;
      });

      return result;
    }

    async fetchSectionsWithMeta(sectionKeys, options = {}) {
      const uniqueKeys = [...new Set(sectionKeys)];
      if (uniqueKeys.length === 0) return {};

      // Build PocketBase filter: (key='home' || key='chapels' || ...)
      const filterClause = uniqueKeys.map(k => `key='${encodeURIComponent(k)}'`).join('||');
      const endpoint = `${this.url}/api/collections/${this.contentCollection}/records?filter=(${filterClause})&perPage=50`;
      const signal = options.signal || this.getAbortSignal();

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal,
        cache: 'no-store'
      });

      if (!resp.ok) {
        throw new Error(`PocketBase fetch failed with status ${resp.status}`);
      }

      const payload = await resp.json();
      const items = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload) ? payload : []);
      const result = {};

      items.forEach(item => {
        result[item.key] = {
          data: (typeof item.data === 'string') ? JSON.parse(item.data) : item.data,
          updated_at: item.updated || item.version || null
        };
      });

      return result;
    }

    async getSection(sectionKey, options = {}) {
      const endpoint = `${this.url}/api/collections/${this.contentCollection}/records?filter=(key='${encodeURIComponent(sectionKey)}')&perPage=1`;
      const signal = options.signal || this.getAbortSignal();

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal,
        cache: 'no-store'
      });

      if (!resp.ok) throw new Error(`PocketBase getSection failed (${resp.status})`);
      const payload = await resp.json();
      const items = payload.items || [];
      if (items.length === 0) throw new Error(`Section '${sectionKey}' not found in PocketBase.`);

      const item = items[0];
      return (typeof item.data === 'string') ? JSON.parse(item.data) : item.data;
    }

    async getSectionVersion(sectionKey, options = {}) {
      const endpoint = `${this.url}/api/collections/${this.contentCollection}/records?filter=(key='${encodeURIComponent(sectionKey)}')&perPage=1`;
      const signal = options.signal || this.getAbortSignal(2500);

      try {
        const resp = await fetch(endpoint, { headers: { 'Accept': 'application/json' }, signal });
        if (!resp.ok) return null;
        const payload = await resp.json();
        const item = payload.items?.[0];
        if (!item) return null;
        return item.updated || item.version || item.created || null;
      } catch (err) {
        return null;
      }
    }

    /* -------------------------------------------------------------------------
     * AUTH METHODS
     * ------------------------------------------------------------------------- */

    async signIn(email, password) {
      const endpoint = `${this.url}/api/collections/${this.usersCollection}/auth-with-password`;
      const signal = this.getAbortSignal(6000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: email, password }),
        signal
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.message || 'Invalid email or password.');
      }

      const payload = await resp.json();
      return {
        accessToken: payload.token,
        refreshToken: '',
        expiresIn: 7 * 24 * 3600, // PocketBase tokens typically default to 7-14 days
        user: payload.record
      };
    }

    async signOut(session) {
      // PocketBase JWT tokens are verified statelessly
    }

    async refreshSession(session) {
      if (!session?.accessToken) return null;
      const endpoint = `${this.url}/api/collections/${this.usersCollection}/auth-refresh`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': session.accessToken,
          'Content-Type': 'application/json'
        },
        signal
      });

      if (!resp.ok) return null;
      const payload = await resp.json();
      return {
        accessToken: payload.token,
        refreshToken: '',
        expiresIn: 7 * 24 * 3600,
        user: payload.record
      };
    }

    async requestPasswordReset(email, redirectUrl) {
      const endpoint = `${this.url}/api/collections/${this.usersCollection}/request-password-reset`;
      const signal = this.getAbortSignal(5000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.message || 'Could not send password reset request.');
      }
    }

    async resetPassword(newPassword, token) {
      const endpoint = `${this.url}/api/collections/${this.usersCollection}/confirm-password-reset`;
      const signal = this.getAbortSignal(6000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: newPassword,
          passwordConfirm: newPassword
        }),
        signal
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.message || 'Could not reset password.');
      }

      const payload = await resp.json();
      return {
        accessToken: payload.token || token,
        refreshToken: '',
        user: payload.record
      };
    }

    async updatePassword(newPassword, session) {
      const userId = session?.user?.id;
      if (!userId || !session?.accessToken) throw new Error('Not authenticated.');

      const endpoint = `${this.url}/api/collections/${this.usersCollection}/records/${userId}`;
      const signal = this.getAbortSignal(6000);

      const resp = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': session.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: newPassword,
          passwordConfirm: newPassword
        }),
        signal
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.message || 'Could not update password.');
      }
    }

    parseAuthUrlTokens() {
      const result = { accessToken: null, type: null, error: null };
      if (typeof window !== 'undefined' && window.location.search) {
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get('token')) {
            result.accessToken = params.get('token');
            result.type = 'recovery';
          }
        } catch (e) { }
      }
      return result;
    }

    /* -------------------------------------------------------------------------
     * RBAC METHODS
     * ------------------------------------------------------------------------- */

    async isCmsAdmin(accessTokenOrSession) {
      const session = typeof accessTokenOrSession === 'object' ? accessTokenOrSession : null;
      if (session?.user) {
        const user = session.user;
        const role = String(user.role || (user.is_admin ? 'super_admin' : '')).toLowerCase().trim();
        if (
          ['super_admin', 'superadmin', 'admin', 'content_manager', 'editor', 'chapel_manager', 'chapel_content_manager', 'chapel_admin', 'communications_editor', 'ministry_editor', 'giving_editor', 'site_editor'].includes(role) ||
          user.is_admin === true
        ) {
          return true;
        }
      }
      // If only token provided or role not explicit on session, fetch user access profile
      const profile = await this.getAccessProfile(accessTokenOrSession);
      return Boolean(profile && (profile.isSuperAdmin || (Array.isArray(profile.permissions) && profile.permissions.length > 0)));
    }

    async getAccessProfile(accessTokenOrSession) {
      const token = typeof accessTokenOrSession === 'string' ? accessTokenOrSession : accessTokenOrSession?.accessToken;
      if (!token) return null;

      try {
        const endpoint = `${this.url}/api/collections/${this.usersCollection}/auth-refresh`;
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': token, 'Content-Type': 'application/json' }
        });

        if (!resp.ok) return null;
        const payload = await resp.json();
        const user = payload.record || {};
        const rawRole = String(user.role || (user.is_admin ? 'super_admin' : 'editor')).toLowerCase().trim();
        const isSuperAdmin = ['super_admin', 'superadmin', 'admin'].includes(rawRole) || user.is_admin === true;

        let roleKey = 'editor';
        let roleLabel = 'Content Editor';
        if (isSuperAdmin) {
          roleKey = 'super_admin';
          roleLabel = 'Super Admin';
        } else if (rawRole === 'content_manager') {
          roleKey = 'content_manager';
          roleLabel = 'Content Manager';
        } else if (['chapel_manager', 'chapel_content_manager', 'chapel_admin'].includes(rawRole)) {
          roleKey = 'chapel_content_manager';
          roleLabel = 'Chapel Content Manager';
        } else if (rawRole === 'communications_editor') {
          roleKey = 'communications_editor';
          roleLabel = 'Communications Editor';
        } else if (rawRole === 'ministry_editor') {
          roleKey = 'ministry_editor';
          roleLabel = 'Ministry Editor';
        } else if (rawRole === 'giving_editor') {
          roleKey = 'giving_editor';
          roleLabel = 'Giving Editor';
        } else if (rawRole === 'site_editor') {
          roleKey = 'site_editor';
          roleLabel = 'Site Editor';
        } else if (rawRole) {
          roleKey = rawRole;
          roleLabel = rawRole.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        let chapelScopes = [];
        if (Array.isArray(user.chapel_scopes)) {
          chapelScopes = user.chapel_scopes;
        } else if (typeof user.chapel_scopes === 'string' && user.chapel_scopes.trim()) {
          try {
            const parsed = JSON.parse(user.chapel_scopes);
            if (Array.isArray(parsed)) chapelScopes = parsed;
          } catch (e) {
            chapelScopes = user.chapel_scopes.split(',').map(s => s.trim()).filter(Boolean);
          }
        } else if (user.chapel_id) {
          chapelScopes = [user.chapel_id];
        }

        const scopeType = isSuperAdmin ? 'global' : (chapelScopes.length > 0 ? 'chapel' : 'global');
        if (isSuperAdmin && chapelScopes.length === 0) {
          chapelScopes = ['*'];
        }

        const ALL_SUPER_PERMISSIONS = [
          'publications.manage',
          'sermons.manage',
          'livestream.manage',
          'events.manage',
          'ministries.manage',
          'chapel.content.manage',
          'about.manage',
          'quicklinks.manage',
          'giving.manage',
          'site.manage',
          'advanced.manage',
          'admins.manage',
          'export.manage',
          'history.view',
          '*'
        ];

        let permissions = [];
        if (isSuperAdmin) {
          permissions = ALL_SUPER_PERMISSIONS;
        } else if (Array.isArray(user.permissions) && user.permissions.length > 0) {
          permissions = user.permissions;
        } else if (roleKey === 'chapel_content_manager') {
          permissions = ['chapel.content.manage', 'sermons.manage', 'livestream.manage'];
        } else if (roleKey === 'content_manager') {
          permissions = ['publications.manage', 'sermons.manage', 'events.manage', 'ministries.manage', 'about.manage', 'quicklinks.manage', 'site.manage', 'history.view'];
        } else if (roleKey === 'communications_editor') {
          permissions = ['publications.manage', 'sermons.manage', 'events.manage', 'quicklinks.manage'];
        } else if (roleKey === 'ministry_editor') {
          permissions = ['ministries.manage', 'about.manage'];
        } else if (roleKey === 'giving_editor') {
          permissions = ['giving.manage'];
        } else if (roleKey === 'site_editor') {
          permissions = ['site.manage'];
        } else {
          permissions = ['publications.manage', 'sermons.manage', 'events.manage', 'ministries.manage', 'about.manage', 'quicklinks.manage', 'site.manage'];
        }

        return {
          user_id: user.id,
          email: user.email,
          role: roleKey,
          role_key: roleKey,
          role_label: roleLabel,
          permissions,
          scope_type: scopeType,
          chapel_scopes: chapelScopes,
          chapelId: user.chapel_id || null,
          isSuperAdmin
        };
      } catch (e) {
        return null;
      }
    }

    async listRoles(session) {
      const endpoint = `${this.url}/api/collections/${this.rolesCollection}/records`;
      try {
        const resp = await fetch(endpoint, {
          headers: { 'Authorization': session.accessToken }
        });
        if (resp.ok) {
          const payload = await resp.json();
          if (Array.isArray(payload.items) && payload.items.length > 0) {
            return payload.items.map(r => ({
              role_key: r.role_key || r.key || r.id,
              label: r.label || r.name || r.role_key,
              description: r.description || '',
              permissions: Array.isArray(r.permissions) ? r.permissions : []
            }));
          }
        }
      } catch (e) { }

      // Default role definitions matching standard CMS roles
      return [
        { role_key: 'super_admin', label: 'Super Administrator', permissions: ['*'], description: 'Full access to all CMS functions and system settings' },
        { role_key: 'content_manager', label: 'Content Manager', permissions: ['publications.manage', 'sermons.manage', 'events.manage', 'ministries.manage', 'about.manage', 'quicklinks.manage', 'site.manage', 'history.view'], description: 'Can manage all public content sections' },
        { role_key: 'communications_editor', label: 'Communications Editor', permissions: ['publications.manage', 'sermons.manage', 'events.manage', 'quicklinks.manage'], description: 'Can publish announcements, events, and sermons' },
        { role_key: 'chapel_content_manager', label: 'Chapel Content Manager', permissions: ['chapel.content.manage', 'sermons.manage', 'livestream.manage'], description: 'Manages sermons and livestream for assigned chapels' },
        { role_key: 'site_editor', label: 'Site Editor', permissions: ['site.manage'], description: 'Can update site-wide settings' }
      ];
    }

    async listAdmins(session) {
      const endpoint = `${this.url}/api/collections/${this.usersCollection}/records?filter=(role!='member')`;
      const resp = await fetch(endpoint, {
        headers: { 'Authorization': session.accessToken }
      });
      if (!resp.ok) throw new Error(`Failed to list admins (${resp.status})`);
      const payload = await resp.json();
      return (payload.items || []).map(u => {
        const rawRole = (u.role || (u.is_admin ? 'super_admin' : 'editor')).toLowerCase();
        const isSuper = ['super_admin', 'superadmin', 'admin'].includes(rawRole) || u.is_admin === true;
        let chapelScopes = [];
        if (Array.isArray(u.chapel_scopes)) {
          chapelScopes = u.chapel_scopes;
        } else if (typeof u.chapel_scopes === 'string' && u.chapel_scopes.trim()) {
          try {
            const parsed = JSON.parse(u.chapel_scopes);
            if (Array.isArray(parsed)) chapelScopes = parsed;
          } catch (e) {
            chapelScopes = u.chapel_scopes.split(',').map(s => s.trim()).filter(Boolean);
          }
        } else if (u.chapel_id) {
          chapelScopes = [u.chapel_id];
        }

        return {
          user_id: u.id,
          email: u.email,
          role: u.role || (isSuper ? 'super_admin' : 'editor'),
          role_key: u.role || (isSuper ? 'super_admin' : 'editor'),
          scope_type: isSuper ? 'global' : (chapelScopes.length > 0 ? 'chapel' : 'global'),
          chapel_scopes: chapelScopes,
          chapel_id: u.chapel_id || null,
          created_at: u.created
        };
      });
    }

    async assignAdminRole(session, params) {
      // Find user by email
      const findEndpoint = `${this.url}/api/collections/${this.usersCollection}/records?filter=(email='${encodeURIComponent(params.targetEmail)}')`;
      const findResp = await fetch(findEndpoint, {
        headers: { 'Authorization': session.accessToken }
      });
      if (!findResp.ok) throw new Error('Could not find user record.');
      const findPayload = await findResp.json();
      const user = findPayload.items?.[0];
      if (!user) throw new Error(`User with email '${params.targetEmail}' was not found in PocketBase.`);

      return this.setAdminRole(session, {
        targetUserId: user.id,
        roleKey: params.roleKey,
        chapelId: params.chapelId,
        chapelScopes: params.chapelScopes
      });
    }

    async setAdminRole(session, params) {
      const endpoint = `${this.url}/api/collections/${this.usersCollection}/records/${params.targetUserId}`;
      const body = {};
      if (params.roleKey) body.role = params.roleKey;
      if (params.chapelId) body.chapel_id = params.chapelId;
      if (params.chapelScopes) body.chapel_scopes = params.chapelScopes;

      const resp = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': session.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) throw new Error(`Failed to update admin role (${resp.status})`);
      return await resp.json();
    }

    async removeAdmin(session, targetUserId) {
      return this.setAdminRole(session, {
        targetUserId,
        roleKey: 'member',
        chapelId: null,
        chapelScopes: []
      });
    }

    /* -------------------------------------------------------------------------
     * MUTATION METHODS
     * ------------------------------------------------------------------------- */

    async upsertSection(sectionKey, sectionData, session, options = {}) {
      // 1. Check if record exists
      const findEndpoint = `${this.url}/api/collections/${this.contentCollection}/records?filter=(key='${encodeURIComponent(sectionKey)}')&perPage=1`;
      const findResp = await fetch(findEndpoint, {
        headers: { 'Authorization': session.accessToken }
      });

      const existingItems = findResp.ok ? (await findResp.json()).items : [];
      const existing = existingItems?.[0];

      if (existing) {
        // Optimistic concurrency check using updated timestamp or version if provided
        const expectedToken = options.expectedUpdatedAt || options.expectedVersion;
        if (expectedToken) {
          const currentToken = existing.updated || existing.version;
          if (currentToken && String(currentToken) !== String(expectedToken)) {
            throw new Error('content_conflict: Optimistic concurrency conflict. Content was modified by another administrator.');
          }
        }

        const updateEndpoint = `${this.url}/api/collections/${this.contentCollection}/records/${existing.id}`;

        const updatePayload = {
          data: sectionData,
          updated_by: session.user?.id || ''
        };

        // If the collection schema has a version field, increment it adaptively
        if (typeof existing.version === 'number') {
          updatePayload.version = existing.version + 1;
        }

        const updateResp = await fetch(updateEndpoint, {
          method: 'PATCH',
          headers: {
            'Authorization': session.accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatePayload)
        });

        if (!updateResp.ok) throw new Error(`PocketBase update failed (${updateResp.status})`);
        const updatedRecord = await updateResp.json();
        return {
          success: true,
          key: updatedRecord.key || sectionKey,
          data: updatedRecord.data ?? sectionData,
          version: updatedRecord.version ?? null,
          updated_at: updatedRecord.updated || new Date().toISOString()
        };
      } else {
        // Create new record
        const createEndpoint = `${this.url}/api/collections/${this.contentCollection}/records`;
        const createResp = await fetch(createEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': session.accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            key: sectionKey,
            data: sectionData,
            updated_by: session.user?.id || ''
          })
        });

        if (!createResp.ok) throw new Error(`PocketBase create failed (${createResp.status})`);
        const createdRecord = await createResp.json();
        return {
          success: true,
          key: createdRecord.key || sectionKey,
          data: createdRecord.data ?? sectionData,
          version: createdRecord.version ?? null,
          updated_at: createdRecord.created || new Date().toISOString()
        };
      }
    }

    async updateChapelContent(chapelId, payload, session) {
      const chapelData = await this.getSection('chapels');
      if (chapelData && chapelData.chapels && chapelData.chapels[chapelId]) {
        chapelData.chapels[chapelId] = { ...chapelData.chapels[chapelId], ...payload };
        return await this.upsertSection('chapels', chapelData, session);
      }
      return { success: true };
    }

    async updateChapelBroadcast(chapelId, payload, session) {
      const livestreamData = await this.getSection('livestream');
      if (livestreamData && livestreamData.channels && livestreamData.channels[chapelId]) {
        livestreamData.channels[chapelId] = { ...livestreamData.channels[chapelId], ...payload };
        return await this.upsertSection('livestream', livestreamData, session);
      }
      return { success: true };
    }

    async upsertChapelSermon(chapelId, sermon, session) {
      const sermonsData = await this.getSection('sermons');
      if (sermonsData && Array.isArray(sermonsData.items)) {
        const idx = sermonsData.items.findIndex(s => s.id === sermon.id);
        if (idx >= 0) {
          sermonsData.items[idx] = sermon;
        } else {
          sermonsData.items.unshift(sermon);
        }
        return await this.upsertSection('sermons', sermonsData, session);
      }
      return { success: true };
    }

    async deleteChapelSermon(chapelId, sermonId, session) {
      const sermonsData = await this.getSection('sermons');
      if (sermonsData && Array.isArray(sermonsData.items)) {
        sermonsData.items = sermonsData.items.filter(s => s.id !== sermonId);
        return await this.upsertSection('sermons', sermonsData, session);
      }
      return { success: true };
    }
  }

  // Register in BackendAdapter
  if (global.BackendAdapter) {
    global.BackendAdapter.register('pocketbase', PocketBaseProvider);
  }

  global.PocketBaseProvider = PocketBaseProvider;
})(typeof window !== 'undefined' ? window : globalThis);
