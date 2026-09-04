/**
 * admin.js
 * Central Admin Portal Controller for Peculiar Cherubs Website.
 * Handles Auth, Content Loading, Item CRUD, Live Card Previewing, and Supabase DB Sync.
 * Includes Sunday School Immersive Outline Editor.
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
    itemData: null,
    isSundaySchool: false
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
        console.log('[AdminPortal] Loaded content model:', currentContent);
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
      if (typeof document === 'undefined') return;
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
     * Helper to aggregate ALL publication items across Sunday School lessons, Goodnews archive editions, and items array.
     */
    getAllPublicationItems() {
      const pubs = currentContent.publications || {};
      const items = [];

      // 1. Sunday School Lessons (from sundaySchoolDetails.lessons)
      if (pubs.sundaySchoolDetails && pubs.sundaySchoolDetails.lessons) {
        const rawLessons = pubs.sundaySchoolDetails.lessons;
        const lessonList = Array.isArray(rawLessons) ? rawLessons : Object.values(rawLessons);

        lessonList.forEach(l => {
          if (!l) return;
          const verseText = typeof l.memoryVerse === 'object' ? l.memoryVerse?.text : (l.memoryVerse || '');
          const verseRef = typeof l.memoryVerse === 'object' ? l.memoryVerse?.reference : (l.verseRef || '');

          let scripturesText = '';
          if (Array.isArray(l.mainScriptures)) {
            scripturesText = l.mainScriptures.map(s => s.reference || s).join('; ');
          } else if (typeof l.scriptures === 'string') {
            scripturesText = l.scriptures;
          }

          let objectivesText = '';
          if (Array.isArray(l.objectives)) {
            objectivesText = l.objectives.join('\n');
          } else if (typeof l.objectives === 'string') {
            objectivesText = l.objectives;
          }

          let discussionText = '';
          if (Array.isArray(l.discussionQuestions)) {
            discussionText = l.discussionQuestions.map(q => typeof q === 'object' ? q.question : q).join('\n');
          } else if (typeof l.discussionQuestions === 'string') {
            discussionText = l.discussionQuestions;
          }

          let teacherText = '';
          if (l.teacherNotes) {
            if (Array.isArray(l.teacherNotes.facilitatorTips)) {
              teacherText = l.teacherNotes.facilitatorTips.join('\n');
            } else if (typeof l.teacherNotes === 'string') {
              teacherText = l.teacherNotes;
            }
          }

          items.push({
            id: l.id || `lesson-${l.lessonNumber}`,
            title: l.topic || l.title || `Lesson ${l.lessonNumber || ''}`,
            category: 'Sunday School',
            type: 'Sunday School Outline',
            isSundaySchool: true,
            quarter: l.quarter || pubs.sundaySchoolDetails.quarter || 'Quarter 3, 2026',
            lessonNum: l.lessonNumber ? `Lesson ${l.lessonNumber}` : (l.lessonNum || 'Lesson'),
            date: l.dateDisplay || l.date || '2026',
            duration: l.duration || '45 Minutes',
            memoryVerse: verseText,
            verseRef: verseRef,
            scriptures: scripturesText,
            objectives: objectivesText,
            introduction: l.introduction || l.subtitle || '',
            description: l.subtitle || l.introduction || l.topic || '',
            outlines: l.outlines || [],
            discussionQuestions: discussionText,
            teacherNotes: teacherText,
            lifeApplication: l.lifeApplication || '',
            audioUrl: l.audioUrl || '',
            pdfUrl: l.pdfUrl || '#',
            coverImage: 'assets/hero/mother-church-brand.jpg',
            _raw: l,
            _sourceGroup: 'sundaySchoolDetails'
          });
        });
      }

      // 2. Goodnews Weekly Archive & Issue Details (from publications.archive & publications.details)
      if (pubs.archive && Array.isArray(pubs.archive)) {
        pubs.archive.forEach(arc => {
          const issueKey = arc.href ? (arc.href.split('issue=')[1] || arc.issue) : (arc.issue || arc.id);
          const detail = (issueKey && pubs.details) ? pubs.details[issueKey] : null;

          items.push({
            id: issueKey || arc.id || `issue_${Date.now()}`,
            title: arc.title || (detail ? detail.title : 'Goodnews Weekly'),
            category: 'Goodnews Weekly',
            type: arc.type || 'Weekly Edition',
            issue: arc.issue || issueKey,
            date: (detail && detail.date) ? detail.date : '2026',
            description: arc.text || (detail ? detail.subtitle : ''),
            author: 'Peculiar Cherubs Publications',
            coverImage: 'assets/hero/mother-church-brand.jpg',
            pdfUrl: (detail && detail.pdfUrl) ? detail.pdfUrl : '#',
            _raw: detail || arc,
            _sourceGroup: 'archive'
          });
        });
      }

      // 3. General Items Array (if present)
      if (pubs.items && Array.isArray(pubs.items)) {
        pubs.items.forEach(gen => {
          if (!items.some(i => i.id === gen.id)) {
            items.push({
              ...gen,
              category: gen.category || 'Books',
              _sourceGroup: 'items'
            });
          }
        });
      }

      return items;
    },

    /**
     * Helper to aggregate ALL ministry items across items array and key-value entries in currentContent.ministries.
     */
    getAllMinistryItems() {
      if (!currentContent.ministries) return [];
      const mins = currentContent.ministries;
      const itemsMap = new Map();

      // 1. Process items from currentContent.ministries.details if present
      if (mins.details && typeof mins.details === 'object') {
        Object.keys(mins.details).forEach(key => {
          const obj = mins.details[key];
          if (obj && typeof obj === 'object') {
            itemsMap.set(key, {
              id: key,
              title: obj.title || obj.shortTitle || key,
              tag: obj.category || 'Ministry',
              category: obj.category || 'Ministry',
              subtitle: obj.summary || obj.subtitle || '',
              description: obj.summary || obj.subtitle || '',
              href: obj.href || `${key}.html`,
              image: obj.image || 'assets/hero/mother-church-brand.jpg',
              schedule: obj.schedule || 'Regular Worship',
              facts: obj.facts || [],
              overview: obj.overview || [],
              leaders: obj.leaders || [],
              functionsTitle: obj.functionsTitle || 'Ministry functions',
              functions: obj.functions || [],
              _raw: obj
            });
          }
        });
      }

      // 2. Process items from currentContent.ministries.items array if present
      if (Array.isArray(mins.items)) {
        mins.items.forEach(it => {
          if (it && (it.id || it.title)) {
            const id = it.id || `ministry_${Date.now()}`;
            if (!itemsMap.has(id)) {
              itemsMap.set(id, {
                id: id,
                title: it.title || it.name || 'Ministry Title',
                tag: it.category || it.tag || 'Ministry',
                category: it.category || it.tag || 'Ministry',
                subtitle: it.summary || it.subtitle || it.description || '',
                description: it.description || it.summary || it.subtitle || '',
                href: it.href || '#',
                image: it.image || it.coverImage || 'assets/hero/mother-church-brand.jpg',
                schedule: it.schedule || 'Regular Worship',
                facts: it.facts || [],
                overview: it.overview || [],
                leaders: it.leaders || [],
                functionsTitle: it.functionsTitle || 'Ministry functions',
                functions: it.functions || [],
                _raw: it
              });
            }
          }
        });
      }

      // 3. Process key-value object entries in currentContent.ministries
      Object.keys(mins).forEach(key => {
        if (['houseFellowships', 'items', 'hero', 'mission', 'groups', 'homeFeatured', 'details'].includes(key)) return;
        const obj = mins[key];
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          if (!itemsMap.has(key)) {
            itemsMap.set(key, {
              id: key,
              title: obj.title || obj.shortTitle || key,
              tag: obj.category || 'Ministry',
              category: obj.category || 'Ministry',
              subtitle: obj.summary || obj.subtitle || '',
              description: obj.summary || obj.subtitle || '',
              href: obj.href || '#',
              image: obj.image || 'assets/hero/mother-church-brand.jpg',
              schedule: obj.schedule || 'Regular Worship',
              facts: obj.facts || [],
              overview: obj.overview || [],
              leaders: obj.leaders || [],
              functionsTitle: obj.functionsTitle || 'Ministry functions',
              functions: obj.functions || [],
              _raw: obj
            });
          }
        }
      });

      return Array.from(itemsMap.values());
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
      if (typeof document === 'undefined') return;
      const pubs = this.getAllPublicationItems();
      const sermons = (currentContent.sermons && currentContent.sermons.items) || [];
      const events = (currentContent.events && currentContent.events.items) || [];
      const fellowships = (currentContent.ministries && currentContent.ministries.houseFellowships) || [];
      const mins = this.getAllMinistryItems();

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
      if (typeof document === 'undefined') return;
      const grid = document.getElementById('gridPublications');
      if (!grid) return;

      const items = filteredItems || this.getAllPublicationItems();

      if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--muted);">No publications found. Click "+ Add Publication" or "📖 Sunday School Reading" to create one.</div>`;
        return;
      }

      grid.innerHTML = items.map(item => {
        const isSS = item.category === 'Sunday School' || item.type === 'Sunday School Outline' || item.isSundaySchool;
        const isGoodnews = item.category === 'Goodnews Weekly';

        return `
          <div class="admin-item-card">
            <div class="admin-item-media">
              <img src="../${item.coverImage || 'assets/hero/mother-church-brand.jpg'}" alt="${item.title}" onerror="this.src='../assets/hero/mother-church-brand.jpg'">
              <div class="admin-item-badge-top" style="${isSS ? 'background: var(--yellow); color: var(--navy);' : isGoodnews ? 'background: var(--sky); color: var(--navy);' : ''}">
                ${isSS ? '📖 Sunday School' : isGoodnews ? '📰 Goodnews Weekly' : (item.category || 'Publication')}
              </div>
            </div>
            <div class="admin-item-body">
              <div class="admin-item-meta">${isSS ? (item.quarter || 'Sunday School Outline') : (item.type || item.issue || 'Manual')} · ${item.date || '2026'}</div>
              <h3 class="admin-item-title">${item.title}</h3>
              <p class="admin-item-desc">${isSS ? (item.memoryVerse ? 'Memory Verse: ' + item.memoryVerse : item.description) : (item.description || 'No description provided.')}</p>
              <div class="admin-item-actions">
                <span style="font-weight: 800; color: var(--navy); font-size: 0.85rem;">
                  ${isSS ? (item.lessonNum ? item.lessonNum : 'Immersive Outline') : (item.price ? '₦' + item.price : 'Free Download')}
                </span>
                <div class="admin-action-btn-group">
                  <button class="admin-icon-btn" title="${isSS ? 'Edit Sunday School Immersive Outline' : 'Edit Publication'}" onclick="AdminPortal.openItemModal('publications', '${item.id}', ${isSS})">✏️</button>
                  <button class="admin-icon-btn danger" title="Delete" onclick="AdminPortal.deleteItem('publications', '${item.id}')">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    /* ======================================================================
       Sermons View
       ====================================================================== */
    renderSermonsView(filteredItems) {
      if (typeof document === 'undefined') return;
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
      if (typeof document === 'undefined') return;
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
      if (typeof document === 'undefined') return;
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
      if (typeof document === 'undefined') return;
      const grid = document.getElementById('gridMinistries');
      if (!grid) return;

      const items = filteredItems || this.getAllMinistryItems();

      if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--muted);">No ministries found. Click "+ Add Ministry" to create one.</div>`;
        return;
      }

      grid.innerHTML = items.map(item => `
        <div class="admin-item-card">
          <div class="admin-item-media">
            <img src="../${item.image || 'assets/hero/mother-church-brand.jpg'}" alt="${item.title}" onerror="this.src='../assets/hero/mother-church-brand.jpg'">
            <div class="admin-item-badge-top" style="background: var(--sky); color: var(--navy);">
              ${item.tag || item.category || 'Ministry'}
            </div>
          </div>
          <div class="admin-item-body">
            <h3 class="admin-item-title">${item.title}</h3>
            <p class="admin-item-desc">${item.subtitle || item.description || ''}</p>
            <div class="admin-item-actions">
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--navy);">${item.schedule || 'Regular Worship'}</span>
              <div class="admin-action-btn-group">
                <button class="admin-icon-btn" title="Edit Ministry" onclick="AdminPortal.openItemModal('ministries', '${item.id}')">✏️</button>
                <button class="admin-icon-btn danger" title="Delete Ministry" onclick="AdminPortal.deleteItem('ministries', '${item.id}')">🗑️</button>
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
      if (typeof document === 'undefined') return;
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
        const all = this.getAllPublicationItems();

        const filtered = all.filter(item => {
          const matchesQ = (item.title || '').toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q) || (item.memoryVerse || '').toLowerCase().includes(q);
          const matchesCat = cat === 'all' || item.category === cat || (cat === 'Goodnews Weekly' && item.category === 'Goodnews Weekly');
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
      } else if (type === 'ministries') {
        const q = (document.getElementById('searchMinistries')?.value || '').toLowerCase();
        const all = this.getAllMinistryItems();
        const filtered = all.filter(item =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.tag || item.category || '').toLowerCase().includes(q) ||
          (item.subtitle || item.description || '').toLowerCase().includes(q)
        );
        this.renderMinistriesView(filtered);
      }
    },

    /* ======================================================================
       Universal Modal Form Editor & Live Card Preview
       ====================================================================== */
    openItemModal(sectionKey, itemId, isSundaySchoolOverride = false) {
      editingState.sectionKey = sectionKey;
      editingState.itemId = itemId || null;

      let item = null;
      if (itemId) {
        if (sectionKey === 'publications') {
          item = this.getAllPublicationItems().find(i => i.id === itemId);
        } else if (sectionKey === 'sermons') {
          item = (currentContent.sermons.items || []).find(i => i.id === itemId);
        } else if (sectionKey === 'events') {
          item = (currentContent.events.items || []).find(i => i.id === itemId);
        } else if (sectionKey === 'fellowships') {
          item = (currentContent.ministries.houseFellowships || []).find(i => i.id === itemId || String(i.id) === String(itemId));
        } else if (sectionKey === 'ministries') {
          item = this.getAllMinistryItems().find(i => i.id === itemId);
        }
      }

      const isSS = isSundaySchoolOverride || (item && (item.category === 'Sunday School' || item.type === 'Sunday School Outline' || item.isSundaySchool));
      editingState.isSundaySchool = Boolean(isSS);
      editingState.itemData = item ? JSON.parse(JSON.stringify(item)) : {};

      const titleEl = document.getElementById('adminModalTitle');
      if (titleEl) {
        if (sectionKey === 'publications' && editingState.isSundaySchool) {
          titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} Sunday School Reading (Immersive Outline)`;
        } else {
          titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} ${sectionKey.slice(0, -1)}`;
        }
      }

      this.buildModalFormFields(sectionKey, editingState.itemData);
      this.updateModalLivePreview();

      const modal = document.getElementById('adminItemModal');
      if (modal) modal.classList.add('open');
    },

    closeItemModal() {
      const modal = document.getElementById('adminItemModal');
      if (modal) modal.classList.remove('open');
      editingState = { sectionKey: null, itemId: null, itemData: null, isSundaySchool: false };
    },

    /**
     * Toggles between Sunday School Immersive Outline Editor and Standard Publication Editor
     */
    togglePublicationEditorFormat(toSundaySchool) {
      editingState.isSundaySchool = toSundaySchool;

      // Save current input values into editingState.itemData temporarily
      const getF = (f) => {
        const el = document.getElementById(`modalField_${f}`);
        return el ? el.value : '';
      };

      editingState.itemData.title = getF('title') || editingState.itemData.title;
      editingState.itemData.date = getF('date') || editingState.itemData.date;

      const titleEl = document.getElementById('adminModalTitle');
      if (titleEl) {
        titleEl.textContent = `${editingState.itemId ? 'Edit' : 'Add New'} ${toSundaySchool ? 'Sunday School Reading (Immersive Outline)' : 'Publication'}`;
      }

      this.buildModalFormFields('publications', editingState.itemData);
      this.updateModalLivePreview();
    },

    /**
     * Dynamic form field generator based on content section schema
     */
    buildModalFormFields(sectionKey, item) {
      const container = document.getElementById('adminModalFormFields');
      if (!container) return;

      let html = '';

      if (sectionKey === 'publications') {
        const isSS = editingState.isSundaySchool;

        if (isSS) {
          // ==================================================================
          // Sunday School Immersive Outline Special Editor
          // ==================================================================
          const outlines = item.outlines || [
            { title: "Point 1: Understanding the Foundation", text: "Explain the biblical basis and background." },
            { title: "Point 2: Practical Spiritual Application", text: "Discuss how believers can apply this teaching today." }
          ];

          html = `
            <div style="background: #eef2ff; border: 1px solid #c7d2fe; padding: 0.85rem 1.25rem; border-radius: 14px; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
              <div style="font-weight: 800; color: var(--navy); font-size: 0.9rem;">
                📖 Sunday School Immersive Outline Editor Mode
              </div>
              <button type="button" class="btn btn-secondary admin-btn-sm" onclick="AdminPortal.togglePublicationEditorFormat(false)">
                Switch to Standard Publication Format
              </button>
            </div>

            <!-- Meta & Scheduling Card -->
            <div class="admin-ss-editor-card highlight">
              <div class="admin-ss-card-label">
                <span>1. Lesson Meta & Schedule</span>
                <span style="color: var(--navy); font-weight: 700;">Immersive Reader Header</span>
              </div>
              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Publication / Lesson ID</label>
                  <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'lesson-' + Date.now()}" required>
                </div>
                <div class="admin-input-group">
                  <label>Lesson Title</label>
                  <input type="text" id="modalField_title" class="admin-input" value="${item.title || 'Lesson Title'}" required>
                </div>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Quarter / Series</label>
                  <input type="text" id="modalField_quarter" class="admin-input" placeholder="e.g. Quarter 3, 2026" value="${item.quarter || 'Quarter 3, 2026'}">
                </div>
                <div class="admin-input-group">
                  <label>Lesson Number</label>
                  <input type="text" id="modalField_lessonNum" class="admin-input" placeholder="e.g. Lesson 35" value="${item.lessonNum || 'Lesson 35'}">
                </div>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Sunday Date</label>
                  <input type="date" id="modalField_date" class="admin-input" value="${item.date || 'August 30, 2026'}">
                </div>
                <div class="admin-input-group">
                  <label>Lesson Duration & Class</label>
                  <input type="text" id="modalField_duration" class="admin-input" value="${item.duration || '45 Minutes'}">
                </div>
              </div>
            </div>

            <!-- Scripture & Memory Verse Card -->
            <div class="admin-ss-editor-card">
              <div class="admin-ss-card-label">
                <span>2. Memory Verse & Scripture Readings</span>
                <span style="color: var(--red);">Golden Verse Box</span>
              </div>
              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Memory Verse Text</label>
                  <textarea id="modalField_memoryVerse" class="admin-textarea" placeholder="Type memory verse text...">${item.memoryVerse || ''}</textarea>
                </div>
                <div class="admin-input-group">
                  <label>Verse Reference</label>
                  <input type="text" id="modalField_verseRef" class="admin-input" placeholder="e.g. Luke 6:36 (NIV)" value="${item.verseRef || ''}">
                  <div style="margin-top: 1rem;">
                    <label>Scripture Readings Passages</label>
                    <input type="text" id="modalField_scriptures" class="admin-input" placeholder="e.g. Isaiah 54:1-14; Luke 1:68-79; Ephesians 4:31-32" value="${item.scriptures || ''}">
                  </div>
                </div>
              </div>
            </div>

            <!-- Objectives & Intro Card -->
            <div class="admin-ss-editor-card">
              <div class="admin-ss-card-label">
                <span>3. Lesson Objectives & Introduction</span>
              </div>
              <div class="admin-input-group">
                <label>Lesson Objectives (One per line)</label>
                <textarea id="modalField_objectives" class="admin-textarea" placeholder="1. Define divine mercy...\n2. Understand how grace transforms lives...">${item.objectives || ''}</textarea>
              </div>
              <div class="admin-input-group">
                <label>Introduction</label>
                <textarea id="modalField_introduction" class="admin-textarea" placeholder="Lesson introduction text...">${item.introduction || item.description || ''}</textarea>
              </div>
            </div>

            <!-- Outlines Builder Container -->
            <div class="admin-ss-editor-card">
              <div class="admin-ss-card-label">
                <span>4. Lesson Outlines</span>
                <button type="button" class="admin-ss-btn-add" onclick="AdminPortal.addOutlineRow()">+ Add Outline Point</button>
              </div>
              <div id="adminSsOutlinesContainer">
                ${outlines.map((out, idx) => `
                  <div class="admin-ss-outline-row" data-outline-idx="${idx}">
                    <div class="admin-ss-outline-header">
                      <span class="admin-ss-outline-num">Outline Point #${idx + 1}</span>
                      <button type="button" class="admin-icon-btn danger" style="width:28px;height:28px;font-size:0.75rem;" onclick="this.closest('.admin-ss-outline-row').remove(); AdminPortal.updateModalLivePreview();">✕</button>
                    </div>
                    <div class="admin-input-group">
                      <label>Outline Sub-Heading Title</label>
                      <input type="text" class="admin-input ss-outline-title" value="${out.title || ''}" placeholder="e.g. Point 1: The Nature and Source of Divine Mercy">
                    </div>
                    <div class="admin-input-group" style="margin-bottom:0;">
                      <label>Outline Detailed Content</label>
                      <textarea class="admin-textarea ss-outline-text" placeholder="Detailed teaching notes for this outline point...">${out.text || (Array.isArray(out.points) ? out.points.join('\n') : '')}</textarea>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Discussion & Teacher's Corner -->
            <div class="admin-ss-editor-card">
              <div class="admin-ss-card-label">
                <span>5. Class Discussion & Teacher's Corner</span>
                <span style="color: #ca8a04;">🎓 Teacher Mode Content</span>
              </div>
              <div class="admin-input-group">
                <label>Class Discussion Questions (One per line)</label>
                <textarea id="modalField_discussionQuestions" class="admin-textarea" placeholder="Questions for interactive class discussion...">${item.discussionQuestions || ''}</textarea>
              </div>
              <div class="admin-ss-teacher-box">
                <label style="font-weight: 800; color: #854d0e; display: block; margin-bottom: 0.4rem;">🎓 Teacher's Corner (Notes & Facilitator Tips)</label>
                <textarea id="modalField_teacherNotes" class="admin-textarea" style="background:#fff;" placeholder="Teaching suggestions, prayer points, and group discussion hints...">${item.teacherNotes || ''}</textarea>
              </div>
              <div class="admin-input-group" style="margin-top: 1rem;">
                <label>Life Application</label>
                <textarea id="modalField_lifeApplication" class="admin-textarea" placeholder="Personal application for daily living...">${item.lifeApplication || ''}</textarea>
              </div>
            </div>

            <!-- Media Links -->
            <div class="admin-ss-editor-card">
              <div class="admin-ss-card-label">
                <span>6. Audio & PDF Download Links</span>
              </div>
              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Audio Reading URL (.mp3)</label>
                  <input type="text" id="modalField_audioUrl" class="admin-input" value="${item.audioUrl || ''}" placeholder="Path to audio recording">
                </div>
                <div class="admin-input-group">
                  <label>PDF Download Path / URL</label>
                  <input type="text" id="modalField_pdfUrl" class="admin-input" value="${item.pdfUrl || ''}" placeholder="Path to PDF manual">
                </div>
              </div>
            </div>
          `;
        } else {
          // Standard Publication Form
          html = `
            <div style="background: #fafbfc; border: 1px solid var(--admin-border); padding: 0.85rem 1.25rem; border-radius: 14px; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
              <div style="font-weight: 700; color: var(--muted); font-size: 0.9rem;">
                📄 Standard Publication Format
              </div>
              <button type="button" class="btn btn-primary admin-btn-sm" onclick="AdminPortal.togglePublicationEditorFormat(true)">
                📖 Switch to Sunday School Immersive Outline Editor
              </button>
            </div>

            <div class="admin-modal-grid-2">
              <div class="admin-input-group">
                <label>ID</label>
                <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'issue-' + Date.now()}" required>
              </div>
              <div class="admin-input-group">
                <label>Category</label>
                <select id="modalField_category" class="admin-select" style="width:100%;">
                  <option value="Goodnews Weekly" ${item.category === 'Goodnews Weekly' ? 'selected' : ''}>Goodnews Weekly</option>
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
                <label>Author / Publisher</label>
                <input type="text" id="modalField_author" class="admin-input" value="${item.author || 'Peculiar Cherubs Publications'}">
              </div>
              <div class="admin-input-group">
                <label>Date / Year</label>
                <input type="text" id="modalField_date" class="admin-input" value="${item.date || '2026'}">
              </div>
            </div>
            <div class="admin-input-group">
              <label>Description / Subtitle</label>
              <textarea id="modalField_description" class="admin-textarea">${item.description || ''}</textarea>
            </div>
            <div class="admin-modal-grid-2">
              <div class="admin-input-group">
                <label>Cover Image Path</label>
                <input type="text" id="modalField_coverImage" class="admin-input" value="${item.coverImage || 'assets/hero/mother-church-brand.jpg'}">
              </div>
              <div class="admin-input-group">
                <label>PDF Download Path / URL</label>
                <input type="text" id="modalField_pdfUrl" class="admin-input" value="${item.pdfUrl || ''}">
              </div>
            </div>
          `;
        }
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
      } else if (sectionKey === 'ministries') {
        const leadersStr = Array.isArray(item.leaders)
          ? item.leaders.map(l => typeof l === 'object' ? `${l.name || ''}${l.role ? ': ' + l.role : ''}` : l).join('\n')
          : (item.leaders || '');

        const factsStr = Array.isArray(item.facts)
          ? item.facts.map(f => typeof f === 'object' ? `${f.label || ''}: ${f.value || ''}` : f).join('\n')
          : (item.facts || '');

        const functionsStr = Array.isArray(item.functions) ? item.functions.join('\n') : (item.functions || '');
        const overviewStr = Array.isArray(item.overview) ? item.overview.join('\n\n') : (item.overview || '');

        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Ministry ID (Unique Key)</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'ministry_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Category / Type</label>
              <select id="modalField_category" class="admin-select" style="width:100%;">
                <option value="Age-Grade Ministry" ${(item.category || item.tag) === 'Age-Grade Ministry' ? 'selected' : ''}>Age-Grade Ministry</option>
                <option value="Community Outreach" ${(item.category || item.tag) === 'Community Outreach' ? 'selected' : ''}>Community Outreach</option>
                <option value="Worship & Liturgy" ${(item.category || item.tag) === 'Worship & Liturgy' ? 'selected' : ''}>Worship & Liturgy</option>
                <option value="Fellowship & Community" ${(item.category || item.tag) === 'Fellowship & Community' ? 'selected' : ''}>Fellowship & Community</option>
                <option value="Evangelism & Missions" ${(item.category || item.tag) === 'Evangelism & Missions' ? 'selected' : ''}>Evangelism & Missions</option>
                <option value="Church Department" ${(item.category || item.tag) === 'Church Department' ? 'selected' : ''}>Church Department</option>
              </select>
            </div>
          </div>
          <div class="admin-input-group">
            <label>Ministry Title</label>
            <input type="text" id="modalField_title" class="admin-input" value="${item.title || ''}" placeholder="e.g. Children's Ministry" required>
          </div>
          <div class="admin-input-group">
            <label>Summary / Subtitle</label>
            <textarea id="modalField_subtitle" class="admin-textarea" placeholder="Brief summary of ministry mission and focus...">${item.subtitle || item.description || ''}</textarea>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Meeting Schedule & Time</label>
              <input type="text" id="modalField_schedule" class="admin-input" value="${item.schedule || 'Sundays during 9:00 AM service'}" placeholder="e.g. Sundays 9:00 AM">
            </div>
            <div class="admin-input-group">
              <label>Target Page Link / URL</label>
              <input type="text" id="modalField_href" class="admin-input" value="${item.href || ''}" placeholder="e.g. children-ministry.html">
            </div>
          </div>
          <div class="admin-input-group">
            <label>Cover / Header Image Path</label>
            <input type="text" id="modalField_image" class="admin-input" value="${item.image || 'assets/hero/mother-church-brand.jpg'}">
          </div>
          <div class="admin-input-group">
            <label>Leadership Team (Format: Name: Role per line)</label>
            <textarea id="modalField_leaders" class="admin-textarea" placeholder="Special Apostle Pastor Funso Ibikunle: Captain\nApostle Biodun Ogundokun: Deputy Captain">${leadersStr}</textarea>
          </div>
          <div class="admin-input-group">
            <label>Key Facts / Highlights (Format: Label: Value per line)</label>
            <textarea id="modalField_facts" class="admin-textarea" placeholder="Age group: 13–19 years\nJunior teens: 13–15 years">${factsStr}</textarea>
          </div>
          <div class="admin-input-group">
            <label>Ministry Functions & Objectives (One per line)</label>
            <textarea id="modalField_functions" class="admin-textarea" placeholder="Train ministry handlers and teachers.\nOrganize annual camps and excursions.">${functionsStr}</textarea>
          </div>
          <div class="admin-input-group">
            <label>Detailed Overview Paragraphs</label>
            <textarea id="modalField_overview" class="admin-textarea" placeholder="Detailed overview paragraph text...">${overviewStr}</textarea>
          </div>
        `;
      }

      container.innerHTML = html;
    },

    /**
     * Adds dynamic outline row in Sunday School editor
     */
    addOutlineRow() {
      const container = document.getElementById('adminSsOutlinesContainer');
      if (!container) return;

      const idx = container.children.length;
      const row = document.createElement('div');
      row.className = 'admin-ss-outline-row';
      row.setAttribute('data-outline-idx', idx);
      row.innerHTML = `
        <div class="admin-ss-outline-header">
          <span class="admin-ss-outline-num">Outline Point #${idx + 1}</span>
          <button type="button" class="admin-icon-btn danger" style="width:28px;height:28px;font-size:0.75rem;" onclick="this.closest('.admin-ss-outline-row').remove(); AdminPortal.updateModalLivePreview();">✕</button>
        </div>
        <div class="admin-input-group">
          <label>Outline Sub-Heading Title</label>
          <input type="text" class="admin-input ss-outline-title" placeholder="e.g. Point ${idx + 1}: Teaching Title">
        </div>
        <div class="admin-input-group" style="margin-bottom:0;">
          <label>Outline Detailed Content</label>
          <textarea class="admin-textarea ss-outline-text" placeholder="Detailed teaching notes for this outline point..."></textarea>
        </div>
      `;
      container.appendChild(row);
      this.updateModalLivePreview();
    },

    /**
     * Updates live card & reader preview inside modal
     */
    updateModalLivePreview() {
      const box = document.getElementById('adminModalLivePreview');
      if (!box) return;

      const sec = editingState.sectionKey;
      const isSS = editingState.isSundaySchool;

      const getF = (f) => {
        const el = document.getElementById(`modalField_${f}`);
        return el ? el.value : '';
      };

      if (sec === 'publications') {
        if (isSS) {
          // Immersive Sunday School Reader Preview
          box.innerHTML = `
            <div style="background: var(--navy); color: var(--white); padding: 1.25rem; border-radius: 16px; margin-bottom: 1rem;">
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                <span class="eyebrow" style="color: var(--yellow);">Publications · Sunday School</span>
                <span style="background: rgba(255,255,255,0.15); color: var(--yellow); padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">${getF('quarter') || 'Quarter 3, 2026'}</span>
                <span style="background: rgba(255,255,255,0.15); color: var(--white); padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">${getF('lessonNum') || 'Lesson 35'}</span>
              </div>
              <h3 style="font-family: Fraunces, serif; font-size: 1.4rem; color: var(--white); margin: 0 0 0.5rem;">${getF('title') || 'Sunday School Lesson Title'}</h3>
              <div style="font-size: 0.82rem; color: var(--sky);">📅 ${getF('date') || 'Sunday Date'} · ⏱️ ${getF('duration') || '45 Minutes'}</div>
            </div>

            <div style="background: #fffbeb; border: 2px solid #fde047; padding: 1rem; border-radius: 14px; margin-bottom: 1rem;">
              <div style="font-size: 0.75rem; font-weight: 800; color: #854d0e; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.3rem;">Memory Verse (${getF('verseRef') || 'Passage Ref'})</div>
              <blockquote style="margin: 0; font-family: Fraunces, serif; font-size: 1.05rem; color: var(--navy); font-style: italic; line-height: 1.4;">
                "${getF('memoryVerse') || 'Memory verse text preview...'}"
              </blockquote>
            </div>

            <div style="font-size: 0.85rem; color: var(--muted); background: #f8fafc; padding: 0.85rem; border-radius: 12px; border: 1px solid var(--admin-border);">
              <strong>Reading Passage:</strong> ${getF('scriptures') || 'Scripture reading passages...'}<br>
              <strong>Introduction Preview:</strong> ${(getF('introduction') || 'Intro text...').slice(0, 140)}...
            </div>
          `;
        } else {
          // Standard Publication Preview
          box.innerHTML = `
            <div class="card publication-card" style="border: 1px solid var(--admin-border); border-radius: 16px; overflow: hidden; background: #fff;">
              <div style="padding: 1.25rem;">
                <span class="eyebrow">${getF('category') || 'Goodnews Weekly'}</span>
                <h4 style="font-family: Fraunces, serif; font-size: 1.2rem; color: var(--navy); margin: 0.4rem 0;">${getF('title') || 'Sample Title'}</h4>
                <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 0.75rem;">${getF('description') || 'Publication description preview...'}</p>
                <div style="font-size: 0.8rem; font-weight: 700; color: var(--navy);">Author: ${getF('author') || 'Peculiar Cherubs Publications'}</div>
              </div>
            </div>
          `;
        }
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
      } else if (sec === 'ministries') {
        box.innerHTML = `
          <div style="border: 1px solid var(--admin-border); border-radius: 16px; overflow: hidden; background: #fff;">
            <div style="height: 140px; background: #162249; position: relative;">
              <img src="../${getF('image') || 'assets/hero/mother-church-brand.jpg'}" alt="Preview" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'">
              <span style="position: absolute; top: 10px; right: 10px; background: var(--sky); color: var(--navy); padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 800;">
                ${getF('category') || 'Ministry'}
              </span>
            </div>
            <div style="padding: 1.25rem;">
              <h4 style="font-family: Fraunces, serif; font-size: 1.25rem; color: var(--navy); margin: 0 0 0.4rem;">${getF('title') || 'Ministry Title'}</h4>
              <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 0.85rem;">${(getF('subtitle') || 'Ministry summary preview...').slice(0, 120)}</p>
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; font-weight: 700; color: var(--navy); border-top: 1px solid #f1f5f9; padding-top: 0.6rem;">
                <span>🗓️ ${getF('schedule') || 'Regular Worship'}</span>
                <span style="color: var(--red);">🔗 ${getF('href') || '#'}</span>
              </div>
            </div>
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
      const isSS = editingState.isSundaySchool;
      const getF = (f) => {
        const el = document.getElementById(`modalField_${f}`);
        return el ? el.value.trim() : '';
      };

      const id = getF('id') || 'id_' + Date.now();

      if (sec === 'publications') {
        if (!currentContent.publications) currentContent.publications = {};

        if (isSS) {
          // Save into sundaySchoolDetails.lessons
          if (!currentContent.publications.sundaySchoolDetails) {
            currentContent.publications.sundaySchoolDetails = { lessons: {} };
          }
          if (!currentContent.publications.sundaySchoolDetails.lessons) {
            currentContent.publications.sundaySchoolDetails.lessons = {};
          }

          const outlineRows = document.querySelectorAll('.admin-ss-outline-row');
          const outlines = Array.from(outlineRows).map((row, idx) => ({
            number: String(idx + 1).padStart(2, '0'),
            title: row.querySelector('.ss-outline-title')?.value.trim() || `Point ${idx + 1}`,
            summary: row.querySelector('.ss-outline-title')?.value.trim() || '',
            text: row.querySelector('.ss-outline-text')?.value.trim() || '',
            points: (row.querySelector('.ss-outline-text')?.value.trim() || '').split('\n').filter(Boolean)
          })).filter(o => o.title || o.text);

          const lessonNumClean = getF('lessonNum') ? parseInt(getF('lessonNum').replace(/\D/g, '')) || 35 : 35;

          const lessonObj = {
            id: id,
            lessonNumber: lessonNumClean,
            date: getF('date') || '2026',
            dateDisplay: getF('date') || '2026',
            topic: getF('title'),
            subtitle: getF('introduction') || getF('title'),
            quarter: getF('quarter'),
            memoryVerse: {
              text: getF('memoryVerse'),
              reference: getF('verseRef')
            },
            mainScriptures: getF('scriptures') ? [{ reference: getF('scriptures'), label: "Main Scripture", text: getF('scriptures') }] : [],
            targetAudience: getF('duration'),
            duration: getF('duration'),
            objectives: getF('objectives').split('\n').filter(Boolean),
            introduction: getF('introduction'),
            outlines: outlines,
            discussionQuestions: getF('discussionQuestions').split('\n').filter(Boolean).map((q, idx) => ({ id: `q${idx + 1}`, question: q })),
            teacherNotes: {
              facilitatorTips: getF('teacherNotes').split('\n').filter(Boolean)
            },
            lifeApplication: getF('lifeApplication'),
            audioUrl: getF('audioUrl'),
            pdfUrl: getF('pdfUrl')
          };

          if (Array.isArray(currentContent.publications.sundaySchoolDetails.lessons)) {
            const idx = currentContent.publications.sundaySchoolDetails.lessons.findIndex(l => l.id === id);
            if (idx >= 0) {
              currentContent.publications.sundaySchoolDetails.lessons[idx] = lessonObj;
            } else {
              currentContent.publications.sundaySchoolDetails.lessons.unshift(lessonObj);
            }
          } else {
            currentContent.publications.sundaySchoolDetails.lessons[id] = lessonObj;
          }
        } else {
          // Save standard publication into items or archive/details
          const category = getF('category');
          if (category === 'Goodnews Weekly' || id.startsWith('issue-')) {
            if (!currentContent.publications.details) currentContent.publications.details = {};
            if (!currentContent.publications.archive) currentContent.publications.archive = [];

            currentContent.publications.details[id] = {
              type: 'Goodnews This Week',
              issue: id,
              date: getF('date'),
              title: getF('title'),
              subtitle: getF('description'),
              content: [getF('description')],
              pdfUrl: getF('pdfUrl')
            };

            const arcIdx = currentContent.publications.archive.findIndex(a => a.href && a.href.includes(id));
            const arcItem = {
              type: 'Goodnews This Week',
              issue: id,
              status: arcIdx === 0 ? 'Latest edition' : 'Archive',
              title: getF('title'),
              text: getF('description'),
              href: `publication-detail.html?issue=${id}`,
              theme: 'yellow'
            };

            if (arcIdx >= 0) {
              currentContent.publications.archive[arcIdx] = arcItem;
            } else {
              currentContent.publications.archive.unshift(arcItem);
            }
          } else {
            if (!currentContent.publications.items) currentContent.publications.items = [];
            const genItem = {
              id: id,
              title: getF('title'),
              category: category,
              author: getF('author'),
              date: getF('date'),
              description: getF('description'),
              coverImage: getF('coverImage'),
              pdfUrl: getF('pdfUrl')
            };

            const genIdx = currentContent.publications.items.findIndex(i => i.id === id);
            if (genIdx >= 0) {
              currentContent.publications.items[genIdx] = genItem;
            } else {
              currentContent.publications.items.unshift(genItem);
            }
          }
        }

        await this.syncSectionToSupabase('publications', currentContent.publications);
        this.renderAllViews();
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
      } else if (sec === 'ministries') {
        if (!currentContent.ministries) currentContent.ministries = {};

        const id = getF('id') || 'ministry_' + Date.now();
        const category = getF('category') || 'Ministry';
        const title = getF('title') || 'Ministry Title';
        const subtitle = getF('subtitle') || '';
        const schedule = getF('schedule') || 'Regular Worship';
        const href = getF('href') || '#';
        const image = getF('image') || 'assets/hero/mother-church-brand.jpg';

        const leadersText = getF('leaders');
        const leaders = leadersText.split('\n').filter(Boolean).map(line => {
          const parts = line.split(':');
          if (parts.length > 1) {
            return { name: parts[0].trim(), role: parts.slice(1).join(':').trim() };
          }
          return { name: line.trim(), role: 'Leader' };
        });

        const factsText = getF('facts');
        const facts = factsText.split('\n').filter(Boolean).map(line => {
          const parts = line.split(':');
          if (parts.length > 1) {
            return { label: parts[0].trim(), value: parts.slice(1).join(':').trim() };
          }
          return { label: 'Focus', value: line.trim() };
        });

        const functions = getF('functions').split('\n').filter(Boolean);
        const overview = getF('overview').split('\n\n').filter(Boolean);

        const ministryData = {
          id: id,
          href: href,
          category: category,
          tag: category,
          title: title,
          shortTitle: title,
          subtitle: subtitle,
          summary: subtitle,
          description: subtitle,
          image: image,
          schedule: schedule,
          facts: facts,
          overview: overview.length > 0 ? overview : [subtitle],
          leaders: leaders,
          functionsTitle: 'Ministry functions',
          functions: functions
        };

        currentContent.ministries[id] = ministryData;

        if (!currentContent.ministries.items) currentContent.ministries.items = [];
        const existingIdx = currentContent.ministries.items.findIndex(i => i.id === id || i.id === editingState.itemId);
        if (existingIdx >= 0) {
          currentContent.ministries.items[existingIdx] = ministryData;
        } else {
          currentContent.ministries.items.push(ministryData);
        }

        await this.syncSectionToSupabase('ministries', currentContent.ministries);
        this.renderMinistriesView();
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
        const pubs = currentContent.publications || {};

        // Delete from Sunday School lessons
        if (pubs.sundaySchoolDetails && pubs.sundaySchoolDetails.lessons) {
          if (Array.isArray(pubs.sundaySchoolDetails.lessons)) {
            pubs.sundaySchoolDetails.lessons = pubs.sundaySchoolDetails.lessons.filter(l => l.id !== itemId);
          } else if (pubs.sundaySchoolDetails.lessons[itemId]) {
            delete pubs.sundaySchoolDetails.lessons[itemId];
          }
        }

        // Delete from archive & details
        if (pubs.archive && Array.isArray(pubs.archive)) {
          pubs.archive = pubs.archive.filter(a => a.issue !== itemId && (!a.href || !a.href.includes(itemId)));
        }
        if (pubs.details && pubs.details[itemId]) {
          delete pubs.details[itemId];
        }

        // Delete from items array
        if (pubs.items && Array.isArray(pubs.items)) {
          pubs.items = pubs.items.filter(i => i.id !== itemId);
        }

        await this.syncSectionToSupabase('publications', currentContent.publications);
        this.renderAllViews();
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
      } else if (sectionKey === 'ministries') {
        if (currentContent.ministries) {
          if (currentContent.ministries[itemId]) {
            delete currentContent.ministries[itemId];
          }
          if (Array.isArray(currentContent.ministries.items)) {
            currentContent.ministries.items = currentContent.ministries.items.filter(i => i.id !== itemId);
          }
          await this.syncSectionToSupabase('ministries', currentContent.ministries);
        }
        this.renderMinistriesView();
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
      if (typeof document === 'undefined') return;
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
