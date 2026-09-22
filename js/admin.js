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

      if (val === MASTER_PASSCODE) {
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
        const sections = ['site', 'navigation', 'home', 'about', 'chapels', 'sermons', 'publications', 'quickLinks', 'give', 'bibleCollege', 'ministries', 'events'];

        let data = {};
        const localFallback = global.ContentService
          ? await global.ContentService.fetchLocalFallback()
          : {};

        if (global.ContentService && typeof global.ContentService.fetchSectionsFromDB === 'function') {
          try {
            const liveSections = await global.ContentService.fetchSectionsFromDB(sections);

            // Repository JSON is the schema and safety baseline.
            // Any section that exists in Supabase overrides its local counterpart.
            data = { ...localFallback };
            Object.entries(liveSections || {}).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                data[key] = value;
              }
            });

            this.updateStatusIndicator(true, 'Live Supabase DB + repository fallback');
          } catch (dbErr) {
            console.warn('[AdminPortal] Supabase DB fetch failed, using local fallback:', dbErr);
            data = localFallback;
            this.updateStatusIndicator(false, 'Local JSON Fallback');
          }
        } else {
          data = localFallback;
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

      // 3. New publication blog posts (publications.blog.posts)
      if (pubs.blog && Array.isArray(pubs.blog.posts)) {
        pubs.blog.posts.forEach(post => {
          if (!post) return;
          const postId = post.id || post.slug;
          if (!postId || items.some(i => i.id === postId)) return;

          items.push({
            id: postId,
            slug: post.slug || postId,
            title: post.title || 'Publication',
            category: post.category || 'publication',
            type: post.type || 'Publication',
            date: post.date || '2026',
            description: post.excerpt || '',
            author: post.author || 'Peculiar Cherubs Publications',
            coverImage: post.cover?.image || 'assets/hero/mother-church-brand.jpg',
            pdfUrl: post.pdfUrl || '',
            template: post.template || '',
            _raw: post,
            _sourceGroup: 'blog'
          });
        });
      }

      // 4. General Items Array (if present)
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
     * Helper to aggregate ALL leadership personnel from currentContent.about.leadership.team
     */
    getAllLeadershipItems() {
      const about = currentContent.about || {};
      const lead = about.leadership || {};
      const team = Array.isArray(lead.team) ? lead.team : [];
      return team.map((p, idx) => ({
        id: p.id || `leader_${idx}`,
        name: p.name || 'Leader Name',
        position: p.position || 'Position / Title',
        image: p.image || '',
        _index: idx,
        _raw: p
      }));
    },

    /**
     * Helper to aggregate ALL quick links ("Your next step starts here") from currentContent.quickLinks.links
     */
    getAllQuickLinkItems() {
      const ql = currentContent.quickLinks || {};
      const links = Array.isArray(ql.links) ? ql.links : [];
      return links.map((link, idx) => ({
        id: link.id || `ql_link_${idx}`,
        icon: link.icon || '🔗',
        title: link.title || 'Quick Link',
        text: link.text || link.description || '',
        href: link.href || '#',
        _index: idx,
        _raw: link
      }));
    },

    /**
     * Helper to aggregate ALL regular services & major events from currentContent.quickLinks.events
     */
    getAllQuickEventItems() {
      const ql = currentContent.quickLinks || {};
      const events = Array.isArray(ql.events) ? ql.events : [];
      return events.map((ev, idx) => ({
        id: ev.id || `ql_event_${idx}`,
        frequency: ev.frequency || 'Weekly Rhythm',
        title: ev.title || 'Service / Event',
        text: ev.text || '',
        _index: idx,
        _raw: ev
      }));
    },

    /**
     * Helper to get all giving bank accounts
     */
    getAllGivingAccounts() {
      const give = currentContent.give || {};
      const accs = Array.isArray(give.bankAccounts) ? give.bankAccounts : [];
      return accs.map((a, idx) => ({
        id: a.id || `acc_${idx}`,
        currency: a.currency || 'NGN',
        title: a.title || a.accountName || 'Bank Account',
        bankName: a.bankName || 'Bank',
        accountName: a.accountName || 'Peculiar Cherubs',
        accountNumber: a.accountNumber || '',
        sortCode: a.sortCode || '',
        swiftCode: a.swiftCode || '',
        isPrimary: Boolean(a.isPrimary),
        narrationGuide: a.narrationGuide || '',
        _index: idx,
        _raw: a
      }));
    },

    /**
     * Helper to get all giving special projects
     */
    getAllGivingProjects() {
      const give = currentContent.give || {};
      const projs = Array.isArray(give.projects) ? give.projects : [];
      return projs.map((p, idx) => ({
        id: p.id || `proj_${idx}`,
        title: p.title || 'Special Project',
        category: p.category || 'Strategic Mission',
        badge: p.badge || '',
        description: p.description || '',
        _index: idx,
        _raw: p
      }));
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
      this.renderLeadershipView();
      this.renderQuickLinksView();
      this.renderGivingView();
      this.populateQuickLinksHeaderForm();
      this.populateLeadershipHeaderForm();
      this.populateGivingForms();
      this.populateSiteSettingsForm();
      this.populateAdvancedContentSections();
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
      const leaders = this.getAllLeadershipItems();
      const qLinks = this.getAllQuickLinkItems();
      const qEvents = this.getAllQuickEventItems();
      const giveAccounts = this.getAllGivingAccounts();
      const giveProjects = this.getAllGivingProjects();

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

      const bLeaders = document.getElementById('badgeLeadership');
      if (bLeaders) bLeaders.textContent = leaders.length;

      const bQuickLinks = document.getElementById('badgeQuickLinks');
      if (bQuickLinks) bQuickLinks.textContent = qLinks.length + qEvents.length;

      const bGiving = document.getElementById('badgeGivingAccounts');
      if (bGiving) bGiving.textContent = giveAccounts.length;

      // Dashboard stats
      const statP = document.getElementById('statPublicationsCount');
      if (statP) statP.textContent = pubs.length;

      const statS = document.getElementById('statSermonsCount');
      if (statS) statS.textContent = sermons.length;

      const statE = document.getElementById('statEventsCount');
      if (statE) statE.textContent = events.length;

      const statF = document.getElementById('statFellowshipsCount');
      if (statF) statF.textContent = fellowships.length;

      const statL = document.getElementById('statLeadershipCount');
      if (statL) statL.textContent = leaders.length;

      const statQL = document.getElementById('statQuickLinksCount');
      if (statQL) statQL.textContent = `${qLinks.length + qEvents.length} (${qLinks.length}L / ${qEvents.length}S)`;

      const statG = document.getElementById('statGivingCount');
      if (statG) statG.textContent = `${giveAccounts.length} Accs / ${giveProjects.length} Proj`;
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
       Leadership Team View
       ====================================================================== */
    renderLeadershipView(filteredItems) {
      if (typeof document === 'undefined') return;
      const grid = document.getElementById('gridLeadership');
      if (!grid) return;

      const items = filteredItems || this.getAllLeadershipItems();

      if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--muted);">No leadership personnel found. Click "+ Add Leader / Personnel" to add one.</div>`;
        return;
      }

      grid.innerHTML = items.map((item) => {
        const hasPhoto = item.image && item.image.trim() !== '';
        const initials = item.name
          .split(/[\s,()]+/)
          .filter(Boolean)
          .slice(0, 2)
          .map(w => w[0].toUpperCase())
          .join('') || 'LP';

        return `
          <div class="admin-item-card">
            <div style="background: linear-gradient(160deg, #162249 0%, #1c2c5c 100%); padding: 1.75rem 1.5rem 1.25rem; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative;">
              <div style="width: 90px; height: 90px; border-radius: 50%; overflow: hidden; margin-bottom: 0.85rem; border: 3px solid var(--yellow); box-shadow: 0 4px 12px rgba(0,0,0,0.25); background: #1c2c5c; display: grid; place-items: center; flex-shrink: 0;">
                ${hasPhoto
                  ? `<img src="../${item.image}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><span style="display:none; color:var(--yellow); font-family:'Fraunces',serif; font-size:1.6rem; font-weight:700;">${initials}</span>`
                  : `<span style="color: var(--yellow); font-family: 'Fraunces', serif; font-size: 1.6rem; font-weight: 700;">${initials}</span>`
                }
              </div>
              <h3 style="font-family: 'Fraunces', serif; color: var(--white); font-size: 1.2rem; margin: 0 0 0.35rem; line-height: 1.2;">${item.name}</h3>
              <span style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--yellow);">${item.position}</span>
            </div>
            <div class="admin-item-body" style="padding: 1.25rem;">
              <div style="font-size: 0.82rem; color: var(--muted); margin-bottom: 0.85rem; word-break: break-all;">
                <strong>Photo:</strong> ${hasPhoto ? item.image : '<em style="color:#94a3b8;">Monogram avatar (auto-generated)</em>'}
              </div>
              <div class="admin-item-actions">
                <span class="admin-nav-badge">Leader #${item._index + 1}</span>
                <div class="admin-action-btn-group">
                  <button class="admin-icon-btn" title="Edit Leader" onclick="AdminPortal.openItemModal('leadership', '${item.id}')">✏️</button>
                  <button class="admin-icon-btn danger" title="Delete Leader" onclick="AdminPortal.deleteItem('leadership', '${item.id}')">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    /* ======================================================================
       Leadership Section Header Form
       ====================================================================== */
    populateLeadershipHeaderForm() {
      if (typeof document === 'undefined') return;
      const lead = (currentContent.about && currentContent.about.leadership) || {};
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      };
      setVal('leadershipSettingEyebrow', lead.eyebrow || 'Our leadership');
      setVal('leadershipSettingTitle', lead.title || 'Shepherds of the flock.');
      setVal('leadershipSettingDescription', lead.description || "Trusted men and women called to serve with humility, faithfulness, and a love for God's people.");
    },

    async saveLeadershipHeaderSettings() {
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      if (!currentContent.about) currentContent.about = {};
      if (!currentContent.about.leadership) currentContent.about.leadership = { team: [] };

      currentContent.about.leadership.eyebrow = getVal('leadershipSettingEyebrow') || 'Our leadership';
      currentContent.about.leadership.title = getVal('leadershipSettingTitle') || 'Shepherds of the flock.';
      currentContent.about.leadership.description = getVal('leadershipSettingDescription') || '';

      await this.syncSectionToSupabase('about', currentContent.about);
      this.showToast('Leadership section header updated live in Supabase DB!', 'success');
    },

    /* ======================================================================
       Quick Links & Church Rhythm View
       ====================================================================== */
    renderQuickLinksView(filteredLinks, filteredEvents) {
      if (typeof document === 'undefined') return;

      // 1. Useful Links Grid ("Your next step starts here")
      const gridLinks = document.getElementById('gridQuickLinks');
      if (gridLinks) {
        const links = filteredLinks || this.getAllQuickLinkItems();
        if (links.length === 0) {
          gridLinks.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: var(--muted);">No quick links found. Click "+ Add Quick Link" to create one.</div>`;
        } else {
          gridLinks.innerHTML = links.map(item => `
            <div class="admin-item-card">
              <div class="admin-item-body" style="padding: 1.5rem;">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                  <div class="admin-ql-icon-box">${item.icon || '🔗'}</div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.78rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em;">Useful Link</div>
                    <h3 class="admin-item-title" style="margin: 0; font-size: 1.15rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</h3>
                  </div>
                </div>
                <p class="admin-item-desc" style="margin-bottom: 1rem; min-height: 2.6rem;">${item.text || 'No description provided.'}</p>
                <div style="font-size: 0.82rem; color: var(--muted); margin-bottom: 1rem; word-break: break-all;">
                  <strong>Destination:</strong> <span style="color: var(--navy); font-weight: 600;">${item.href}</span>
                </div>
                <div class="admin-item-actions">
                  <span class="admin-nav-badge">Link #${item._index + 1}</span>
                  <div class="admin-action-btn-group">
                    <button class="admin-icon-btn" title="Edit Quick Link" onclick="AdminPortal.openItemModal('quickLinks', '${item.id}')">✏️</button>
                    <button class="admin-icon-btn danger" title="Delete Quick Link" onclick="AdminPortal.deleteItem('quickLinks', '${item.id}')">🗑️</button>
                  </div>
                </div>
              </div>
            </div>
          `).join('');
        }
      }

      // 2. Regular Services & Major Events Grid ("Regular services and major events")
      const gridEvents = document.getElementById('gridQuickEvents');
      if (gridEvents) {
        const events = filteredEvents || this.getAllQuickEventItems();
        if (events.length === 0) {
          gridEvents.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: var(--muted);">No regular services or events found. Click "+ Add Service / Major Event" to create one.</div>`;
        } else {
          gridEvents.innerHTML = events.map(item => `
            <div class="admin-item-card">
              <div class="admin-item-body" style="padding: 1.5rem;">
                <div style="margin-bottom: 0.75rem;">
                  <span class="admin-schedule-pill">🗓️ ${item.frequency}</span>
                </div>
                <h3 class="admin-item-title" style="margin: 0 0 0.5rem; font-size: 1.2rem;">${item.title}</h3>
                <p class="admin-item-desc" style="margin-bottom: 1.25rem;">${item.text || 'Part of the church’s regular weekly rhythm.'}</p>
                <div class="admin-item-actions">
                  <span class="admin-nav-badge">Schedule #${item._index + 1}</span>
                  <div class="admin-action-btn-group">
                    <button class="admin-icon-btn" title="Edit Service" onclick="AdminPortal.openItemModal('quickEvents', '${item.id}')">✏️</button>
                    <button class="admin-icon-btn danger" title="Delete Service" onclick="AdminPortal.deleteItem('quickEvents', '${item.id}')">🗑️</button>
                  </div>
                </div>
              </div>
            </div>
          `).join('');
        }
      }
    },

    /* ======================================================================
       Quick Links Page Header Form
       ====================================================================== */
    populateQuickLinksHeaderForm() {
      if (typeof document === 'undefined') return;
      const ql = currentContent.quickLinks || {};
      const hero = ql.hero || {};
      const useful = ql.usefulLinks || {};
      const cal = ql.calendar || {};

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      };

      setVal('qlSettingHeroEyebrow', hero.eyebrow || 'Quick links');
      setVal('qlSettingHeroTitle', hero.title || 'Connect. Worship.\nStay informed.');
      setVal('qlSettingHeroDesc', hero.description || 'Access church information, weekly publications, services, events, prayer, and ways to connect with Peculiar Cherubs.');
      setVal('qlSettingUsefulTitle', useful.title || 'Your next step starts here.');
      setVal('qlSettingCalendarTitle', cal.title || 'Regular services and major events.');
    },

    async saveQuickLinksHeaderSettings() {
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      if (!currentContent.quickLinks) currentContent.quickLinks = {};
      if (!currentContent.quickLinks.hero) currentContent.quickLinks.hero = {};
      if (!currentContent.quickLinks.usefulLinks) currentContent.quickLinks.usefulLinks = {};
      if (!currentContent.quickLinks.calendar) currentContent.quickLinks.calendar = {};

      currentContent.quickLinks.hero.eyebrow = getVal('qlSettingHeroEyebrow') || 'Quick links';
      currentContent.quickLinks.hero.title = getVal('qlSettingHeroTitle') || 'Connect. Worship.\nStay informed.';
      currentContent.quickLinks.hero.description = getVal('qlSettingHeroDesc') || '';
      currentContent.quickLinks.usefulLinks.title = getVal('qlSettingUsefulTitle') || 'Your next step starts here.';
      currentContent.quickLinks.usefulLinks.eyebrow = 'Useful links';
      currentContent.quickLinks.calendar.title = getVal('qlSettingCalendarTitle') || 'Regular services and major events.';
      currentContent.quickLinks.calendar.eyebrow = 'Church calendar';

      await this.syncSectionToSupabase('quickLinks', currentContent.quickLinks);
      this.showToast('Quick Links page headers updated live in Supabase DB!', 'success');
    },

    /* ======================================================================
       Giving & Payment Gateway View
       ====================================================================== */
    renderGivingView(currencyFilter = 'ALL') {
      if (typeof document === 'undefined') return;

      // 1. Render Bank Accounts Grid
      const gridAccounts = document.getElementById('gridGivingAccounts');
      if (gridAccounts) {
        let accounts = this.getAllGivingAccounts();
        if (currencyFilter !== 'ALL') {
          accounts = accounts.filter(a => (a.currency || 'NGN').toUpperCase() === currencyFilter.toUpperCase());
        }

        if (accounts.length === 0) {
          gridAccounts.innerHTML = `
            <div class="admin-empty-state" style="grid-column: 1 / -1; padding: 2.5rem; background: var(--white); border-radius: 16px; border: 1px dashed var(--admin-border); text-align: center;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🏦</div>
              <h4 style="margin: 0 0 0.25rem; color: var(--navy);">No Bank Accounts for ${currencyFilter}</h4>
              <p style="color: var(--muted); font-size: 0.88rem; margin-bottom: 1rem;">Click below to register church account details for this currency.</p>
              <button class="btn btn-primary admin-btn-sm" onclick="AdminPortal.openItemModal('giveAccounts')">
                + Add Bank Account
              </button>
            </div>
          `;
        } else {
          gridAccounts.innerHTML = accounts.map(a => `
            <div class="admin-account-item-card">
              <div class="admin-account-item-header">
                <div>
                  <div style="display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.25rem;">
                    <span style="font-weight: 800; font-size: 0.72rem; text-transform: uppercase; background: var(--navy); color: #fff; padding: 0.15rem 0.5rem; border-radius: 999px;">
                      ${a.currency}
                    </span>
                    ${a.isPrimary ? '<span style="font-weight: 800; font-size: 0.72rem; text-transform: uppercase; background: #fef3c7; color: #92400e; padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid #fde68a;">Primary Account</span>' : ''}
                  </div>
                  <h4 style="margin: 0 0 0.2rem; font-family: 'Fraunces', serif; font-size: 1.15rem; color: var(--navy);">
                    ${a.title}
                  </h4>
                  <div style="font-size: 0.85rem; color: var(--muted); font-weight: 600;">
                    ${a.bankName}
                  </div>
                </div>
                <div class="admin-card-actions">
                  <button class="admin-icon-btn" title="Edit Account" onclick="AdminPortal.openItemModal('giveAccounts', '${a.id}')">✏️</button>
                  <button class="admin-icon-btn delete" title="Delete Account" onclick="AdminPortal.deleteItem('giveAccounts', '${a.id}')">🗑️</button>
                </div>
              </div>

              <div class="admin-account-number-display">
                ${a.accountNumber}
              </div>

              <div style="font-size: 0.84rem; color: var(--navy);">
                <strong>Account Name:</strong> ${a.accountName}
                ${a.sortCode ? `<br><strong>Sort Code:</strong> ${a.sortCode}` : ''}
                ${a.swiftCode ? `<br><strong>SWIFT / BIC:</strong> ${a.swiftCode}` : ''}
              </div>

              ${a.narrationGuide ? `
                <div style="font-size: 0.78rem; color: var(--muted); background: #f8fafc; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid var(--admin-border);">
                  ℹ️ <em>${a.narrationGuide}</em>
                </div>
              ` : ''}
            </div>
          `).join('');
        }
      }

      // 2. Render Special Projects Grid
      const gridProjects = document.getElementById('gridGivingProjects');
      if (gridProjects) {
        const projects = this.getAllGivingProjects();
        if (projects.length === 0) {
          gridProjects.innerHTML = `
            <div class="admin-empty-state" style="grid-column: 1 / -1; padding: 2rem; background: var(--white); border-radius: 16px; border: 1px dashed var(--admin-border); text-align: center;">
              <p style="color: var(--muted); margin: 0 0 1rem;">No special projects currently configured.</p>
              <button class="btn btn-secondary admin-btn-sm" onclick="AdminPortal.openItemModal('giveProjects')">
                + Add Special Project
              </button>
            </div>
          `;
        } else {
          gridProjects.innerHTML = projects.map(p => `
            <div class="admin-project-item-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                <div>
                  <div style="display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.35rem;">
                    <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; background: var(--sky); color: var(--navy); padding: 0.15rem 0.5rem; border-radius: 999px;">
                      ${p.category}
                    </span>
                    ${p.badge ? `<span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; background: #fef3c7; color: #92400e; padding: 0.15rem 0.5rem; border-radius: 999px;">${p.badge}</span>` : ''}
                  </div>
                  <h4 style="margin: 0; font-family: 'Fraunces', serif; font-size: 1.15rem; color: var(--navy);">
                    ${p.title}
                  </h4>
                </div>
                <div class="admin-card-actions">
                  <button class="admin-icon-btn" title="Edit Project" onclick="AdminPortal.openItemModal('giveProjects', '${p.id}')">✏️</button>
                  <button class="admin-icon-btn delete" title="Delete Project" onclick="AdminPortal.deleteItem('giveProjects', '${p.id}')">🗑️</button>
                </div>
              </div>
              <p style="margin: 0; font-size: 0.88rem; color: var(--muted); line-height: 1.45;">
                ${p.description}
              </p>
            </div>
          `).join('');
        }
      }
    },

    filterGivingAccounts(curr) {
      document.querySelectorAll('#adminGivingCurrencyTabs .admin-currency-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-curr-filter') === curr);
      });
      this.renderGivingView(curr);
    },

    populateGivingForms() {
      if (typeof document === 'undefined') return;
      const give = currentContent.give || {};
      const gateway = give.paymentGateway || {};

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      };

      // Payment Gateway Form
      const chkEnabled = document.getElementById('gatewaySettingEnabled');
      if (chkEnabled) chkEnabled.checked = Boolean(gateway.enabled);

      setVal('gatewaySettingProvider', gateway.provider || 'custom');
      setVal('gatewaySettingUrl', gateway.paymentUrl || '');
      setVal('gatewaySettingBtnLabel', gateway.buttonLabel || 'Proceed to Secure Payment ↗');

      const chkParams = document.getElementById('gatewaySettingAppendParams');
      if (chkParams) chkParams.checked = gateway.appendDonorParams !== false;

      setVal('gatewaySettingNotice', gateway.noticeMessage || 'Online card processing integration for Peculiar Cherubs is currently being finalized. In the meantime, you can fulfill your giving instantly with zero transaction fees using our verified Direct Bank Transfer accounts.');

      // Update Banner UI
      const banner = document.getElementById('adminGatewayStatusBanner');
      const title = document.getElementById('adminGatewayStatusTitle');
      const desc = document.getElementById('adminGatewayStatusDesc');
      const badge = document.getElementById('adminGatewayStatusBadge');

      if (banner && title && desc && badge) {
        if (gateway.enabled && gateway.paymentUrl && gateway.paymentUrl.trim().length > 0) {
          banner.className = 'admin-gateway-banner active';
          title.textContent = `🟢 Live Gateway Active (${(gateway.provider || 'Custom').toUpperCase()})`;
          desc.textContent = `Donors clicking "Proceed to Give Online" are forwarded to: ${gateway.paymentUrl}`;
          badge.textContent = 'Active Live';
        } else {
          banner.className = 'admin-gateway-banner inactive';
          title.textContent = '🔌 Gateway Offline / Setup Mode';
          desc.textContent = 'The website displays a graceful notice directing givers to verified direct bank transfers.';
          badge.textContent = 'Setup Mode';
        }
      }

      // Giving Page Settings Form
      setVal('givingSettingWhatsAppPhone', give.whatsappConfirmPhone || '2348000000000');
      setVal('givingSettingWhatsAppText', give.whatsappConfirmText || 'Hello Peculiar Cherubs Finance Team, I have just completed a transfer for my giving/tithe. Here are the details:');
      setVal('givingSettingQuote', give.why?.quote || 'God loves a cheerful giver.');
      setVal('givingSettingWhyTitle', give.why?.title || 'Giving is worship.');
      setVal('givingSettingWhyDesc', give.why?.description || 'We give in gratitude to God and in partnership with the work He is doing through Peculiar Cherubs.');
    },

    onGatewayProviderChange() {
      const select = document.getElementById('gatewaySettingProvider');
      const urlInput = document.getElementById('gatewaySettingUrl');
      if (!select || !urlInput) return;

      const val = select.value;
      if (!urlInput.value || urlInput.value.includes('paystack.com') || urlInput.value.includes('flutterwave.com') || urlInput.value.includes('stripe.com')) {
        if (val === 'paystack') {
          urlInput.placeholder = 'https://paystack.com/pay/peculiarcherubs';
        } else if (val === 'flutterwave') {
          urlInput.placeholder = 'https://flutterwave.com/pay/peculiarcherubs';
        } else if (val === 'stripe') {
          urlInput.placeholder = 'https://buy.stripe.com/...';
        } else if (val === 'remita') {
          urlInput.placeholder = 'https://login.remita.net/remita/onepage/OAG/payment.spa';
        } else {
          urlInput.placeholder = 'https://your-payment-gateway-link.com';
        }
      }
    },

    async savePaymentGatewaySettings() {
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      if (!currentContent.give) currentContent.give = {};
      if (!currentContent.give.paymentGateway) currentContent.give.paymentGateway = {};

      const chkEnabled = document.getElementById('gatewaySettingEnabled');
      const chkParams = document.getElementById('gatewaySettingAppendParams');

      currentContent.give.paymentGateway.enabled = chkEnabled ? chkEnabled.checked : false;
      currentContent.give.paymentGateway.provider = getVal('gatewaySettingProvider') || 'custom';
      currentContent.give.paymentGateway.paymentUrl = getVal('gatewaySettingUrl');
      currentContent.give.paymentGateway.buttonLabel = getVal('gatewaySettingBtnLabel') || 'Proceed to Secure Payment ↗';
      currentContent.give.paymentGateway.appendDonorParams = chkParams ? chkParams.checked : true;
      currentContent.give.paymentGateway.noticeMessage = getVal('gatewaySettingNotice');

      await this.syncSectionToSupabase('give', currentContent.give);
      this.populateGivingForms();
      this.showToast('Payment Gateway plugin configuration synced live to Supabase DB!', 'success');
    },

    async saveGivingPageSettings() {
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      if (!currentContent.give) currentContent.give = {};
      if (!currentContent.give.why) currentContent.give.why = {};

      currentContent.give.whatsappConfirmPhone = getVal('givingSettingWhatsAppPhone');
      currentContent.give.whatsappConfirmText = getVal('givingSettingWhatsAppText');
      currentContent.give.why.quote = getVal('givingSettingQuote');
      currentContent.give.why.title = getVal('givingSettingWhyTitle');
      currentContent.give.why.description = getVal('givingSettingWhyDesc');

      await this.syncSectionToSupabase('give', currentContent.give);
      this.showToast('Giving page settings updated live in Supabase DB!', 'success');
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
       Repository → CMS Standardization
       ====================================================================== */

    getStableItemKey(item) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

      const candidateKeys = [
        'id', 'slug', 'key', 'href', 'issue', 'name', 'title',
        'date', 'label', 'reference'
      ];

      for (const key of candidateKeys) {
        const value = item[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return `${key}:${String(value).trim()}`;
        }
      }

      return null;
    },

    standardizeContentValue(repositoryValue, liveValue) {
      // Existing live scalar values win. Repository values fill gaps.
      if (liveValue === undefined || liveValue === null) {
        return typeof structuredClone === 'function'
          ? structuredClone(repositoryValue)
          : JSON.parse(JSON.stringify(repositoryValue));
      }

      if (
        repositoryValue &&
        liveValue &&
        typeof repositoryValue === 'object' &&
        typeof liveValue === 'object' &&
        !Array.isArray(repositoryValue) &&
        !Array.isArray(liveValue)
      ) {
        const result = {};

        Object.keys(repositoryValue).forEach(key => {
          result[key] = this.standardizeContentValue(
            repositoryValue[key],
            liveValue[key]
          );
        });

        Object.keys(liveValue).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(result, key)) {
            result[key] = liveValue[key];
          }
        });

        return result;
      }

      if (Array.isArray(repositoryValue) && Array.isArray(liveValue)) {
        const repositoryObjects = repositoryValue.every(
          item => item && typeof item === 'object' && !Array.isArray(item)
        );
        const liveObjects = liveValue.every(
          item => item && typeof item === 'object' && !Array.isArray(item)
        );

        // Object arrays: merge matching items while preserving repository items
        // that may be missing from an older CMS dataset.
        if (repositoryObjects && liveObjects) {
          const liveByKey = new Map();
          liveValue.forEach(item => {
            const stableKey = this.getStableItemKey(item);
            if (stableKey) liveByKey.set(stableKey, item);
          });

          const usedLiveKeys = new Set();
          const merged = repositoryValue.map(repoItem => {
            const stableKey = this.getStableItemKey(repoItem);
            const liveItem = stableKey ? liveByKey.get(stableKey) : undefined;

            if (liveItem && stableKey) {
              usedLiveKeys.add(stableKey);
              return this.standardizeContentValue(repoItem, liveItem);
            }

            return repoItem;
          });

          // Keep CMS-only objects too.
          liveValue.forEach(liveItem => {
            const stableKey = this.getStableItemKey(liveItem);
            if (!stableKey || !usedLiveKeys.has(stableKey)) {
              const duplicate = stableKey && merged.some(
                item => this.getStableItemKey(item) === stableKey
              );
              if (!duplicate) merged.push(liveItem);
            }
          });

          return merged;
        }

        // Primitive / mixed arrays: union them so repository values are not lost,
        // while still retaining live CMS additions.
        const result = [...repositoryValue];
        liveValue.forEach(item => {
          const serialized = JSON.stringify(item);
          if (!result.some(existing => JSON.stringify(existing) === serialized)) {
            result.push(item);
          }
        });
        return result;
      }

      return liveValue;
    },

    async standardizeCmsFromRepository() {
      if (!global.ContentService) {
        this.showToast('ContentService is unavailable.', 'error');
        return;
      }

      const proceed = window.confirm(
        'This will standardize every CMS section using the repository site-content.json as the baseline. ' +
        'Existing live Supabase values will be preserved where they already exist, while missing fields and items will be added. Continue?'
      );
      if (!proceed) return;

      const status = document.getElementById('cmsMigrationStatus');
      if (status) {
        status.hidden = false;
        status.className = 'admin-migration-status running';
        status.textContent = 'Preparing CMS standardization…';
      }

      try {
        const repositoryContent = await global.ContentService.fetchLocalFallback();
        const sectionKeys = Object.keys(repositoryContent).filter(key => key !== '_source');

        let liveSections = {};
        try {
          liveSections = await global.ContentService.fetchSectionsFromDB(sectionKeys);
        } catch (err) {
          console.warn('[AdminPortal] Could not fetch all live sections before standardization. Missing sections will be created.', err);
        }

        const standardizedContent = {};
        const results = [];

        for (let index = 0; index < sectionKeys.length; index++) {
          const sectionKey = sectionKeys[index];
          const repositorySection = repositoryContent[sectionKey];
          const liveSection = liveSections?.[sectionKey];

          const standardizedSection = this.standardizeContentValue(
            repositorySection,
            liveSection
          );

          if (status) {
            status.textContent = `Standardizing ${sectionKey} (${index + 1}/${sectionKeys.length})…`;
          }

          const ok = await this.syncSectionToSupabase(
            sectionKey,
            standardizedSection
          );

          results.push({ sectionKey, ok });
          if (ok) standardizedContent[sectionKey] = standardizedSection;
        }

        // Keep the admin's in-memory model aligned with the successful migration.
        currentContent = {
          ...repositoryContent,
          ...currentContent,
          ...standardizedContent
        };

        this.renderAllViews();

        const succeeded = results.filter(item => item.ok).length;
        const failed = results.filter(item => !item.ok).map(item => item.sectionKey);

        if (status) {
          status.className = failed.length
            ? 'admin-migration-status warning'
            : 'admin-migration-status success';
          status.innerHTML = failed.length
            ? `<strong>Standardization partially completed.</strong> ${succeeded}/${results.length} sections saved. Failed: ${failed.join(', ')}.`
            : `<strong>CMS standardized successfully.</strong> ${succeeded}/${results.length} sections were merged and saved.`;
        }

        if (failed.length) {
          this.showToast(`CMS standardization completed with ${failed.length} failed section(s).`, 'error');
        } else {
          this.showToast('CMS standardization completed successfully.', 'success');
        }
      } catch (err) {
        console.error('[AdminPortal] CMS standardization failed:', err);

        if (status) {
          status.hidden = false;
          status.className = 'admin-migration-status error';
          status.textContent = `Standardization failed: ${err.message}`;
        }

        this.showToast('CMS standardization failed. Check the browser console.', 'error');
      }
    },

    /* ======================================================================
       Advanced Content Editor
       ====================================================================== */
    populateAdvancedContentSections() {
      if (typeof document === 'undefined') return;
      const select = document.getElementById('advancedSectionSelect');
      if (!select) return;

      const preferredOrder = [
        'site', 'navigation', 'home', 'about', 'chapels', 'sermons',
        'publications', 'quickLinks', 'give', 'bibleCollege', 'ministries', 'events'
      ];

      const keys = [
        ...preferredOrder.filter(key => Object.prototype.hasOwnProperty.call(currentContent, key)),
        ...Object.keys(currentContent)
          .filter(key => key !== '_source' && !preferredOrder.includes(key))
          .sort()
      ];

      const previous = select.value;
      select.innerHTML = keys.map(key => `<option value="${key}">${key}</option>`).join('');

      const target = keys.includes(previous) ? previous : keys[0];
      if (target) {
        select.value = target;
        this.loadAdvancedSection(target);
      }
    },

    loadAdvancedSection(sectionKey) {
      if (!sectionKey) return;
      const editor = document.getElementById('advancedJsonEditor');
      const name = document.getElementById('advancedSectionName');
      if (!editor) return;

      editor.value = JSON.stringify(currentContent[sectionKey] ?? {}, null, 2);
      if (name) name.textContent = sectionKey;
      this.validateAdvancedJson();
    },

    validateAdvancedJson() {
      const editor = document.getElementById('advancedJsonEditor');
      const status = document.getElementById('advancedValidationStatus');
      if (!editor || !status) return false;

      try {
        JSON.parse(editor.value || '{}');
        status.textContent = 'Valid JSON';
        status.className = 'admin-advanced-validation valid';
        return true;
      } catch (err) {
        status.textContent = `Invalid JSON: ${err.message}`;
        status.className = 'admin-advanced-validation invalid';
        return false;
      }
    },

    formatAdvancedJson() {
      const editor = document.getElementById('advancedJsonEditor');
      if (!editor) return;

      try {
        editor.value = JSON.stringify(JSON.parse(editor.value || '{}'), null, 2);
        this.validateAdvancedJson();
      } catch (err) {
        this.showToast('Fix the JSON syntax before formatting.', 'error');
      }
    },

    async restoreAdvancedSectionFromLocal() {
      const select = document.getElementById('advancedSectionSelect');
      const editor = document.getElementById('advancedJsonEditor');
      if (!select || !editor || !global.ContentService) return;

      try {
        const local = await global.ContentService.fetchLocalFallback();
        const sectionKey = select.value;

        if (!Object.prototype.hasOwnProperty.call(local, sectionKey)) {
          this.showToast(`No local fallback exists for '${sectionKey}'.`, 'error');
          return;
        }

        editor.value = JSON.stringify(local[sectionKey], null, 2);
        this.validateAdvancedJson();
        this.showToast(`Loaded repository fallback for '${sectionKey}'. Review it before saving.`, 'info');
      } catch (err) {
        console.error(err);
        this.showToast('Could not load the repository fallback.', 'error');
      }
    },

    async saveAdvancedSection() {
      const select = document.getElementById('advancedSectionSelect');
      const editor = document.getElementById('advancedJsonEditor');
      if (!select || !editor) return;

      const sectionKey = select.value;
      let parsed;

      try {
        parsed = JSON.parse(editor.value || '{}');
      } catch (err) {
        this.validateAdvancedJson();
        this.showToast('Cannot save: the JSON is invalid.', 'error');
        return;
      }

      currentContent[sectionKey] = parsed;
      const ok = await this.syncSectionToSupabase(sectionKey, parsed);
      if (!ok) return;

      this.renderAllViews();
      const refreshed = document.getElementById('advancedSectionSelect');
      if (refreshed) refreshed.value = sectionKey;
      this.loadAdvancedSection(sectionKey);
      this.showToast(`'${sectionKey}' saved to Supabase.`, 'success');
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
      } else if (type === 'leadership') {
        const q = (document.getElementById('searchLeadership')?.value || '').toLowerCase();
        const all = this.getAllLeadershipItems();
        const filtered = all.filter(item =>
          (item.name || '').toLowerCase().includes(q) ||
          (item.position || '').toLowerCase().includes(q)
        );
        this.renderLeadershipView(filtered);
      } else if (type === 'quickLinks') {
        const q = (document.getElementById('searchQuickLinks')?.value || '').toLowerCase();
        const all = this.getAllQuickLinkItems();
        const filtered = all.filter(item =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.text || '').toLowerCase().includes(q) ||
          (item.href || '').toLowerCase().includes(q)
        );
        this.renderQuickLinksView(filtered, null);
      } else if (type === 'quickEvents') {
        const q = (document.getElementById('searchQuickEvents')?.value || '').toLowerCase();
        const all = this.getAllQuickEventItems();
        const filtered = all.filter(item =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.frequency || '').toLowerCase().includes(q) ||
          (item.text || '').toLowerCase().includes(q)
        );
        this.renderQuickLinksView(null, filtered);
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
        } else if (sectionKey === 'leadership') {
          item = this.getAllLeadershipItems().find(i => i.id === itemId || `leader_${i._index}` === itemId);
        } else if (sectionKey === 'quickLinks') {
          item = this.getAllQuickLinkItems().find(i => i.id === itemId || String(i.id) === String(itemId));
        } else if (sectionKey === 'quickEvents') {
          item = this.getAllQuickEventItems().find(i => i.id === itemId || String(i.id) === String(itemId));
        } else if (sectionKey === 'giveAccounts') {
          item = this.getAllGivingAccounts().find(i => i.id === itemId || String(i.id) === String(itemId));
        } else if (sectionKey === 'giveProjects') {
          item = this.getAllGivingProjects().find(i => i.id === itemId || String(i.id) === String(itemId));
        }
      }

      const isSS = isSundaySchoolOverride || (item && (item.category === 'Sunday School' || item.type === 'Sunday School Outline' || item.isSundaySchool));
      editingState.isSundaySchool = Boolean(isSS);
      editingState.itemData = item ? JSON.parse(JSON.stringify(item)) : {};

      const titleEl = document.getElementById('adminModalTitle');
      if (titleEl) {
        if (sectionKey === 'publications' && editingState.isSundaySchool) {
          titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} Sunday School Reading (Immersive Outline)`;
        } else if (sectionKey === 'leadership') {
          titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} Leader / Personnel`;
        } else if (sectionKey === 'quickLinks') {
          titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} Quick Link`;
        } else if (sectionKey === 'quickEvents') {
          titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} Regular Service / Major Event`;
        } else if (sectionKey === 'giveAccounts') {
          titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} Church Bank Account`;
        } else if (sectionKey === 'giveProjects') {
          titleEl.textContent = `${itemId ? 'Edit' : 'Add New'} Special Project Campaign`;
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
     * Shows only the structured fields relevant to the selected publication type.
     */
    updatePublicationEntryFields() {
      const category = document.getElementById('modalField_category')?.value || 'devotion';

      document.querySelectorAll('[data-publication-entry-type]').forEach(section => {
        const allowed = String(section.dataset.publicationEntryType || '')
          .split(',')
          .map(value => value.trim());

        section.hidden = !allowed.includes(category);
      });

      const typeLabel = document.getElementById('publicationEntryTypeLabel');
      if (typeLabel) {
        const labels = {
          devotion: 'Morning Devotion',
          goodnews: 'Goodnews This Week',
          'sunday-school': 'Sunday School Blog Post',
          'Goodnews Weekly': 'Legacy Goodnews Issue',
          Books: 'Book / General Publication',
          Magazines: 'Magazine / General Publication'
        };
        typeLabel.textContent = labels[category] || 'Publication';
      }

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
          // Standardized Publication Entry Form
          const raw = item._raw || item || {};
          const category = raw.category || item.category || 'devotion';
          const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
          const details = raw.details || {};
          const devotion = raw.devotion || {};
          const goodnews = raw.goodnews || {};

          const scriptureBlock = blocks.find(block => block.type === 'scripture') || {};
          const headingBlock = blocks.find(block => block.type === 'heading') || {};
          const leadBlock = blocks.find(block => block.type === 'lead') || {};
          const calloutBlock = blocks.find(block => block.type === 'callout') || {};
          const paragraphText = blocks
            .filter(block => block.type === 'paragraph')
            .map(block => block.text || '')
            .filter(Boolean)
            .join('\n\n');

          const tagsText = Array.isArray(raw.tags) ? raw.tags.join(', ') : '';
          const ministersText = Array.isArray(goodnews.nextWeekMinisters)
            ? goodnews.nextWeekMinisters
                .map(entry => `${entry.label || ''}: ${entry.value || ''}`)
                .join('\n')
            : '';
          const meditationText = Array.isArray(goodnews.bibleMeditation)
            ? goodnews.bibleMeditation
                .map(entry => `${entry.day || ''}: ${entry.reading || ''}`)
                .join('\n')
            : '';

          html = `
            <div class="admin-publication-entry-banner">
              <div>
                <span class="admin-publication-entry-kicker">Structured Publication Entry</span>
                <strong id="publicationEntryTypeLabel">Publication</strong>
                <small>Shared publishing details first, then fields specific to the selected publication type.</small>
              </div>
              <button type="button" class="btn btn-primary admin-btn-sm" onclick="AdminPortal.togglePublicationEditorFormat(true)">
                📖 Sunday School Immersive Editor
              </button>
            </div>

            <div class="admin-publication-entry-section">
              <div class="admin-publication-entry-heading">
                <span>1</span>
                <div>
                  <strong>Publishing details</strong>
                  <small>These fields are standardized across Morning Devotion and Goodnews This Week.</small>
                </div>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Publication Type</label>
                  <select id="modalField_category" class="admin-select" style="width:100%;"
                    onchange="AdminPortal.updatePublicationEntryFields()">
                    <option value="devotion" ${category === 'devotion' ? 'selected' : ''}>Morning Devotion</option>
                    <option value="goodnews" ${category === 'goodnews' ? 'selected' : ''}>Goodnews This Week</option>
                    <option value="sunday-school" ${category === 'sunday-school' ? 'selected' : ''}>Sunday School Blog Post</option>
                    <option value="Goodnews Weekly" ${category === 'Goodnews Weekly' ? 'selected' : ''}>Legacy Goodnews Issue</option>
                    <option value="Books" ${category === 'Books' ? 'selected' : ''}>Book / General Publication</option>
                    <option value="Magazines" ${category === 'Magazines' ? 'selected' : ''}>Magazine / General Publication</option>
                  </select>
                </div>
                <div class="admin-input-group">
                  <label>Publish Date</label>
                  <input type="date" id="modalField_date" class="admin-input"
                    value="${raw.date || item.date || ''}">
                </div>
              </div>

              <div class="admin-input-group">
                <label>Title</label>
                <input type="text" id="modalField_title" class="admin-input"
                  value="${raw.title || item.title || ''}" required
                  placeholder="Publication title">
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Publication ID</label>
                  <input type="text" id="modalField_id" class="admin-input"
                    value="${raw.id || item.id || 'publication-' + Date.now()}" required>
                </div>
                <div class="admin-input-group">
                  <label>Slug / URL Name</label>
                  <input type="text" id="modalField_slug" class="admin-input"
                    value="${raw.slug || item.slug || ''}"
                    placeholder="auto-generated-from-title">
                </div>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Author / Publishing Team</label>
                  <input type="text" id="modalField_author" class="admin-input"
                    value="${raw.author || item.author || 'Peculiar Cherubs Publications'}">
                </div>
                <div class="admin-input-group">
                  <label>Tags <small>(comma separated)</small></label>
                  <input type="text" id="modalField_tags" class="admin-input"
                    value="${tagsText}" placeholder="Mercy, Restoration, Prayer">
                </div>
              </div>

              <div class="admin-input-group">
                <label>Excerpt / Short Summary</label>
                <textarea id="modalField_description" class="admin-textarea"
                  placeholder="Short summary shown on publication cards.">${raw.excerpt || item.description || ''}</textarea>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Cover Theme</label>
                  <select id="modalField_coverTheme" class="admin-select" style="width:100%;">
                    <option value="navy" ${(raw.cover?.theme || '') === 'navy' ? 'selected' : ''}>Navy</option>
                    <option value="yellow" ${(raw.cover?.theme || '') === 'yellow' ? 'selected' : ''}>Yellow</option>
                    <option value="red" ${(raw.cover?.theme || '') === 'red' ? 'selected' : ''}>Red</option>
                    <option value="sky" ${(raw.cover?.theme || '') === 'sky' ? 'selected' : ''}>Sky</option>
                  </select>
                </div>
                <div class="admin-input-group">
                  <label>Cover Monogram / Issue Number</label>
                  <input type="text" id="modalField_coverMonogram" class="admin-input"
                    value="${raw.cover?.monogram || ''}" placeholder="e.g. 19 or 32">
                </div>
              </div>
            </div>

            <!-- Morning Devotion -->
            <div class="admin-publication-entry-section" data-publication-entry-type="devotion">
              <div class="admin-publication-entry-heading">
                <span>2</span>
                <div>
                  <strong>Scripture & reflection</strong>
                  <small>The devotional body follows one consistent reading flow.</small>
                </div>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Key Verse Reference</label>
                  <input type="text" id="modalField_devotionVerseRef" class="admin-input"
                    value="${scriptureBlock.reference || devotion.keyVerse || ''}"
                    placeholder="Isaiah 54:7">
                </div>
                <div class="admin-input-group">
                  <label>Reading Time</label>
                  <input type="text" id="modalField_readingTime" class="admin-input"
                    value="${details.readingTime || '4 minutes'}">
                </div>
              </div>

              <div class="admin-input-group">
                <label>Key Verse Text</label>
                <textarea id="modalField_devotionVerseText" class="admin-textarea"
                  placeholder="Enter the scripture text.">${scriptureBlock.text || ''}</textarea>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Devotional Series</label>
                  <input type="text" id="modalField_devotionSeries" class="admin-input"
                    value="${details.series || ''}" placeholder="My Year of Great Mercies">
                </div>
                <div class="admin-input-group">
                  <label>Reflection Heading</label>
                  <input type="text" id="modalField_reflectionHeading" class="admin-input"
                    value="${headingBlock.text || ''}" placeholder="Mercy does not abandon the story">
                </div>
              </div>

              <div class="admin-input-group">
                <label>Reflection Body <small>(separate paragraphs with a blank line)</small></label>
                <textarea id="modalField_articleBody" class="admin-textarea admin-textarea-tall"
                  placeholder="Write the devotional reflection here...">${paragraphText}</textarea>
              </div>

              <div class="admin-publication-subsection">
                <strong>Today’s truth</strong>
                <div class="admin-modal-grid-2">
                  <div class="admin-input-group">
                    <label>Truth / Callout Title</label>
                    <input type="text" id="modalField_calloutTitle" class="admin-input"
                      value="${calloutBlock.title || ''}" placeholder="Mercy gathers what pain scattered.">
                  </div>
                  <div class="admin-input-group">
                    <label>Truth / Callout Text</label>
                    <input type="text" id="modalField_calloutText" class="admin-input"
                      value="${calloutBlock.text || ''}" placeholder="Receive God’s restoring grace...">
                  </div>
                </div>
              </div>

              <div class="admin-publication-subsection">
                <strong>Response to the Word</strong>
                <div class="admin-input-group">
                  <label>Prayer</label>
                  <textarea id="modalField_devotionPrayer" class="admin-textarea">${devotion.prayer || ''}</textarea>
                </div>
                <div class="admin-input-group">
                  <label>Declaration</label>
                  <textarea id="modalField_devotionDeclaration" class="admin-textarea">${devotion.declaration || ''}</textarea>
                </div>
                <div class="admin-input-group">
                  <label>Action Point</label>
                  <textarea id="modalField_devotionAction" class="admin-textarea">${devotion.actionPoint || ''}</textarea>
                </div>
              </div>
            </div>

            <!-- Goodnews This Week -->
            <div class="admin-publication-entry-section" data-publication-entry-type="goodnews">
              <div class="admin-publication-entry-heading">
                <span>2</span>
                <div>
                  <strong>Edition details & main message</strong>
                  <small>Goodnews follows a consistent weekly-edition structure.</small>
                </div>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Volume</label>
                  <input type="text" id="modalField_goodnewsVolume" class="admin-input"
                    value="${details.volume || ''}" placeholder="21">
                </div>
                <div class="admin-input-group">
                  <label>Issue</label>
                  <input type="text" id="modalField_goodnewsIssue" class="admin-input"
                    value="${details.issue || ''}" placeholder="32">
                </div>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Edition / Week</label>
                  <input type="text" id="modalField_goodnewsEdition" class="admin-input"
                    value="${details.edition || ''}" placeholder="Week 28">
                </div>
                <div class="admin-input-group">
                  <label>Key Text</label>
                  <input type="text" id="modalField_goodnewsKeyText" class="admin-input"
                    value="${details.keyText || ''}" placeholder="Romans 8:30">
                </div>
              </div>

              <div class="admin-input-group">
                <label>Monthly Theme</label>
                <input type="text" id="modalField_goodnewsMonthlyTheme" class="admin-input"
                  value="${details.monthlyTheme || ''}">
              </div>

              <div class="admin-input-group">
                <label>Occasion / Service Context</label>
                <input type="text" id="modalField_goodnewsOccasion" class="admin-input"
                  value="${details.occasion || ''}">
              </div>

              <div class="admin-input-group">
                <label>Opening / Lead Paragraph</label>
                <textarea id="modalField_goodnewsLead" class="admin-textarea admin-textarea-tall"
                  placeholder="Opening greeting and introduction...">${leadBlock.text || ''}</textarea>
              </div>

              <div class="admin-input-group">
                <label>Main Message <small>(separate paragraphs with a blank line)</small></label>
                <textarea id="modalField_articleBody" class="admin-textarea admin-textarea-xl"
                  placeholder="Enter the full Goodnews sermon/message body...">${paragraphText}</textarea>
              </div>

              <div class="admin-publication-subsection">
                <strong>Sermon focus</strong>
                <div class="admin-modal-grid-2">
                  <div class="admin-input-group">
                    <label>Focus Title</label>
                    <input type="text" id="modalField_calloutTitle" class="admin-input"
                      value="${calloutBlock.title || raw.title || ''}">
                  </div>
                  <div class="admin-input-group">
                    <label>Focus Text / Key Text</label>
                    <input type="text" id="modalField_calloutText" class="admin-input"
                      value="${calloutBlock.text || (details.keyText ? 'Key text: ' + details.keyText : '')}">
                  </div>
                </div>
              </div>

              <div class="admin-publication-subsection">
                <strong>Inside this edition</strong>
                <div class="admin-modal-grid-2">
                  <div class="admin-input-group">
                    <label>Sunday School Topic</label>
                    <input type="text" id="modalField_goodnewsSundayTopic" class="admin-input"
                      value="${goodnews.sundaySchool?.topic || ''}">
                  </div>
                  <div class="admin-input-group">
                    <label>Sunday School Text</label>
                    <input type="text" id="modalField_goodnewsSundayText" class="admin-input"
                      value="${goodnews.sundaySchool?.text || ''}">
                  </div>
                </div>

                <div class="admin-modal-grid-2">
                  <div class="admin-input-group">
                    <label>Special Service Label</label>
                    <input type="text" id="modalField_goodnewsServiceLabel" class="admin-input"
                      value="${goodnews.specialService?.label || ''}" placeholder="Monthly Vigil">
                  </div>
                  <div class="admin-input-group">
                    <label>Special Service Topic</label>
                    <input type="text" id="modalField_goodnewsServiceTopic" class="admin-input"
                      value="${goodnews.specialService?.topic || ''}">
                  </div>
                </div>

                <div class="admin-modal-grid-2">
                  <div class="admin-input-group">
                    <label>Special Service Scripture</label>
                    <input type="text" id="modalField_goodnewsServiceText" class="admin-input"
                      value="${goodnews.specialService?.text || ''}">
                  </div>
                  <div class="admin-input-group">
                    <label>Revivalist / Minister</label>
                    <input type="text" id="modalField_goodnewsRevivalist" class="admin-input"
                      value="${goodnews.specialService?.revivalist || ''}">
                  </div>
                </div>
              </div>

              <div class="admin-publication-subsection">
                <strong>Next week’s ministers</strong>
                <div class="admin-input-group">
                  <label>One entry per line <small>Label: Name / Value</small></label>
                  <textarea id="modalField_goodnewsMinisters" class="admin-textarea"
                    placeholder="Minister for the Week: Evangelist...\nWorship Leader: ...">${ministersText}</textarea>
                </div>
              </div>

              <div class="admin-publication-subsection">
                <strong>Bible meditation</strong>
                <div class="admin-input-group">
                  <label>One entry per line <small>Day: Reading</small></label>
                  <textarea id="modalField_goodnewsMeditation" class="admin-textarea"
                    placeholder="Monday: Isaiah 32–34\nTuesday: Isaiah 35–37">${meditationText}</textarea>
                </div>
              </div>
            </div>

            <!-- Other / legacy publication types -->
            <div class="admin-publication-entry-section"
              data-publication-entry-type="sunday-school,Goodnews Weekly,Books,Magazines">
              <div class="admin-publication-entry-heading">
                <span>2</span>
                <div>
                  <strong>General publication details</strong>
                  <small>Used for legacy or non-standard publication formats.</small>
                </div>
              </div>

              <div class="admin-modal-grid-2">
                <div class="admin-input-group">
                  <label>Cover Image Path</label>
                  <input type="text" id="modalField_coverImage" class="admin-input"
                    value="${item.coverImage || 'assets/hero/mother-church-brand.jpg'}">
                </div>
                <div class="admin-input-group">
                  <label>PDF Download Path / URL</label>
                  <input type="text" id="modalField_pdfUrl" class="admin-input"
                    value="${item.pdfUrl || ''}">
                </div>
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
      } else if (sectionKey === 'leadership') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Personnel ID / Key</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'leader_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Leadership Position / Title</label>
              <input type="text" id="modalField_position" class="admin-input" value="${item.position || ''}" placeholder="e.g. Senior Pastor, Pastor, Deacon, Deaconess" required>
            </div>
          </div>
          <div class="admin-input-group">
            <label>Full Name</label>
            <input type="text" id="modalField_name" class="admin-input" value="${item.name || ''}" placeholder="e.g. Pastor John Doe" required>
          </div>
          <div class="admin-input-group">
            <label>Portrait Photo Path / URL (Optional)</label>
            <input type="text" id="modalField_image" class="admin-input" value="${item.image || ''}" placeholder="e.g. assets/people/senior-pastor.jpg">
            <small style="color: var(--muted); font-size: 0.8rem; display: block; margin-top: 0.35rem;">
              💡 If left blank, the website will automatically generate an elegant monogram avatar badge with the leader's initials.
            </small>
          </div>
        `;
      } else if (sectionKey === 'quickLinks') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Link ID</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'ql_link_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Icon / Emoji Symbol</label>
              <input type="text" id="modalField_icon" class="admin-input" value="${item.icon || '🔗'}" placeholder="e.g. 📰, ▶, ◉, ↗, ✦, ☏, ⌁" required>
              <div class="admin-emoji-chips">
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='📰'; AdminPortal.updateModalLivePreview();">📰</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='▶'; AdminPortal.updateModalLivePreview();">▶</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='◉'; AdminPortal.updateModalLivePreview();">◉</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='↗'; AdminPortal.updateModalLivePreview();">↗</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='✦'; AdminPortal.updateModalLivePreview();">✦</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='☏'; AdminPortal.updateModalLivePreview();">☏</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='⌁'; AdminPortal.updateModalLivePreview();">⌁</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='📖'; AdminPortal.updateModalLivePreview();">📖</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='💬'; AdminPortal.updateModalLivePreview();">💬</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='🤝'; AdminPortal.updateModalLivePreview();">🤝</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='⛪'; AdminPortal.updateModalLivePreview();">⛪</span>
                <span class="admin-emoji-chip" onclick="document.getElementById('modalField_icon').value='🕊️'; AdminPortal.updateModalLivePreview();">🕊️</span>
              </div>
            </div>
          </div>
          <div class="admin-input-group">
            <label>Quick Link Title</label>
            <input type="text" id="modalField_title" class="admin-input" value="${item.title || ''}" placeholder="e.g. Goodnews This Week, Watch Live, Plan a Visit" required>
          </div>
          <div class="admin-input-group">
            <label>Target Page Link / Destination URL</label>
            <input type="text" id="modalField_href" class="admin-input" value="${item.href || ''}" placeholder="e.g. publications.html, chapels.html, ministries.html, #" required>
            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.4rem;">
              <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_href').value='publications.html'; AdminPortal.updateModalLivePreview();">publications.html</button>
              <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_href').value='events.html'; AdminPortal.updateModalLivePreview();">events.html</button>
              <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_href').value='chapels.html'; AdminPortal.updateModalLivePreview();">chapels.html</button>
              <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_href').value='ministries.html'; AdminPortal.updateModalLivePreview();">ministries.html</button>
              <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_href').value='give.html'; AdminPortal.updateModalLivePreview();">give.html</button>
              <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_href').value='#'; AdminPortal.updateModalLivePreview();"># (Placeholder)</button>
            </div>
          </div>
          <div class="admin-input-group" style="margin-bottom: 0;">
            <label>Supporting Text / Description</label>
            <textarea id="modalField_text" class="admin-textarea" placeholder="Brief description displayed on the card..." required>${item.text || ''}</textarea>
          </div>
        `;
      } else if (sectionKey === 'quickEvents') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Service / Event ID</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'ql_event_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Frequency & Schedule Timing</label>
              <input type="text" id="modalField_frequency" class="admin-input" value="${item.frequency || ''}" placeholder="e.g. Sunday · 07:00–08:50 or Wednesday · 18:00–19:30" required>
            </div>
          </div>
          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: -0.5rem; margin-bottom: 1.25rem;">
            <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_frequency').value='Sunday · 07:00–08:50'; AdminPortal.updateModalLivePreview();">Sunday Morning</button>
            <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_frequency').value='Sunday · 10:00–12:00'; AdminPortal.updateModalLivePreview();">Sunday Traditional</button>
            <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_frequency').value='Wednesday · 18:00–19:30'; AdminPortal.updateModalLivePreview();">Mid-Week Service</button>
            <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_frequency').value='Tuesday · 18:00–19:00'; AdminPortal.updateModalLivePreview();">Prayer Clinic</button>
            <button type="button" class="btn btn-secondary admin-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="document.getElementById('modalField_frequency').value='Saturday · 06:00–07:00'; AdminPortal.updateModalLivePreview();">Monthly Anointing</button>
          </div>
          <div class="admin-input-group">
            <label>Service / Event Title</label>
            <input type="text" id="modalField_title" class="admin-input" value="${item.title || ''}" placeholder="e.g. Prayer Clinic, Mid-Week Service, Shiloh Prayer Service" required>
          </div>
          <div class="admin-input-group" style="margin-bottom: 0;">
            <label>Descriptive Note / Context</label>
            <textarea id="modalField_text" class="admin-textarea" placeholder="e.g. Part of the church’s regular weekly rhythm." required>${item.text || 'Part of the church’s regular weekly rhythm.'}</textarea>
          </div>
        `;
      } else if (sectionKey === 'giveAccounts') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Account ID / Key</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'acc_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Currency</label>
              <select id="modalField_currency" class="admin-select" style="width: 100%;">
                <option value="NGN" ${(item.currency || 'NGN') === 'NGN' ? 'selected' : ''}>₦ NGN (Nigerian Naira)</option>
                <option value="USD" ${(item.currency || 'NGN') === 'USD' ? 'selected' : ''}>$ USD (US Dollar)</option>
                <option value="GBP" ${(item.currency || 'NGN') === 'GBP' ? 'selected' : ''}>£ GBP (British Pound)</option>
                <option value="EUR" ${(item.currency || 'NGN') === 'EUR' ? 'selected' : ''}>€ EUR (Euro)</option>
              </select>
            </div>
          </div>
          <div class="admin-input-group">
            <label>Account Title / Purpose</label>
            <input type="text" id="modalField_title" class="admin-input" value="${item.title || ''}" placeholder="e.g. Main Ministry Account (Tithes & Offerings) or Building Fund" required>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Bank Name</label>
              <input type="text" id="modalField_bankName" class="admin-input" value="${item.bankName || ''}" placeholder="e.g. Zenith Bank Plc" required>
            </div>
            <div class="admin-input-group">
              <label>Account Number (NUBAN / IBAN)</label>
              <input type="text" id="modalField_accountNumber" class="admin-input" value="${item.accountNumber || ''}" placeholder="e.g. 1012345678" style="font-family: ui-monospace, monospace; font-weight: 700;" required>
            </div>
          </div>
          <div class="admin-input-group">
            <label>Account Name</label>
            <input type="text" id="modalField_accountName" class="admin-input" value="${item.accountName || 'Peculiar Cherubs Ministries'}" placeholder="e.g. Peculiar Cherubs Ministries" required>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Sort Code (Optional)</label>
              <input type="text" id="modalField_sortCode" class="admin-input" value="${item.sortCode || ''}" placeholder="e.g. 057150013">
            </div>
            <div class="admin-input-group">
              <label>SWIFT / BIC Code (For FX Accounts)</label>
              <input type="text" id="modalField_swiftCode" class="admin-input" value="${item.swiftCode || ''}" placeholder="e.g. ZEBLNGLA">
            </div>
          </div>
          <div class="admin-input-group">
            <label for="modalField_isPrimary" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="modalField_isPrimary" ${item.isPrimary ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
              <span style="font-weight: 700; color: var(--navy);">Set as Primary Account for this currency</span>
            </label>
          </div>
          <div class="admin-input-group" style="margin-bottom: 0;">
            <label>Narration Guidance for Givers</label>
            <textarea id="modalField_narrationGuide" class="admin-textarea" placeholder="e.g. Include your Full Name and Purpose (e.g. 'Ezekiel Ade - Tithe')">${item.narrationGuide || ''}</textarea>
          </div>
        `;
      } else if (sectionKey === 'giveProjects') {
        html = `
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Project ID</label>
              <input type="text" id="modalField_id" class="admin-input" value="${item.id || 'project_' + Date.now()}" required>
            </div>
            <div class="admin-input-group">
              <label>Category / Sector Tag</label>
              <input type="text" id="modalField_category" class="admin-input" value="${item.category || 'Building Fund'}" placeholder="e.g. Building Fund, Charity & Welfare, Education, Missions" required>
            </div>
          </div>
          <div class="admin-modal-grid-2">
            <div class="admin-input-group">
              <label>Project Campaign Title</label>
              <input type="text" id="modalField_title" class="admin-input" value="${item.title || ''}" placeholder="e.g. Chapel Expansion & Building Project" required>
            </div>
            <div class="admin-input-group">
              <label>Badge Label (Optional)</label>
              <input type="text" id="modalField_badge" class="admin-input" value="${item.badge || ''}" placeholder="e.g. Priority Project, Active Outreach">
            </div>
          </div>
          <div class="admin-input-group" style="margin-bottom: 0;">
            <label>Project Mission & Goal Description</label>
            <textarea id="modalField_description" class="admin-textarea" placeholder="Detailed summary of the initiative and how donations are utilized..." required>${item.description || ''}</textarea>
          </div>
        `;
      }

      container.innerHTML = html;

      if (sectionKey === 'publications' && !editingState.isSundaySchool) {
        this.updatePublicationEntryFields();
      }
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
          const category = getF('category') || 'devotion';
          const labelMap = {
            devotion: 'Morning Devotion',
            goodnews: 'Goodnews This Week',
            'sunday-school': 'Sunday School',
            'Goodnews Weekly': 'Legacy Goodnews Issue',
            Books: 'Book',
            Magazines: 'Magazine'
          };

          const detailLine = category === 'devotion'
            ? `${getF('devotionVerseRef') || 'Key verse'} · ${getF('readingTime') || 'Reading time'}`
            : category === 'goodnews'
              ? `${getF('goodnewsEdition') || 'Weekly edition'} · ${getF('goodnewsKeyText') || 'Key text'}`
              : (getF('date') || 'Publication');

          box.innerHTML = `
            <div class="card publication-card" style="border: 1px solid var(--admin-border); border-radius: 16px; overflow: hidden; background: #fff;">
              <div style="padding: 1.25rem;">
                <span class="eyebrow">${labelMap[category] || category}</span>
                <h4 style="font-family: Fraunces, serif; font-size: 1.2rem; color: var(--navy); margin: 0.4rem 0;">${getF('title') || 'Publication Title'}</h4>
                <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 0.75rem;">${getF('description') || 'Publication excerpt preview...'}</p>
                <div style="font-size: 0.78rem; color: var(--red); font-weight: 700; margin-bottom: .4rem;">${detailLine}</div>
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
      } else if (sec === 'leadership') {
        const name = getF('name') || 'Leader Name';
        const position = getF('position') || 'Position / Title';
        const img = getF('image');
        const initials = name
          .split(/[\s,()]+/)
          .filter(Boolean)
          .slice(0, 2)
          .map(w => w[0].toUpperCase())
          .join('') || 'LP';

        box.innerHTML = `
          <div style="background: linear-gradient(160deg, #0e1a3d 0%, #162249 55%, #1c2c5c 100%); border-radius: 20px; padding: 2rem 1.5rem; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative;">
            <div style="width: 120px; height: 120px; border-radius: 50%; overflow: hidden; margin-bottom: 1rem; border: 3px solid var(--yellow); box-shadow: 0 6px 18px rgba(0,0,0,0.35); background: #1c2c5c; display: grid; place-items: center;">
              ${img
                ? `<img src="../${img}" alt="${name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';"><span style="display:none; color:var(--yellow); font-family:'Fraunces',serif; font-size:2rem; font-weight:700;">${initials}</span>`
                : `<span style="color: var(--yellow); font-family: 'Fraunces', serif; font-size: 2rem; font-weight: 700;">${initials}</span>`
              }
            </div>
            <strong style="font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; color: var(--white); margin-bottom: 0.35rem; line-height: 1.2;">${name}</strong>
            <span style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--yellow);">${position}</span>
          </div>
        `;
      } else if (sec === 'quickLinks') {
        const icon = getF('icon') || '🔗';
        const title = getF('title') || 'Quick Link Title';
        const text = getF('text') || 'Quick link supporting description preview...';
        const href = getF('href') || '#';

        box.innerHTML = `
          <div style="background: #ffffff; border: 2px solid var(--admin-border); border-radius: 18px; padding: 1.5rem; display: flex; gap: 1.25rem; align-items: flex-start; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
            <div style="width: 54px; height: 54px; border-radius: 14px; background: var(--sky); color: var(--navy); display: grid; place-items: center; font-size: 1.6rem; flex-shrink: 0; border: 1px solid rgba(22, 34, 73, 0.08);">
              ${icon}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.75rem; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.25rem;">Useful Link Preview</div>
              <h3 style="margin: 0 0 0.4rem; font-family: 'Fraunces', serif; font-size: 1.25rem; color: var(--navy);">${title}</h3>
              <p style="margin: 0 0 0.65rem; font-size: 0.9rem; color: var(--muted); line-height: 1.45;">${text}</p>
              <div style="font-size: 0.82rem; font-weight: 700; color: var(--red);">
                Target URL: <span style="text-decoration: underline; color: var(--navy);">${href}</span>
              </div>
            </div>
          </div>
        `;
      } else if (sec === 'quickEvents') {
        const freq = getF('frequency') || 'Sunday · 09:00–10:00';
        const title = getF('title') || 'Regular Service / Event';
        const text = getF('text') || 'Part of the church’s regular weekly rhythm.';

        box.innerHTML = `
          <article class="card" style="background: #ffffff; border: 1px solid var(--admin-border); border-radius: 18px; padding: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
            <div style="display: inline-block; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.75rem;">
              🗓️ ${freq}
            </div>
            <h3 style="margin: 0 0 0.5rem; font-family: 'Fraunces', serif; font-size: 1.3rem; color: var(--navy);">${title}</h3>
            <p style="margin: 0; font-size: 0.92rem; color: var(--muted); line-height: 1.5;">${text}</p>
          </article>
        `;
      } else if (sec === 'giveAccounts') {
        const curr = getF('currency') || 'NGN';
        const title = getF('title') || 'Main Ministry Account';
        const bank = getF('bankName') || 'Zenith Bank Plc';
        const accNum = getF('accountNumber') || '1012345678';
        const accName = getF('accountName') || 'Peculiar Cherubs Ministries';
        const isPrim = document.getElementById('modalField_isPrimary')?.checked;
        const sort = getF('sortCode');
        const swift = getF('swiftCode');
        const guide = getF('narrationGuide');

        box.innerHTML = `
          <div style="background: var(--navy); color: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 10px 25px rgba(11,27,61,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem;">
              <h4 style="margin: 0; color: #fff; font-size: 1.05rem;">${title}</h4>
              <div style="display: flex; gap: 0.35rem;">
                <span style="font-size: 0.7rem; font-weight: 800; background: rgba(255,255,255,0.2); color: #fff; padding: 0.15rem 0.5rem; border-radius: 999px;">${curr}</span>
                ${isPrim ? '<span style="font-size: 0.7rem; font-weight: 800; background: rgba(229,169,60,0.2); color: var(--yellow); padding: 0.15rem 0.5rem; border-radius: 999px;">Primary</span>' : ''}
              </div>
            </div>
            <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); margin-bottom: 0.75rem;">${bank}</div>
            <div style="background: rgba(0,0,0,0.25); border-radius: 8px; padding: 0.6rem 0.85rem; margin-bottom: 0.65rem; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-family: monospace; font-size: 1.25rem; font-weight: 800; color: var(--yellow); letter-spacing: 0.08em;">${accNum}</span>
              <span style="font-size: 0.75rem; background: rgba(255,255,255,0.15); color: #fff; padding: 0.25rem 0.6rem; border-radius: 4px;">📋 Copy</span>
            </div>
            <div style="font-size: 0.82rem; color: rgba(255,255,255,0.8); margin-bottom: 0.35rem;">
              Account Name: <strong>${accName}</strong>
              ${sort ? `<br>Sort Code: <strong>${sort}</strong>` : ''}
              ${swift ? `<br>SWIFT: <strong>${swift}</strong>` : ''}
            </div>
            ${guide ? `<div style="font-size: 0.78rem; color: rgba(255,255,255,0.55); font-style: italic;">${guide}</div>` : ''}
          </div>
        `;
      } else if (sec === 'giveProjects') {
        const cat = getF('category') || 'Building Fund';
        const title = getF('title') || 'Special Project Campaign';
        const badge = getF('badge') || 'Active Project';
        const desc = getF('description') || 'Project mission description preview...';

        box.innerHTML = `
          <div style="background: var(--navy); color: white; border-radius: 14px; padding: 1.25rem; border: 1px solid rgba(255,255,255,0.15);">
            <div style="display: flex; gap: 0.4rem; margin-bottom: 0.4rem;">
              <span style="font-size: 0.68rem; font-weight: 800; text-transform: uppercase; background: rgba(229,169,60,0.2); color: var(--yellow); padding: 0.15rem 0.5rem; border-radius: 999px;">${cat}</span>
              ${badge ? `<span style="font-size: 0.68rem; font-weight: 800; text-transform: uppercase; background: rgba(255,255,255,0.15); color: #fff; padding: 0.15rem 0.5rem; border-radius: 999px;">${badge}</span>` : ''}
            </div>
            <h4 style="margin: 0 0 0.4rem; color: #fff; font-size: 1.1rem;">${title}</h4>
            <p style="margin: 0 0 0.85rem; font-size: 0.85rem; color: rgba(255,255,255,0.72); line-height: 1.45;">${desc}</p>
            <button type="button" style="background: var(--yellow); color: var(--navy); border: none; font-weight: 800; font-size: 0.78rem; padding: 0.4rem 0.85rem; border-radius: 999px;">
              Give to this Project ↗
            </button>
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
          if (
            editingState.itemData?._sourceGroup === 'blog' ||
            ['devotion', 'goodnews', 'sunday-school'].includes(category)
          ) {
            if (!currentContent.publications.blog) {
              currentContent.publications.blog = { categories: [], posts: [] };
            }
            if (!Array.isArray(currentContent.publications.blog.posts)) {
              currentContent.publications.blog.posts = [];
            }

            const existingIdx = currentContent.publications.blog.posts.findIndex(
              p => p.id === editingState.itemId || p.id === id || p.slug === editingState.itemData?.slug
            );
            const existing = existingIdx >= 0
              ? currentContent.publications.blog.posts[existingIdx]
              : (editingState.itemData?._raw || {});

            const makeSlug = value => String(value || '')
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');

            const parseParagraphs = value => String(value || '')
              .split(/\n\s*\n/)
              .map(text => text.trim())
              .filter(Boolean);

            const parseLabelValueLines = value => String(value || '')
              .split('\n')
              .map(line => line.trim())
              .filter(Boolean)
              .map(line => {
                const separator = line.indexOf(':');
                return separator >= 0
                  ? {
                      label: line.slice(0, separator).trim(),
                      value: line.slice(separator + 1).trim()
                    }
                  : { label: line, value: '' };
              });

            const parseDayReadingLines = value => String(value || '')
              .split('\n')
              .map(line => line.trim())
              .filter(Boolean)
              .map(line => {
                const separator = line.indexOf(':');
                return separator >= 0
                  ? {
                      day: line.slice(0, separator).trim(),
                      reading: line.slice(separator + 1).trim()
                    }
                  : { day: line, reading: '' };
              });

            const typeMap = {
              devotion: 'Daily Morning Devotion',
              goodnews: 'Goodnews This Week',
              'sunday-school': 'Sunday School'
            };
            const templateMap = {
              devotion: 'devotion',
              goodnews: 'goodnews',
              'sunday-school': 'sundaySchool'
            };
            const defaultThemeMap = {
              devotion: 'navy',
              goodnews: 'yellow',
              'sunday-school': 'red'
            };
            const defaultLabelMap = {
              devotion: 'Morning Devotion',
              goodnews: 'Goodnews This Week',
              'sunday-school': 'Sunday School'
            };

            const title = getF('title');
            const description = getF('description');
            const slug = getF('slug') || existing.slug || makeSlug(title) || id;
            const tags = getF('tags')
              ? getF('tags').split(',').map(tag => tag.trim()).filter(Boolean)
              : (Array.isArray(existing.tags) ? existing.tags : []);
            const articleParagraphs = parseParagraphs(getF('articleBody'));

            let blocks = Array.isArray(existing.blocks) ? [...existing.blocks] : [];
            let details = { ...(existing.details || {}) };
            let devotionData = existing.devotion ? { ...existing.devotion } : undefined;
            let goodnewsData = existing.goodnews ? { ...existing.goodnews } : undefined;

            if (category === 'devotion') {
              const verseRef = getF('devotionVerseRef');
              const verseText = getF('devotionVerseText');
              const reflectionHeading = getF('reflectionHeading');
              const calloutTitle = getF('calloutTitle');
              const calloutText = getF('calloutText');

              blocks = [
                ...(verseRef || verseText ? [{
                  type: 'scripture',
                  reference: verseRef,
                  text: verseText
                }] : []),
                ...(reflectionHeading ? [{
                  type: 'heading',
                  text: reflectionHeading
                }] : []),
                ...articleParagraphs.map(text => ({ type: 'paragraph', text })),
                ...(calloutTitle || calloutText ? [{
                  type: 'callout',
                  label: "Today's truth",
                  title: calloutTitle,
                  text: calloutText
                }] : [])
              ];

              details = {
                readingTime: getF('readingTime') || existing.details?.readingTime || '4 minutes',
                series: getF('devotionSeries') || existing.details?.series || ''
              };

              devotionData = {
                keyVerse: verseRef,
                prayer: getF('devotionPrayer'),
                declaration: getF('devotionDeclaration'),
                actionPoint: getF('devotionAction')
              };

              goodnewsData = undefined;
            }

            if (category === 'goodnews') {
              const lead = getF('goodnewsLead');
              const calloutTitle = getF('calloutTitle') || title;
              const calloutText = getF('calloutText') ||
                (getF('goodnewsKeyText') ? `Key text: ${getF('goodnewsKeyText')}` : '');

              blocks = [
                ...(lead ? [{ type: 'lead', text: lead }] : []),
                ...(calloutTitle || calloutText ? [{
                  type: 'callout',
                  label: 'Sermon focus',
                  title: calloutTitle,
                  text: calloutText
                }] : []),
                ...articleParagraphs.map(text => ({ type: 'paragraph', text }))
              ];

              details = {
                volume: getF('goodnewsVolume'),
                issue: getF('goodnewsIssue'),
                edition: getF('goodnewsEdition'),
                monthlyTheme: getF('goodnewsMonthlyTheme'),
                occasion: getF('goodnewsOccasion'),
                keyText: getF('goodnewsKeyText')
              };

              const sundayTopic = getF('goodnewsSundayTopic');
              const sundayText = getF('goodnewsSundayText');
              const serviceLabel = getF('goodnewsServiceLabel');
              const serviceTopic = getF('goodnewsServiceTopic');
              const serviceText = getF('goodnewsServiceText');
              const revivalist = getF('goodnewsRevivalist');

              goodnewsData = {
                ...(sundayTopic || sundayText ? {
                  sundaySchool: {
                    topic: sundayTopic,
                    text: sundayText
                  }
                } : {}),
                ...(serviceLabel || serviceTopic || serviceText || revivalist ? {
                  specialService: {
                    label: serviceLabel,
                    topic: serviceTopic,
                    text: serviceText,
                    revivalist: revivalist
                  }
                } : {}),
                nextWeekMinisters: parseLabelValueLines(getF('goodnewsMinisters')),
                bibleMeditation: parseDayReadingLines(getF('goodnewsMeditation'))
              };

              devotionData = undefined;
            }

            const blogItem = {
              ...existing,
              id: id,
              slug: slug,
              type: typeMap[category] || existing.type || 'Publication',
              category: category,
              template: templateMap[category] || existing.template || '',
              date: getF('date') || existing.date || new Date().toISOString().slice(0, 10),
              title: title,
              excerpt: description,
              author: getF('author') || existing.author || 'Peculiar Cherubs Publications',
              featured: Boolean(existing.featured),
              tags: tags,
              cover: {
                ...(existing.cover || {}),
                theme: getF('coverTheme') || existing.cover?.theme || defaultThemeMap[category] || 'navy',
                label: defaultLabelMap[category] || existing.cover?.label || 'Publication',
                monogram: getF('coverMonogram') || existing.cover?.monogram || 'PC'
              },
              details: details,
              blocks: blocks
            };

            if (category === 'devotion') {
              blogItem.devotion = devotionData;
              delete blogItem.goodnews;
            } else if (category === 'goodnews') {
              blogItem.goodnews = goodnewsData;
              delete blogItem.devotion;
            }

            if (existingIdx >= 0) {
              currentContent.publications.blog.posts[existingIdx] = blogItem;
            } else {
              currentContent.publications.blog.posts.unshift(blogItem);
            }
          } else if (category === 'Goodnews Weekly' || id.startsWith('issue-')) {
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
      } else if (sec === 'leadership') {
        if (!currentContent.about) currentContent.about = {};
        if (!currentContent.about.leadership) currentContent.about.leadership = { team: [] };
        if (!Array.isArray(currentContent.about.leadership.team)) currentContent.about.leadership.team = [];

        const name = getF('name') || 'Leader Name';
        const position = getF('position') || 'Position / Title';
        const image = getF('image') || '';

        const leaderObj = {
          id: id,
          name: name,
          position: position,
          image: image
        };

        const existingIdx = currentContent.about.leadership.team.findIndex(
          (p, idx) => p.id === editingState.itemId || `leader_${idx}` === editingState.itemId || (editingState.itemId && p.id === id)
        );

        if (existingIdx >= 0) {
          currentContent.about.leadership.team[existingIdx] = leaderObj;
        } else {
          currentContent.about.leadership.team.push(leaderObj);
        }

        await this.syncSectionToSupabase('about', currentContent.about);
        this.renderLeadershipView();
      } else if (sec === 'quickLinks') {
        if (!currentContent.quickLinks) currentContent.quickLinks = {};
        if (!Array.isArray(currentContent.quickLinks.links)) currentContent.quickLinks.links = [];

        const newLink = {
          id: id,
          icon: getF('icon') || '🔗',
          title: getF('title'),
          text: getF('text'),
          href: getF('href') || '#'
        };

        const existingIdx = currentContent.quickLinks.links.findIndex(
          (i, idx) => i.id === editingState.itemId || `ql_link_${idx}` === editingState.itemId || (editingState.itemId && i.id === id)
        );

        if (existingIdx >= 0) {
          currentContent.quickLinks.links[existingIdx] = newLink;
        } else {
          currentContent.quickLinks.links.push(newLink);
        }

        await this.syncSectionToSupabase('quickLinks', currentContent.quickLinks);
        this.renderQuickLinksView();
      } else if (sec === 'quickEvents') {
        if (!currentContent.quickLinks) currentContent.quickLinks = {};
        if (!Array.isArray(currentContent.quickLinks.events)) currentContent.quickLinks.events = [];

        const newEvent = {
          id: id,
          frequency: getF('frequency'),
          title: getF('title'),
          text: getF('text')
        };

        const existingIdx = currentContent.quickLinks.events.findIndex(
          (i, idx) => i.id === editingState.itemId || `ql_event_${idx}` === editingState.itemId || (editingState.itemId && i.id === id)
        );

        if (existingIdx >= 0) {
          currentContent.quickLinks.events[existingIdx] = newEvent;
        } else {
          currentContent.quickLinks.events.push(newEvent);
        }

        await this.syncSectionToSupabase('quickLinks', currentContent.quickLinks);
        this.renderQuickLinksView();
      } else if (sec === 'giveAccounts') {
        if (!currentContent.give) currentContent.give = {};
        if (!Array.isArray(currentContent.give.bankAccounts)) currentContent.give.bankAccounts = [];

        const isPrimary = document.getElementById('modalField_isPrimary')?.checked || false;
        const newAccount = {
          id: id,
          currency: getF('currency') || 'NGN',
          title: getF('title'),
          bankName: getF('bankName'),
          accountName: getF('accountName') || 'Peculiar Cherubs Ministries',
          accountNumber: getF('accountNumber'),
          sortCode: getF('sortCode'),
          swiftCode: getF('swiftCode'),
          isPrimary: isPrimary,
          narrationGuide: getF('narrationGuide')
        };

        if (isPrimary) {
          currentContent.give.bankAccounts.forEach(a => {
            if ((a.currency || 'NGN').toUpperCase() === newAccount.currency.toUpperCase()) {
              a.isPrimary = false;
            }
          });
        }

        const existingIdx = currentContent.give.bankAccounts.findIndex(
          (a, idx) => a.id === editingState.itemId || `acc_${idx}` === editingState.itemId || (editingState.itemId && a.id === id)
        );

        if (existingIdx >= 0) {
          currentContent.give.bankAccounts[existingIdx] = newAccount;
        } else {
          currentContent.give.bankAccounts.push(newAccount);
        }

        await this.syncSectionToSupabase('give', currentContent.give);
        this.renderGivingView();
      } else if (sec === 'giveProjects') {
        if (!currentContent.give) currentContent.give = {};
        if (!Array.isArray(currentContent.give.projects)) currentContent.give.projects = [];

        const newProject = {
          id: id,
          title: getF('title'),
          category: getF('category') || 'Building Fund',
          badge: getF('badge'),
          description: getF('description')
        };

        const existingIdx = currentContent.give.projects.findIndex(
          (p, idx) => p.id === editingState.itemId || `proj_${idx}` === editingState.itemId || (editingState.itemId && p.id === id)
        );

        if (existingIdx >= 0) {
          currentContent.give.projects[existingIdx] = newProject;
        } else {
          currentContent.give.projects.push(newProject);
        }

        await this.syncSectionToSupabase('give', currentContent.give);
        this.renderGivingView();
      }

      this.renderStatsAndBadges();
      this.closeItemModal();
      this.showToast('Item saved live to Supabase DB!', 'success');
    },

    /**
     * Deletes item from section
     */
    async deleteItem(sectionKey, itemId) {
      if (!confirm(`Are you sure you want to delete this ${sectionKey === 'leadership' ? 'leadership personnel' : sectionKey.slice(0, -1)}?`)) {
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

        // Delete from new publication blog posts
        if (pubs.blog && Array.isArray(pubs.blog.posts)) {
          pubs.blog.posts = pubs.blog.posts.filter(
            p => p.id !== itemId && p.slug !== itemId
          );
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
      } else if (sectionKey === 'leadership') {
        if (currentContent.about && currentContent.about.leadership && Array.isArray(currentContent.about.leadership.team)) {
          currentContent.about.leadership.team = currentContent.about.leadership.team.filter(
            (p, idx) => p.id !== itemId && `leader_${idx}` !== itemId
          );
          await this.syncSectionToSupabase('about', currentContent.about);
          this.renderLeadershipView();
        }
      } else if (sectionKey === 'quickLinks') {
        if (currentContent.quickLinks && Array.isArray(currentContent.quickLinks.links)) {
          currentContent.quickLinks.links = currentContent.quickLinks.links.filter(
            (l, idx) => l.id !== itemId && `ql_link_${idx}` !== itemId && String(idx) !== String(itemId)
          );
          await this.syncSectionToSupabase('quickLinks', currentContent.quickLinks);
          this.renderQuickLinksView();
        }
      } else if (sectionKey === 'quickEvents') {
        if (currentContent.quickLinks && Array.isArray(currentContent.quickLinks.events)) {
          currentContent.quickLinks.events = currentContent.quickLinks.events.filter(
            (e, idx) => e.id !== itemId && `ql_event_${idx}` !== itemId && String(idx) !== String(itemId)
          );
          await this.syncSectionToSupabase('quickLinks', currentContent.quickLinks);
          this.renderQuickLinksView();
        }
      } else if (sectionKey === 'giveAccounts') {
        if (currentContent.give && Array.isArray(currentContent.give.bankAccounts)) {
          currentContent.give.bankAccounts = currentContent.give.bankAccounts.filter(
            (a, idx) => a.id !== itemId && `acc_${idx}` !== itemId && String(idx) !== String(itemId)
          );
          await this.syncSectionToSupabase('give', currentContent.give);
          this.renderGivingView();
        }
      } else if (sectionKey === 'giveProjects') {
        if (currentContent.give && Array.isArray(currentContent.give.projects)) {
          currentContent.give.projects = currentContent.give.projects.filter(
            (p, idx) => p.id !== itemId && `proj_${idx}` !== itemId && String(idx) !== String(itemId)
          );
          await this.syncSectionToSupabase('give', currentContent.give);
          this.renderGivingView();
        }
      }

      this.renderStatsAndBadges();
      this.showToast('Item deleted.', 'success');
    },

    /**
     * Persists updated section to Supabase DB
     */
    async syncSectionToSupabase(sectionKey, sectionData) {
      const cfg = global.ContentService ? global.ContentService.config : null;
      if (!cfg) {
        this.showToast('ContentService configuration is unavailable.', 'error');
        return false;
      }

      // UPSERT: update an existing section or create it if it does not exist.
      const endpoint = `${cfg.url}/rest/v1/${cfg.tableName}?on_conflict=key`;

      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': cfg.anonKey,
            'Authorization': `Bearer ${cfg.anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            key: sectionKey,
            data: sectionData
          })
        });

        if (!resp.ok) {
          const detail = await resp.text().catch(() => '');
          console.warn(`[AdminPortal] Supabase upsert for '${sectionKey}' returned status ${resp.status}`, detail);
          this.showToast(`Supabase save failed for '${sectionKey}' (${resp.status}).`, 'error');
          return false;
        }

        console.log(`[AdminPortal] Successfully upserted '${sectionKey}' in Supabase DB.`);
        return true;
      } catch (err) {
        console.error(`[AdminPortal] Error syncing section '${sectionKey}' to Supabase:`, err);
        this.showToast(`Could not save '${sectionKey}' to Supabase.`, 'error');
        return false;
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
