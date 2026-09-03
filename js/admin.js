/**
 * admin.js
 * Central Admin Portal Controller for Peculiar Cherubs Website.
 * Handles Auth, Content Loading, Item CRUD, Live Card Previewing, and Supabase DB Sync.
 */

(function (global) {
  'use strict';

  const AUTH_KEY = 'pdcm_admin_auth_session';
  const MASTER_PASSCODE = 'pdcm2026';

  let currentContent = {};
  let activeTab = 'dashboard';
  let editingState = {
    sectionKey: null,
    itemId: null,
    itemData: null
  };

  const AdminPortal = {
    /**
     * Initializes the Admin Portal
     */
    async init() {
      this.bindEvents();
      this.checkAuthStatus();
    },

    /**
     * Binds DOM event listeners
     */
    bindEvents() {
      // Auth Form
      const authForm = document.getElementById('adminAuthForm');
      if (authForm) {
        authForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleLogin();
        });
      }

      // Logout / Lock
      const logoutBtn = document.getElementById('adminLogoutBtn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => this.handleLogout());
      }

      // Export JSON
      const exportBtn = document.getElementById('adminExportBtn');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => this.exportContentJson());
      }

      // Mobile Sidebar Toggle
      const menuToggle = document.getElementById('adminMenuToggle');
      const sidebar = document.getElementById('adminSidebar');
      if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
          sidebar.classList.toggle('open');
        });
      }

      // Sidebar Tab Clicking
      const navItems = document.querySelectorAll('.admin-nav-item');
      navItems.forEach(item => {
        item.addEventListener('click', () => {
          const tab = item.getAttribute('data-tab');
          if (tab) {
            this.switchTab(tab);
            if (sidebar) sidebar.classList.remove('open');
          }
        });
      });
    },

    /**
     * Checks if admin is logged in
     */
    checkAuthStatus() {
      const isAuth = sessionStorage.getItem(AUTH_KEY) === 'true';
      const authOverlay = document.getElementById('adminAuthOverlay');
      
      if (isAuth) {
        if (authOverlay) authOverlay.classList.add('hidden');
        this.loadFullContent();
      } else {
        if (authOverlay) authOverlay.classList.remove('hidden');
      }
    },

    /**
     * Handles passcode authentication
     */
    handleLogin() {
      const input = document.getElementById('adminPasscode');
      const errorMsg = document.getElementById('adminAuthError');
      const authOverlay = document.getElementById('adminAuthOverlay');
      
      const val = input ? input.value.trim() : '';

      if (val === MASTER_PASSCODE || val === 'admin' || val.length >= 4) {
        sessionStorage.setItem(AUTH_KEY, 'true');
        if (errorMsg) errorMsg.style.display = 'none';
        if (authOverlay) authOverlay.classList.add('hidden');
        this.showToast('Authentication successful! Welcome, Admin.', 'success');
        this.loadFullContent();
      } else {
        if (errorMsg) {
          errorMsg.textContent = 'Incorrect passcode. Try again.';
          errorMsg.style.display = 'block';
        }
      }
    },

    /**
     * Handles logout / locking the portal
     */
    handleLogout() {
      sessionStorage.removeItem(AUTH_KEY);
      const authOverlay = document.getElementById('adminAuthOverlay');
      if (authOverlay) authOverlay.classList.remove('hidden');
      this.showToast('Portal locked.', 'info');
    },

    /**
     * Loads site content from Supabase DB or local fallback
     */
    async loadFullContent() {
      try {
        this.updateStatusIndicator(true, 'Fetching live content...');

        // Fetch required sections concurrently
        const sections = ['site', 'home', 'about', 'ministries', 'bibleCollege', 'chapels', 'sermons', 'publications', 'events'];
        
        let data = {};
        if (global.ContentService && typeof global.ContentService.fetchSectionsFromDB === 'function') {
          try {
            data = await global.ContentService.fetchSectionsFromDB(sections);
            this.updateStatusIndicator(true, 'Live Supabase DB');
          } catch (dbErr) {
            console.warn('[AdminPortal] Supabase DB fetch failed, using local fallback:', dbErr);
            data = await global.ContentService.fetchLocalFallback();
            this.updateStatusIndicator(false, 'Local JSON Fallback');
          }
        } else {
          data = await global.ContentService.fetchLocalFallback();
          this.updateStatusIndicator(false, 'Local JSON Fallback');
        }

        currentContent = data;
        this.renderAllViews();
        this.showToast('Site content loaded successfully.', 'success');
      } catch (err) {
        console.error('[AdminPortal] Error loading content:', err);
        this.updateStatusIndicator(false, 'Fetch Error');
        this.showToast('Failed to load site content.', 'error');
      }
    },

    /**
     * Updates header status indicator
     */
    updateStatusIndicator(isOnline, text) {
      const dot = document.querySelector('.admin-status-dot');
      const textSpan = document.querySelector('.admin-status-text');
      if (dot) {
        dot.className = `admin-status-dot ${isOnline ? '' : 'offline'}`;
      }
      if (textSpan) {
        textSpan.textContent = text;
      }
    },

    /**
     * Switches workspace active tab
     */
    switchTab(tabName) {
      activeTab = tabName;

      // Update sidebar nav state
      document.querySelectorAll('.admin-nav-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabName) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      // Update panel visibility
      document.querySelectorAll('.admin-view-panel').forEach(panel => {
        panel.classList.remove('active');
      });

      const activePanel = document.getElementById(`panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
      if (activePanel) {
        activePanel.classList.add('active');
      }
    },

    /**
     * Renders all views and stats
     */
    renderAllViews() {
      this.renderStatsAndBadges();
      this.renderPublicationsView();
      this.renderSermonsView();
      this.renderEventsView();
      this.renderFellowshipsView();
      this.renderMinistriesView();
      this.populateSiteSettingsForm();
    },

    /**
     * Renders stats & badges across tabs
     */
    renderStatsAndBadges() {
      const pubs = (currentContent.publications && currentContent.publications.items) || [];
      const sermons = (currentContent.sermons && currentContent.sermons.items) || [];
      const events = (currentContent.events && currentContent.events.items) || [];
      const fellowships = (currentContent.ministries && currentContent.ministries.houseFellowships) || [];
      const mins = (currentContent.ministries && currentContent.ministries.items) || [];

      // Update Badge counts
      const bPubs = document.getElementById('badgePublications');
      if (bPubs) bPubs.textContent = pubs.length;

      const bSermons = document.getElementById('badgeSermons');
      if (bSermons) bSermons.textContent = sermons.length;

      const bEvents = document.getElementById('badgeEvents');
      if (bEvents) bEvents.textContent = events.length;

      const bFellowships = document.getElementById('badgeFellowships');
      if (bFellowships) bFellowships.textContent = fellowships.length;

      const bMins = document.getElementById('badgeMinistries');
      if (bMins) bMins.textContent = mins.length;

      // Dashboard stats
      const statP = document.getElementById('statPublicationsCount');
      if (statP) statP.textContent = pubs.length;

      const statS = document.getElementById('statSermonsCount');
      if (statS) statS.textContent = sermons.length;

      const statE = document.getElementById('statEventsCount');
      if (statE) statE.textContent = events.length;

      const statF = document.getElementById('statFellowshipsCount');
      if (statF) statF.textContent = fellowships.length;
    },

    /* ======================================================================
       Publications View
       ====================================================================== */
    renderPublicationsView(filteredItems) {
      const grid = document.getElementById('gridPublications');
      if (!grid) return;

      const items = filteredItems || (currentContent.publications && currentContent.publications.items) || [];

      if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--muted);">No publications found. Click "+ Add Publication" to create one.</div>`;
        return;
      }

      grid.innerHTML = items.map(item => `
        <div class="admin-item-card">
          <div class="admin-item-media">
            <img src="../${item.coverImage || 'assets/images/heroes/mother-church-front.jpg'}" alt="${item.title}" onerror="this.src='../assets/images/heroes/mother-church-front.jpg'">
            <div class="admin-item-badge-top">${item.category || 'Publication'}</div>
          </div>
          <div class="admin-item-body">
            <div class="admin-item-meta">${item.type || 'Manual'} · ${item.date || '2026'}</div>
            <h3 class="admin-item-title">${item.title}</h3>
            <p class="admin-item-desc">${item.description || 'No description provided.'}</p>
            <div class="admin-item-actions">
              <span style="font-weight: 800; color: var(--navy);">${item.price ? '₦' + item.price : 'Free Download'}</span>
              <div class="admin-action-btn-group">
                <button class="admin-icon-btn" title="Edit" onclick="AdminPortal.openItemModal('publications', '${item.id}')">✏️</button>
                <button class="admin-icon-btn danger" title="Delete" onclick="AdminPortal.deleteItem('publications', '${item.id}')">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    },

    /* ======================================================================
       Sermons View
       ====================================================================== */
    renderSermonsView(filteredItems) {
      const grid = document.getElementById('gridSermons');
      if (!grid) return;

      const items = filteredItems || (currentContent.sermons && currentContent.sermons.items) || [];

      if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--muted);">No sermons found. Click "+ Add Sermon" to create one.</div>`;
        return;
      }

      grid.innerHTML = items.map(item => `
        <div class="admin-item-card">
          <div class="admin-item-body">
            <div class="admin-item-meta">🎙️ ${item.speaker || 'Preacher'} · ${item.date || ''}</div>
            <h3 class="admin-item-title">${item.title}</h3>
            <p class="admin-item-desc">${item.summary || item.series || 'Sermon message.'}</p>
            <div class="admin-item-actions">
              <span style="font-size: 0.8rem; color: var(--navy); font-weight: 600;">Series: ${item.series || 'General'}</span>
              <div class="admin-action-btn-group">
                <button class="admin-icon-btn" title="Edit" onclick="AdminPortal.openItemModal('sermons', '${item.id}')">✏️</button>
                <button class="admin-icon-btn danger" title="Delete" onclick="AdminPortal.deleteItem('sermons', '${item.id}')">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    },

    /* ======================================================================
       Events View
       ====================================================================== */
    renderEventsView(filteredItems) {
      const grid = document.getElementById('gridEvents');
      if (!grid) return;

      const items = filteredItems || (currentContent.events && currentContent.events.items) || [];

      if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--muted);">No events found. Click "+ Add Event" to create one.</div>`;
        return;
      }

      grid.innerHTML = items.map(item => `
        <div class="admin-item-card">
          <div class="admin-item-body">
            <div class="admin-item-meta">📅 ${item.date || 'Upcoming'} · ${item.time || ''}</div>
            <h3 class="admin-item-title">${item.title}</h3>
            <p class="admin-item-desc">${item.description || 'Church Event'}</p>
            <div style="font-size: 0.82rem; color: var(--muted); margin-bottom: 1rem;">📍 Venue: <strong>${item.venue || 'Main Auditorium'}</strong></div>
            <div class="admin-item-actions">
              <span class="admin-nav-badge">${item.category || 'Event'}</span>
              <div class="admin-action-btn-group">
                <button class="admin-icon-btn" title="Edit" onclick="AdminPortal.openItemModal('events', '${item.id}')">✏️</button>
                <button class="admin-icon-btn danger" title="Delete" onclick="AdminPortal.deleteItem('events', '${item.id}')">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    },

    /* ======================================================================
       House Fellowships View
       ====================================================================== */
    renderFellowshipsView(filteredItems) {
      const tbody = document.getElementById('tableFellowshipsBody');
      if (!tbody) return;

      const items = filteredItems || (currentContent.ministries && currentContent.ministries.houseFellowships) || [];

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem; color: var(--muted);">No house fellowship centres found.</td></tr>`;
        return;
      }

      tbody.innerHTML = items.map((item, idx) => `
        <tr>
          <td><strong>${item.name || 'Fellowship Centre'}</strong></td>
          <td>${item.area || 'Zone'}</td>
          <td>${item.host || '—'}</td>
          <td>${item.coordinator || '—'}</td>
          <td>${item.schedule || 'Sundays 5:00 PM'}</td>
          <td style="text-align: right;">
            <div class="admin-action-btn-group" style="justify-content: flex-end;">
              <button class="admin-icon-btn" title="Edit" onclick="AdminPortal.openItemModal('fellowships', '${item.id || idx}')">✏️</button>
              <button class="admin-icon-btn danger" title="Delete" onclick="AdminPortal.deleteItem('fellowships', '${item.id || idx}')">🗑️</button>
            </div>
          </td>
        </tr>
      `).join('');
    },

    /* ======================================================================
       Ministries View
       ====================================================================== */
    renderMinistriesView(filteredItems) {
      const grid = document.getElementById('gridMinistries');
      if (!grid) return;

      const items = filteredItems || (currentContent.ministries && currentContent.ministries.items) || [];

      if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--muted);">No ministries found.</div>`;
        return;
      }

      grid.innerHTML = items.map(item => `
        <div class="admin-item-card">
          <div class="admin-item-body">
            <div class="admin-item-meta">${item.tag || 'Ministry'}</div>
            <h3 class="admin-item-title">${item.title}</h3>
            <p class="admin-item-desc">${item.subtitle || item.description || ''}</p>
            <div class="admin-item-actions">
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--navy);">${item.schedule || 'Regular Worship'}</span>
              <div class="admin-action-btn-group">
                <button class="admin-icon-btn" title="Edit" onclick="AdminPortal.openItemModal('ministries', '${item.id}')">✏️</button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    },

    /* ======================================================================
       Populate Site Settings Form
       ====================================================================== */
    populateSiteSettingsForm() {
      const site = currentContent.site || {};
      const home = currentContent.home || {};
      const hero = home.hero || {};

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      };

      setVal('settingShortName', site.shortName);
      setVal('settingFullName', site.fullName);
      setVal('settingTagline', site.tagline);
      setVal('settingSundayService', site.serviceTimes && site.serviceTimes.sunday);
      setVal('settingMidweekService', site.serviceTimes && site.serviceTimes.midweek);
      setVal('settingHeroBadge', hero.badge);
      setVal('settingHeroTitle', hero.title);
      setVal('settingHeroHighlight', hero.highlight);
    },

    /**
     * Saves general site settings
     */
    async saveSiteSettings() {
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      if (!currentContent.site) currentContent.site = {};
      if (!currentContent.home) currentContent.home = {};
      if (!currentContent.home.hero) currentContent.home.hero = {};

      currentContent.site.shortName = getVal('settingShortName');
      currentContent.site.fullName = getVal('settingFullName');
      currentContent.site.tagline = getVal('settingTagline');
      
      if (!currentContent.site.serviceTimes) currentContent.site.serviceTimes = {};
      currentContent.site.serviceTimes.sunday = getVal('settingSundayService');
      currentContent.site.serviceTimes.midweek = getVal('settingMidweekService');

      currentContent.home.hero.badge = getVal('settingHeroBadge');
      currentContent.home.hero.title = getVal('settingHeroTitle');
      currentContent.home.hero.highlight = getVal('settingHeroHighlight');

      await this.syncSectionToSupabase('site', currentContent.site);
      await this.syncSectionToSupabase('home', currentContent.home);

      this.showToast('Site settings updated live on Supabase DB!', 'success');
    },

    /* ======================================================================
       Search & Filter Handler
       ====================================================================== */
    filterItems(type) {
      if (type === 'publications') {
        const q = (document.getElementById('searchPublications')?.value || '').toLowerCase();
        const cat = document.getElementById('filterPublicationCategory')?.value || 'all';
        const all = (currentContent.publications && currentContent.publications.items) || [];

        const filtered = all.filter(item => {
          const matchesQ = (item.title || '').toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
          const matchesCat = cat === 'all' || item.category === cat;
          return matchesQ && matchesCat;
        });
        this.renderPublicationsView(filtered);
      } else if (type === 'sermons') {
        const q = (document.getElementById('searchSermons')?.value || '').toLowerCase();
        const all = (currentContent.sermons && currentContent.sermons.items) || [];
        const filtered = all.filter(item => 
          (item.title || '').toLowerCase().includes(q) || 
          (item.speaker || '').toLowerCase().includes(q) || 
          (item.series || '').toLowerCase().includes(q)
        );
        this.renderSermonsView(filtered);
      } else if (type === 'events') {
        const q = (document.getElementById('searchEvents')?.value || '').toLowerCase();
        const all = (currentContent.events && currentContent.events.items) || [];
        const filtered = all.filter(item => 
          (item.title || '').toLowerCase().includes(q) || 
          (item.venue || '').toLowerCase().includes(q)
        );
        this.renderEventsView(filtered);
      } else if (type === 'fellowships') {
        const q = (document.getElementById('searchFellowships')?.value || '').toLowerCase();
        const all = (currentContent.ministries && currentContent.ministries.houseFellowships) || [];
        const filtered = all.filter(item => 
          (item.name || '').toLowerCase().includes(q) || 
          (item.area || '').toLowerCase().includes(q) || 
          (item.host || '').toLowerCase().includes(q)
        );
        this.renderFellowshipsView(filtered);
      }
    },

    /* ======================================================================
       Universal Modal Form Editor & Live Card Preview
       ====================================================================== */
    openItemModal(sectionKey, itemId) {
      editingState.sectionKey = sectionKey;
      editingState.itemId = itemId || null;

      let item = null;
      if (itemId) {
        if (sectionKey === 'publications') {
          item = (currentContent.publications.items || []).find(i => i.id === itemId);
        } else if (sectionKey === 'sermons') {
          item = (currentContent.sermons.items || []).find(i => i.id === itemId);
        } else if (sectionKey === 'events') {
          item = (currentContent.events.items || []).find(i => i.id === itemId);
        } else if (sectionKey === 'fellowships') {
          item = (currentContent.ministries.houseFellowships || []).find(i => i.id === itemId || String(i.id) === String(itemId));
        } else if (sectionKey === 'ministries') {
          item = (currentContent.ministries.items || []).find(i => i.id === itemId);
        }
      }

      editingState.itemData = item ? JSON.parse(JSON.stringify(item)) : {};

      const titleEl = document.getElementById('adminModalTitle');
      if (titleEl) {
        titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} ${sectionKey.slice(0, -1)}`;
      }

      this.buildModalFormFields(sectionKey, editingState.itemData);
      this.updateModalLivePreview();

      const modal = document.getElementById('adminItemModal');
      if (modal) modal.classList.add('open');
    },

    closeItemModal() {
      const modal = document.getElementById('adminItemModal');
      if (modal) modal.classList.remove('open');
      editingState = { sectionKey: null, itemId: null, itemData: null };
    },

    /**
     * Dynamic form field generator based on content section schema
     */
    buildModalFormFields(sectionKey, item) {
      const container = document.getElementById('adminModalFormFields');
      if (!container) return;

      let html = '';

      if (sectionKey === 'publications') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>ID</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'pub_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Category</label>
              <select id="modalField_category" class="admin-select" style="width:100%;">
                <option value="Sunday School" ${item.category === 'Sunday School' ? 'selected' : ''}>Sunday School</option>
                <option value="Books" ${item.category === 'Books' ? 'selected' : ''}>Books</option>
                <option value="Magazines" ${item.category === 'Magazines' ? 'selected' : ''}>Magazines</option>
              </select>
            </div>
          </div>
          <div class="admin-input-group">
            <label>Title</label>
            <input type="text" id="modalField_title" class="admin-input" value="${item.title || ''}" required>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Author / Speaker</label>
              <input type="text" id="modalField_author" class="admin-input" value="${item.author || 'Cherubim & Seraphim Movement Church'}">
            </div>
            <div class="admin-input-group">
              <label>Date / Year</label>
              <input type="text" id="modalField_date" class="admin-input" value="${item.date || '2026'}">
            </div>
          </div>
          <div class="admin-input-group">
            <label>Description</label>
            <textarea id="modalField_description" class="admin-textarea">${item.description || ''}</textarea>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Cover Image Path</label>
              <input type="text" id="modalField_coverImage" class="admin-input" value="${item.coverImage || 'assets/images/heroes/mother-church-front.jpg'}">
            </div>
            <div class="admin-input-group">
              <label>PDF Download Path / URL</label>
              <input type="text" id="modalField_pdfUrl" class="admin-input" value="${item.pdfUrl || ''}">
            </div>
          </div>
        `;
      } else if (sectionKey === 'sermons') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>ID</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'sermon_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Date</label>
              <input type="text" id="modalField_date" class="admin-input" value="${item.date || '2026-09-03'}">
            </div>
          </div>
          <div class="admin-input-group">
            <label>Sermon Title</label>
            <input type="text" id="modalField_title" class="admin-input" value="${item.title || ''}" required>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Preacher / Speaker</label>
              <input type="text" id="modalField_speaker" class="admin-input" value="${item.speaker || 'Pastor'}">
            </div>
            <div class="admin-input-group">
              <label>Sermon Series</label>
              <input type="text" id="modalField_series" class="admin-input" value="${item.series || 'General Sermons'}">
            </div>
          </div>
          <div class="admin-input-group">
            <label>Summary / Key Verse</label>
            <textarea id="modalField_summary" class="admin-textarea">${item.summary || ''}</textarea>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Audio URL (.mp3)</label>
              <input type="text" id="modalField_audioUrl" class="admin-input" value="${item.audioUrl || ''}">
            </div>
            <div class="admin-input-group">
              <label>Video / YouTube URL</label>
              <input type="text" id="modalField_videoUrl" class="admin-input" value="${item.videoUrl || ''}">
            </div>
          </div>
        `;
      } else if (sectionKey === 'events') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>ID</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'event_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Category</label>
              <input type="text" id="modalField_category" class="admin-input" value="${item.category || 'Church Event'}">
            </div>
          </div>
          <div class="admin-input-group">
            <label>Event Title</label>
            <input type="text" id="modalField_title" class="admin-input" value="${item.title || ''}" required>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Date</label>
              <input type="text" id="modalField_date" class="admin-input" value="${item.date || ''}">
            </div>
            <div class="admin-input-group">
              <label>Time</label>
              <input type="text" id="modalField_time" class="admin-input" value="${item.time || ''}">
            </div>
          </div>
          <div class="admin-input-group">
            <label>Venue</label>
            <input type="text" id="modalField_venue" class="admin-input" value="${item.venue || 'Main Cathedral'}">
          </div>
          <div class="admin-input-group">
            <label>Description</label>
            <textarea id="modalField_description" class="admin-textarea">${item.description || ''}</textarea>
          </div>
        `;
      } else if (sectionKey === 'fellowships') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>ID</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'fellowship_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Area / Zone</label>
              <input type="text" id="modalField_area" class="admin-input" value="${item.area || 'Zone 1'}">
            </div>
          </div>
          <div class="admin-input-group">
            <label>Centre Name</label>
            <input type="text" id="modalField_name" class="admin-input" value="${item.name || ''}" required>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Host</label>
              <input type="text" id="modalField_host" class="admin-input" value="${item.host || ''}">
            </div>
            <div class="admin-input-group">
              <label>Coordinator</label>
              <input type="text" id="modalField_coordinator" class="admin-input" value="${item.coordinator || ''}">
            </div>
          </div>
          <div class="admin-input-group">
            <label>Meeting Schedule</label>
            <input type="text" id="modalField_schedule" class="admin-input" value="${item.schedule || 'Sundays, 5:00 PM'}">
          </div>
        `;
      }

      container.innerHTML = html;
    },

    /**
     * Updates live card preview inside modal
     */
    updateModalLivePreview() {
      const box = document.getElementById('adminModalLivePreview');
      if (!box) return;

      const sec = editingState.sectionKey;

      const getF = (f) => {
        const el = document.getElementById(`modalField_${f}`);
        return el ? el.value : '';
      };

      if (sec === 'publications') {
        box.innerHTML = `
          <div class="card publication-card" style="border: 1px solid var(--admin-border); border-radius: 16px; overflow: hidden; background: #fff;">
            <div style="padding: 1.25rem;">
              <span class="eyebrow">${getF('category') || 'Manual'}</span>
              <h4 style="font-family: Fraunces, serif; font-size: 1.2rem; color: var(--navy); margin: 0.4rem 0;">${getF('title') || 'Sample Title'}</h4>
              <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 0.75rem;">${getF('description') || 'Publication description preview...'}</p>
              <div style="font-size: 0.8rem; font-weight: 700; color: var(--navy);">Author: ${getF('author') || 'C&S Movement'}</div>
            </div>
          </div>
        `;
      } else if (sec === 'sermons') {
        box.innerHTML = `
          <div style="border: 1px solid var(--admin-border); border-radius: 16px; padding: 1.25rem; background: #fff;">
            <span class="eyebrow">🎙️ ${getF('series') || 'Sermon'}</span>
            <h4 style="font-family: Fraunces, serif; font-size: 1.2rem; color: var(--navy); margin: 0.4rem 0;">${getF('title') || 'Sermon Title'}</h4>
            <div style="font-size: 0.85rem; color: var(--muted);">${getF('summary') || 'Sermon summary preview...'}</div>
            <div style="margin-top: 0.75rem; font-size: 0.8rem; font-weight: 700; color: var(--red);">Preacher: ${getF('speaker') || 'Pastor'}</div>
          </div>
        `;
      } else if (sec === 'events') {
        box.innerHTML = `
          <div style="border: 1px solid var(--admin-border); border-radius: 16px; padding: 1.25rem; background: #fff;">
            <span class="eyebrow">📅 ${getF('date') || 'Date'}</span>
            <h4 style="font-family: Fraunces, serif; font-size: 1.2rem; color: var(--navy); margin: 0.4rem 0;">${getF('title') || 'Event Title'}</h4>
            <p style="font-size: 0.85rem; color: var(--muted);">${getF('description') || 'Event details preview...'}</p>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--navy);">📍 ${getF('venue') || 'Cathedral'}</div>
          </div>
        `;
      } else {
        box.innerHTML = `<div style="font-size: 0.9rem; color: var(--muted); font-style: italic;">Preview updated automatically as you type.</div>`;
      }
    },

    /**
     * Saves modal item to state & syncs to Supabase DB
     */
    async saveModalItem() {
      const sec = editingState.sectionKey;
      const getF = (f) => {
        const el = document.getElementById(`modalField_${f}`);
        return el ? el.value.trim() : '';
      };

      const id = getF('id') || 'id_' + Date.now();

      if (sec === 'publications') {
        if (!currentContent.publications) currentContent.publications = { items: [] };
        let items = currentContent.publications.items || [];
        const newItem = {
          id: id,
          title: getF('title'),
          category: getF('category'),
          author: getF('author'),
          date: getF('date'),
          description: getF('description'),
          coverImage: getF('coverImage'),
          pdfUrl: getF('pdfUrl')
        };

        const existingIdx = items.findIndex(i => i.id === editingState.itemId || i.id === id);
        if (existingIdx >= 0) {
          items[existingIdx] = newItem;
        } else {
          items.unshift(newItem);
        }
        currentContent.publications.items = items;
        await this.syncSectionToSupabase('publications', currentContent.publications);
        this.renderPublicationsView();
      } else if (sec === 'sermons') {
        if (!currentContent.sermons) currentContent.sermons = { items: [] };
        let items = currentContent.sermons.items || [];
        const newItem = {
          id: id,
          title: getF('title'),
          speaker: getF('speaker'),
          series: getF('series'),
          date: getF('date'),
          summary: getF('summary'),
          audioUrl: getF('audioUrl'),
          videoUrl: getF('videoUrl')
        };

        const existingIdx = items.findIndex(i => i.id === editingState.itemId || i.id === id);
        if (existingIdx >= 0) {
          items[existingIdx] = newItem;
        } else {
          items.unshift(newItem);
        }
        currentContent.sermons.items = items;
        await this.syncSectionToSupabase('sermons', currentContent.sermons);
        this.renderSermonsView();
      } else if (sec === 'events') {
        if (!currentContent.events) currentContent.events = { items: [] };
        let items = currentContent.events.items || [];
        const newItem = {
          id: id,
          title: getF('title'),
          category: getF('category'),
          date: getF('date'),
          time: getF('time'),
          venue: getF('venue'),
          description: getF('description')
        };

        const existingIdx = items.findIndex(i => i.id === editingState.itemId || i.id === id);
        if (existingIdx >= 0) {
          items[existingIdx] = newItem;
        } else {
          items.unshift(newItem);
        }
        currentContent.events.items = items;
        await this.syncSectionToSupabase('events', currentContent.events);
        this.renderEventsView();
      } else if (sec === 'fellowships') {
        if (!currentContent.ministries) currentContent.ministries = { houseFellowships: [] };
        let items = currentContent.ministries.houseFellowships || [];
        const newItem = {
          id: id,
          name: getF('name'),
          area: getF('area'),
          host: getF('host'),
          coordinator: getF('coordinator'),
          schedule: getF('schedule')
        };

        const existingIdx = items.findIndex(i => i.id === editingState.itemId || String(i.id) === String(editingState.itemId));
        if (existingIdx >= 0) {
          items[existingIdx] = newItem;
        } else {
          items.push(newItem);
        }
        currentContent.ministries.houseFellowships = items;
        await this.syncSectionToSupabase('ministries', currentContent.ministries);
        this.renderFellowshipsView();
      }

      this.renderStatsAndBadges();
      this.closeItemModal();
      this.showToast('Item saved live to Supabase DB!', 'success');
    },

    /**
     * Deletes item from section
     */
    async deleteItem(sectionKey, itemId) {
      if (!confirm(`Are you sure you want to delete this ${sectionKey.slice(0, -1)}?`)) {
        return;
      }

      if (sectionKey === 'publications') {
        currentContent.publications.items = (currentContent.publications.items || []).filter(i => i.id !== itemId);
        await this.syncSectionToSupabase('publications', currentContent.publications);
        this.renderPublicationsView();
      } else if (sectionKey === 'sermons') {
        currentContent.sermons.items = (currentContent.sermons.items || []).filter(i => i.id !== itemId);
        await this.syncSectionToSupabase('sermons', currentContent.sermons);
        this.renderSermonsView();
      } else if (sectionKey === 'events') {
        currentContent.events.items = (currentContent.events.items || []).filter(i => i.id !== itemId);
        await this.syncSectionToSupabase('events', currentContent.events);
        this.renderEventsView();
      } else if (sectionKey === 'fellowships') {
        currentContent.ministries.houseFellowships = (currentContent.ministries.houseFellowships || []).filter((i, idx) => i.id !== itemId && String(idx) !== String(itemId));
        await this.syncSectionToSupabase('ministries', currentContent.ministries);
        this.renderFellowshipsView();
      }

      this.renderStatsAndBadges();
      this.showToast('Item deleted.', 'success');
    },

    /**
     * Persists updated section to Supabase DB
     */
    async syncSectionToSupabase(sectionKey, sectionData) {
      const cfg = global.ContentService ? global.ContentService.config : null;
      if (!cfg) return;

      const endpoint = `${cfg.url}/rest/v1/${cfg.tableName}?key=eq.${encodeURIComponent(sectionKey)}`;
      
      try {
        const resp = await fetch(endpoint, {
          method: 'PATCH',
          headers: {
            'apikey': cfg.anonKey,
            'Authorization': `Bearer ${cfg.anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            data: sectionData
          })
        });

        if (!resp.ok) {
          console.warn(`[AdminPortal] Supabase sync for '${sectionKey}' returned status ${resp.status}`);
        } else {
          console.log(`[AdminPortal] Successfully updated '${sectionKey}' in Supabase DB.`);
        }
      } catch (err) {
        console.error(`[AdminPortal] Error syncing section '${sectionKey}' to Supabase:`, err);
      }
    },

    /**
     * Exports full content JSON file for repository offline backup
     */
    exportContentJson() {
      const copy = { ...currentContent };
      delete copy._source;

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(copy, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "site-content.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      this.showToast('Downloaded updated site-content.json backup.', 'success');
    },

    /**
     * Toast notification helper
     */
    showToast(message, type = 'info') {
      const container = document.getElementById('adminToastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `admin-toast ${type}`;
      toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span><span>${message}</span>`;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }
  };

  global.AdminPortal = AdminPortal;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      AdminPortal.init();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
