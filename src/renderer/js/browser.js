// browser.js — Main renderer entry point; wires up all modules
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const win = $('#browserWindow');
  const toast = $('#toast');
  let toastTimer;
  let currentView = null;
  let settings = null;

  function notify(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // ---------- Boot sequence ----------
  function boot() {
    // Each step wrapped in try/catch so one failure doesn't kill everything
    function step(name, fn) {
      try { fn(); } catch (e) { console.error('Boot step failed: ' + name, e); }
    }

    step('load-settings', () => { settings = Aether.Storage.loadSettings(); });
    step('history-init', () => Aether.History.init());
    step('bookmarks-init', () => Aether.Bookmarks.init());
    step('shortcuts-init', () => Aether.Shortcuts.init());
    step('downloads-init', () => Aether.Downloads.init());
    step('permissions-init', () => Aether.Permissions.init());
    step('passwords-init', () => Aether.Passwords.init());

    step('navigation-init', () => {
      Aether.Navigation.init(settings, $('#pageArea'));
      if (Aether.Navigation.initPageColorListener) Aether.Navigation.initPageColorListener();
    });
    step('tabs-events', () => {
      Aether.Tabs.events.onRender = renderTabs;
      Aether.Tabs.events.onSwitch = () => Aether.UI.renderPage();
      Aether.Tabs.events.onOpen = (tab) => {};
    });
    step('tabs-init', () => Aether.Tabs.init('home', false));

    // Session restore — wrapped in try/catch so corrupted sessions don't break the app
    step('session-restore', () => {
      const restoredTabs = Aether.Tabs.all().filter(t => t.url && t.view === 'webview');
      if (restoredTabs.length) {
        const active = Aether.Tabs.activeTab();
        if (active && active.url) {
          Aether.Navigation.openUrlIn(active.id, active.url, active.title);
        }
      }
    });

    step('context-menu-init', () => Aether.ContextMenu.init());
    step('find-init', () => Aether.Find.init());
    step('module-events', () => {
      Aether.Shortcuts.events.onRender = renderShortcuts;
      Aether.History.events.onRender = () => { if (currentView === 'history') renderHistory(); };
      Aether.Bookmarks.events.onRender = () => {
        renderBookmarksBar();
        if (currentView === 'bookmarks') renderBookmarksView();
      };
      Aether.Downloads.events.onRender = () => { if (currentView === 'downloads') renderDownloads(); };
    });

    step('search-suggest', () => {
      Aether.SearchSuggest.init($('#addressInput'), $('#suggestionsDropdown'), (url, title) => {
        Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), url, title);
      });
    });

    step('apply-settings', () => applySettings());
    step('settings-handlers', () => initSettingsHandlers());
    step('toolbar-handlers', () => initToolbarHandlers());
    step('context-actions', () => {
      if (window.aether.onContextAction) {
        window.aether.onContextAction(action => {
          if (action.type === 'search') {
            const t = Aether.Tabs.newTab();
            Aether.Navigation.openUrlIn(t.id, action.text);
          } else if (action.type === 'open-link' && action.url) {
            const t = Aether.Tabs.newTab();
            Aether.Navigation.openUrlIn(t.id, action.url);
          }
        });
      }
    });
    step('tabs-bar-handlers', () => initTabsBarHandlers());
    step('window-controls', () => initWindowControls());
    step('keyboard-shortcuts', () => initKeyboardShortcuts());
    step('greeting', () => initGreeting());
    step('bookmark-bar-toggle', () => initBookmarkBarToggle());
    step('clear-data-dialog', () => initClearDataDialog());

    step('render-tabs', () => renderTabs());
    step('render-shortcuts', () => renderShortcuts());
    step('render-bookmarks-bar', () => renderBookmarksBar());
    step('render-page', () => Aether.UI.renderPage());
    step('update-greeting', () => updateGreeting());
    step('weather', () => Aether.Weather.load());

    // GradientWaves — animated WebGL wave background
    step('gradient-waves', () => {
      const bg = document.getElementById('gradientWavesBg');
      if (bg && Aether.GradientWaves) {
        Aether.GradientWaves.init(bg, {
          horizonColor: '#1a1a25',
          waveColor: '#3a3a55',
          crestColor: '#6060a0',
          speed: 0.35,
          amplitude: 2.5,
          waveScale: 0.6,
          relief: 1,
          lightAngle: 120,
          opacity: 0.9,
          brightness: 1.2,
          tilt: 55,
          height: 5.5,
          fogDepth: 15,
          mouseInteraction: true,
          swellOnClick: true,
          quality: 'high',
        });
      }
    });

    // SpecularButton — wrap the AI search form with auto-spinning specular light
    step('specular-button', () => {
      const form = document.getElementById('aiSearchForm');
      if (form && form.dataset.specular !== undefined && Aether.SpecularButton) {
        Aether.SpecularButton.init(form, {
          radius: 42,
          tint: '#ffffff',
          tintOpacity: 0.04,
          textColor: '#f5f5f5',
          lineColor: '#ffffff',
          baseColor: '#3a3a4a',
          intensity: 1,
          idleIntensity: 0.6,
          shineSize: 10,
          shineFade: 34,
          thickness: 1.2,
          glow: 1,
          followMouse: false,
          autoAnimate: true,
          speed: 0.35,
          proximity: 250,
        });
      }
    });

    // Incognito indicator
    if (window.aether.isIncognito()) {
      document.body.classList.add('incognito');
      // Add 'Spy mode' text after the greeting
      const greeting = document.getElementById('greeting');
      if (greeting) {
        const spy = document.createElement('span');
        spy.textContent = ', Spy mode';
        spy.style.cssText = 'font-size:1em;font-weight:inherit;opacity:0.7;margin-left:12px;';
        greeting.appendChild(spy);
      }
      notify('You\'re in Spy mode. Aether won\'t save your activity.');
    }
  }

  // ---------- UI namespace ----------
  window.Aether = window.Aether || {};
  Aether.UI = {
    renderPage,
    notify,
  };

  function renderPage() {
    const tab = Aether.Tabs.activeTab();
    if (!tab) return;
    $('#addressInput').value = tab.url || '';
    setPage(tab.view || 'home');
    // If the tab has a URL but no webview yet (restored session or switched-to), load it
    if (tab.view === 'webview' && tab.url) {
      if (!tab.webview) {
        Aether.Navigation.openUrlIn(tab.id, tab.url, tab.title);
      } else {
        Aether.Navigation.showWebview(tab);
        Aether.Navigation.updateNavButtons();
        // Request page color using the webview's exact webContents ID
        try {
          var wcId = tab.webview.getWebContentsId();
          if (wcId && window.aether.requestPageColorForId) {
            window.aether.requestPageColorForId(wcId);
          } else if (window.aether.requestPageColor) {
            window.aether.requestPageColor();
          }
        } catch (e) {
          if (window.aether.requestPageColor) window.aether.requestPageColor();
        }
      }
    } else if (tab.view === 'home') {
      // Reset to black on home page + cancel any pending color requests
      Aether.Navigation.resetPageColor();
    }
    $('#bookmarkBtn').classList.toggle('is-bookmarked', !!tab.url && Aether.Bookmarks.isBookmarked(tab.url));
    // Weather card only on home view — use .visible class
    const weatherCard = $('#weatherCard');
    if (weatherCard) {
      if (tab.view === 'home' && settings.showWeather) weatherCard.classList.add('visible');
      else weatherCard.classList.remove('visible');
    }
  }

  function setPage(view) {
    const viewChanged = view !== currentView;
    const home = $('#homeContent');
    const content = $('#contentView');
    const showHome = view === 'home';
    const showContent = view !== 'home' && view !== 'webview';

    home.classList.toggle('hidden', !showHome);
    content.classList.toggle('hidden', !showContent);
    $$('webview').forEach(w => w.classList.add('hidden'));

    // Weather card: hide immediately unless we're on home view
    const weatherCard = $('#weatherCard');
    if (weatherCard) {
      if (view === 'home' && settings.showWeather) weatherCard.classList.add('visible');
      else weatherCard.classList.remove('visible');
    }

    if (viewChanged) {
      const target = showHome ? home : (showContent ? content : null);
      if (target) {
        target.classList.remove('page-enter');
        void target.offsetWidth;
        target.classList.add('page-enter');
      }
    }
    currentView = view;

    // Update view title/symbol/description based on which view is showing
    const viewMeta = {
      history: ['◷', 'History', 'Your recent browsing activity.'],
      bookmarks: ['♧', 'Bookmarks', 'Pages you saved for later.'],
      downloads: ['↓', 'Downloads', 'Files you\'ve downloaded.'],
      settings: ['⚙', 'Settings', 'Make Aether work the way you like.'],
    };
    if (viewMeta[view]) {
      $('#viewSymbol').textContent = viewMeta[view][0];
      $('#viewTitle').textContent = viewMeta[view][1];
      $('#viewDescription').textContent = viewMeta[view][2];
    }

    // Settings panel
    if (view === 'settings') {
      $('#viewList').classList.add('hidden');
      $('#settingsPanel').classList.remove('hidden');
      renderSettingsPanel();
    } else if (showContent) {
      $('#viewList').classList.remove('hidden');
      $('#settingsPanel').classList.add('hidden');
      if (view === 'history') renderHistory();
      else if (view === 'bookmarks') renderBookmarksView();
      else if (view === 'downloads') renderDownloads();
    }

    const at = Aether.Tabs.activeTab();
    if (at) at.view = view;
  }

  // ---------- Tab bar rendering ----------
  function renderTabs() {
    const tabsEl = $('#tabs');
    const addTabBtn = $('#newTab');
    const first = addTabBtn.getBoundingClientRect();
    tabsEl.replaceChildren();
    Aether.Tabs.all().forEach(tab => {
      const button = document.createElement('button');
      const isNew = Aether.Tabs.isNew(tab.id);
      button.className = `tab${tab.id === Aether.Tabs.activeIdVal() ? ' active' : ''}${isNew ? ' entering' : ''}${tab.loading ? ' loading' : ''}${tab.pinned ? ' pinned' : ''}${tab.isPlayingAudio ? ' audio' : ''}`;
      button.type = 'button';
      button.dataset.tabId = tab.id;
      button.setAttribute('role', 'tab');
      button.draggable = true;

      if (tab.pinned) {
        const favicon = document.createElement('span');
        favicon.className = 'tab-favicon';
        if (tab.url) {
          try { favicon.innerHTML = `<img src="https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32" alt="">`; }
          catch {}
        }
        button.appendChild(favicon);
      } else {
        // Favicon (left of the title)
        if (tab.url) {
          const favicon = document.createElement('span');
          favicon.className = 'tab-favicon';
          try { favicon.innerHTML = `<img src="https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32" alt="">`; }
          catch {}
          button.appendChild(favicon);
        }
        const title = document.createElement('span');
        title.className = 'tab-title';
        title.textContent = tab.title;
        button.appendChild(title);
      }

      // Audio indicator
      if (tab.isPlayingAudio) {
        const audio = document.createElement('span');
        audio.className = 'tab-audio';
        audio.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
        audio.addEventListener('click', e => { e.stopPropagation(); Aether.Tabs.toggleMute(tab.id); });
        button.appendChild(audio);
      }

      const close = document.createElement('span');
      close.className = 'tab-close';
      close.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      close.title = 'Close tab';
      button.appendChild(close);

      button.addEventListener('click', event => {
        if (event.target.closest('.tab-close')) { event.stopPropagation(); Aether.Tabs.closeTab(tab.id); return; }
        if (event.target.closest('.tab-audio')) return;
        Aether.Tabs.switchTo(tab.id);
      });
      button.addEventListener('contextmenu', e => {
        e.preventDefault();
        showTabContextMenu(e.clientX, e.clientY, tab);
      });
      // Drag to reorder
      button.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', tab.id); button.classList.add('dragging'); });
      button.addEventListener('dragend', () => button.classList.remove('dragging'));
      button.addEventListener('dragover', e => { e.preventDefault(); button.classList.add('drag-over'); });
      button.addEventListener('dragleave', () => button.classList.remove('drag-over'));
      button.addEventListener('drop', e => {
        e.preventDefault();
        button.classList.remove('drag-over');
        const fromId = parseInt(e.dataTransfer.getData('text/plain'));
        if (fromId && fromId !== tab.id) Aether.Tabs.reorder(fromId, tab.id);
      });

      tabsEl.appendChild(button);
      Aether.Tabs.clearNew(tab.id);
    });

    // + button: always clear any inline styles to ensure it's clickable
    clearTimeout(addTabBtn._flipTimer);
    addTabBtn.style.transition = '';
    addTabBtn.style.transform = '';
    addTabBtn.style.pointerEvents = '';
  }

  let tabCtxCloseCleanup = null;
  function showTabContextMenu(x, y, tab) {
    const menu = $('#tabContextMenu');
    if (tabCtxCloseCleanup) { tabCtxCloseCleanup(); tabCtxCloseCleanup = null; }
    menu.innerHTML = `
      <div class="ctx-item" data-action="new">New tab</div>
      <div class="ctx-item" data-action="duplicate">Duplicate</div>
      <div class="ctx-item" data-action="pin">${tab.pinned ? 'Unpin' : 'Pin'} tab</div>
      ${tab.isPlayingAudio ? `<div class="ctx-item" data-action="mute">${tab.muted ? 'Unmute' : 'Mute'} tab</div>` : ''}
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="close">Close</div>
      <div class="ctx-item" data-action="closeOthers">Close others</div>
      <div class="ctx-item" data-action="closeRight">Close tabs to the right</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="reopen">Reopen closed tab</div>
    `;
    menu.classList.remove('hidden');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.querySelectorAll('.ctx-item').forEach(el => {
      el.addEventListener('click', () => {
        menu.classList.add('hidden');
        if (tabCtxCloseCleanup) { tabCtxCloseCleanup(); tabCtxCloseCleanup = null; }
        const a = el.dataset.action;
        if (a === 'new') Aether.Tabs.newTab();
        else if (a === 'duplicate') { const t = Aether.Tabs.newTab(); Aether.Navigation.openUrlIn(t.id, tab.url); }
        else if (a === 'pin') Aether.Tabs.togglePin(tab.id);
        else if (a === 'mute') Aether.Tabs.toggleMute(tab.id);
        else if (a === 'close') Aether.Tabs.closeTab(tab.id);
        else if (a === 'closeOthers') Aether.Tabs.all().filter(t => t.id !== tab.id).forEach(t => Aether.Tabs.closeTab(t.id));
        else if (a === 'closeRight') {
          const idx = Aether.Tabs.all().findIndex(t => t.id === tab.id);
          Aether.Tabs.all().slice(idx + 1).forEach(t => Aether.Tabs.closeTab(t.id));
        }
        else if (a === 'reopen') {
          const c = Aether.Tabs.getClosedForReopen();
          if (c) { const t = Aether.Tabs.newTab(); Aether.Navigation.openUrlIn(t.id, c.url, c.title); }
          else notify('No recently closed tabs.');
        }
      });
    });
    // Close on: pointerdown outside menu, window blur (webview focus), Escape
    function close() {
      menu.classList.add('hidden');
      window.removeEventListener('pointerdown', onPD, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKey);
      tabCtxCloseCleanup = null;
    }
    function onPD(e) { if (!menu.contains(e.target)) close(); }
    function onBlur() { setTimeout(close, 100); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    setTimeout(() => {
      window.addEventListener('pointerdown', onPD, true);
      window.addEventListener('blur', onBlur);
      document.addEventListener('keydown', onKey);
      tabCtxCloseCleanup = close;
    }, 50);
  }

  // ---------- Shortcuts ----------
  function renderShortcuts() {
    const container = $('#shortcuts');
    container.replaceChildren();
    Aether.Shortcuts.all().forEach(s => {
      const div = document.createElement('div');
      div.className = 'shortcut';
      const tile = document.createElement('button');
      tile.className = 'shortcut-tile';
      tile.title = s.url;
      const icon = document.createElement('span');
      icon.className = 'shortcut-icon';
      const img = document.createElement('img');
      img.src = Aether.Shortcuts.getFaviconUrl(s.url);
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { icon.textContent = s.name.charAt(0).toUpperCase(); };
      icon.appendChild(img);
      tile.appendChild(icon);
      tile.addEventListener('click', () => Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), s.url, s.name));
      const name = document.createElement('span');
      name.className = 'shortcut-name';
      name.textContent = s.name;
      const remove = document.createElement('button');
      remove.className = 'shortcut-remove';
      remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      remove.addEventListener('click', e => { e.stopPropagation(); Aether.Shortcuts.remove(s.id); notify('Shortcut removed.'); });
      div.append(tile, name, remove);
      container.appendChild(div);
    });
    // Add tile
    const addDiv = document.createElement('div');
    addDiv.className = 'shortcut add-shortcut-item';
    const addTile = document.createElement('button');
    addTile.className = 'shortcut-tile';
    addTile.innerHTML = '<span class="shortcut-icon"><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg></span>';
    addTile.addEventListener('click', () => openAddShortcutDialog());
    const addName = document.createElement('span');
    addName.className = 'shortcut-name';
    addName.textContent = 'Add';
    addDiv.append(addTile, addName);
    container.appendChild(addDiv);
  }

  function openAddShortcutDialog() {
    const dialog = $('#addShortcutDialog');
    const input = $('#shortcutUrlInput');
    input.value = '';
    dialog.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);
  }

  // ---------- Bookmarks bar ----------
  function renderBookmarksBar() {
    const bar = $('#bookmarksBar');
    if (!bar) return;
    const items = Aether.Bookmarks.byFolder(null).slice(0, 12); // show first 12 on bar
    bar.innerHTML = items.map(b => `<button class="bm-item" data-url="${b.url}" title="${b.title}"><img src="${Aether.Shortcuts.getFaviconUrl(b.url)}" alt="" onerror="this.style.display='none'"><span>${b.title.slice(0, 18)}</span></button>`).join('');
    bar.querySelectorAll('.bm-item').forEach(el => {
      el.addEventListener('click', () => Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), el.dataset.url));
    });
  }

  // ---------- History view ----------
  function renderHistory() {
    const list = $('#viewList');
    const search = $('#historySearch')?.value || '';
    const groups = Aether.History.groupedByDate();
    list.replaceChildren();
    let hasItems = false;
    Object.entries(groups).forEach(([label, items]) => {
      if (!items.length) return;
      hasItems = true;
      const group = document.createElement('div');
      group.className = 'history-group';
      group.innerHTML = `<div class="history-group-label">${label}</div>`;
      const filtered = search ? items.filter(i => i.title.toLowerCase().includes(search.toLowerCase()) || i.url.toLowerCase().includes(search.toLowerCase())) : items;
      filtered.forEach(item => {
        const row = document.createElement('button');
        row.className = 'list-row';
        let favicon = '↗';
        try { favicon = `<img src="https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32" alt="" style="width:18px;height:18px;border-radius:4px;">`; } catch {}
        row.innerHTML = `<span class="row-icon">${favicon}</span><span><strong>${item.title}</strong><small>${item.url}</small></span>`;
        row.addEventListener('click', () => Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), item.url, item.title));
        group.appendChild(row);
      });
      list.appendChild(group);
    });
    if (!hasItems) list.innerHTML = '<div class="empty-state">Your browsing history will appear here.</div>';
  }

  // ---------- Bookmarks view ----------
  function renderBookmarksView() {
    const list = $('#viewList');
    const bookmarks = Aether.Bookmarks.all();
    list.replaceChildren();
    if (!bookmarks.length) {
      list.innerHTML = '<div class="empty-state">No bookmarks yet. Click the star in the toolbar to bookmark a page.</div>';
      return;
    }
    bookmarks.forEach(b => {
      const row = document.createElement('button');
      row.className = 'list-row';
      let favicon = '↗';
      try { favicon = `<img src="https://www.google.com/s2/favicons?domain=${new URL(b.url).hostname}&sz=32" alt="" style="width:18px;height:18px;border-radius:4px;">`; } catch {}
      row.innerHTML = `<span class="row-icon">${favicon}</span><span><strong>${b.title}</strong><small>${b.url}</small></span>`;
      row.addEventListener('click', () => Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), b.url, b.title));
      list.appendChild(row);
    });
  }

  // ---------- Downloads view ----------
  function renderDownloads() {
    const list = $('#viewList');
    const items = Aether.Downloads.all();
    list.replaceChildren();
    if (!items.length) {
      list.innerHTML = '<div class="empty-state">Nothing downloaded yet. <button id="openDlFolder" style="color:#8bb0ff;background:none;border:0;cursor:pointer;font-size:12px;text-decoration:underline">Open downloads folder</button></div>';
      setTimeout(() => $('#openDlFolder')?.addEventListener('click', () => Aether.Downloads.openDownloadsFolder()), 0);
      return;
    }
    items.forEach(dl => {
      const row = document.createElement('div');
      row.className = 'list-row download-row';
      const pct = Aether.Downloads.progress(dl);
      const isComplete = dl.state === 'completed';
      row.innerHTML = `
        <span class="row-icon">↓</span>
        <span>
          <strong>${dl.filename}</strong>
          <small>${isComplete ? 'Completed' : (dl.state === 'progressing' ? `Downloading… ${pct}%` : dl.state)}</small>
          ${!isComplete && dl.state === 'progressing' ? `<div class="dl-progress"><div class="dl-progress-bar" style="width:${pct}%"></div></div>` : ''}
        </span>
        <div class="dl-actions">
          ${isComplete ? `<button class="dl-act" data-act="open">Open</button><button class="dl-act" data-act="show">Show in folder</button>` : ''}
        </div>
      `;
      list.appendChild(row);
      if (isComplete) {
        row.querySelector('[data-act="open"]')?.addEventListener('click', () => Aether.Downloads.openFile(dl));
        row.querySelector('[data-act="show"]')?.addEventListener('click', () => Aether.Downloads.showInFolder(dl));
      }
    });
  }

  // ---------- Settings panel ----------
  function renderSettingsPanel() {
    $('#settingSearchEngine').value = settings.searchEngine;
    $('#settingShowShortcuts').checked = settings.showShortcuts;
    $('#settingShowWeather').checked = settings.showWeather;
  }

  function applySettings() {
    $('#shortcuts').style.display = settings.showShortcuts ? '' : 'none';
    // Weather card only shows on home page — use .visible class (CSS uses !important)
    const activeTab = Aether.Tabs.activeTab();
    const isHome = !activeTab || activeTab.view === 'home';
    const weatherCard = $('#weatherCard');
    if (settings.showWeather && isHome) weatherCard.classList.add('visible');
    else weatherCard.classList.remove('visible');
    $('#bookmarksBar').style.display = settings.showBookmarksBar ? '' : 'none';
  }

  function initSettingsHandlers() {
    $('#settingSearchEngine')?.addEventListener('change', e => {
      settings.searchEngine = e.target.value;
      Aether.Storage.saveSettings(settings);
      notify('Search engine changed to ' + e.target.options[e.target.selectedIndex].text);
    });
    $('#settingShowShortcuts')?.addEventListener('change', e => { settings.showShortcuts = e.target.checked; Aether.Storage.saveSettings(settings); applySettings(); });
    $('#settingShowWeather')?.addEventListener('change', e => { settings.showWeather = e.target.checked; Aether.Storage.saveSettings(settings); applySettings(); });
    $('#settingShowBookmarksBar')?.addEventListener('change', e => { settings.showBookmarksBar = e.target.checked; Aether.Storage.saveSettings(settings); applySettings(); });
    $('#setDefaultBrowser')?.addEventListener('click', () => { window.aether.setDefaultBrowser(); notify('Aether set as default browser.'); });
    $('#incognitoBtn')?.addEventListener('click', () => window.aether.openIncognito());
  }

  // ---------- Toolbar handlers ----------
  function initToolbarHandlers() {
    $('#addressForm').addEventListener('submit', e => {
      e.preventDefault();
      Aether.SearchSuggest.hide();
      const val = $('#addressInput').value;
      $('#addressInput').blur();
      if (val.trim()) Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), val);
    });
    $('#clearAddress').addEventListener('click', () => { $('#addressInput').value = ''; $('#addressInput').focus(); });
    $('#newTab').addEventListener('click', () => Aether.Tabs.newTab());
    $('#homeBtn').addEventListener('click', () => { Aether.Tabs.update(Aether.Tabs.activeIdVal(), { view: 'home' }); renderPage(); });
    $('#reloadBtn').addEventListener('click', reload);
    $('#bookmarkBtn').addEventListener('click', () => {
      const tab = Aether.Tabs.activeTab();
      if (!tab.url) { notify('Open a page first to bookmark it.'); return; }
      const added = Aether.Bookmarks.toggle(tab.title, tab.url);
      notify(added ? 'Bookmark saved.' : 'Bookmark removed.');
      renderPage();
    });
    $('#downloadsBtn').addEventListener('click', () => { Aether.Tabs.update(Aether.Tabs.activeIdVal(), { view: 'downloads' }); renderPage(); });

    // Back/forward with animation
    $('#backBtn').addEventListener('click', () => {
      animateNavButton($('#backBtn'));
      const tab = Aether.Tabs.activeTab();
      if (tab?.webview?.canGoBack()) tab.webview.goBack();
    });
    $('#forwardBtn').addEventListener('click', () => {
      animateNavButton($('#forwardBtn'));
      const tab = Aether.Tabs.activeTab();
      if (tab?.webview?.canGoForward()) tab.webview.goForward();
    });

    // 3-dots menu
    const menuBtn = $('#menuBtn'), menuDropdown = $('#menuDropdown');
    const closeMenu = () => { menuDropdown.classList.add('hidden'); menuBtn.setAttribute('aria-expanded', 'false'); };
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (menuDropdown.classList.contains('hidden')) { menuDropdown.classList.remove('hidden'); menuBtn.setAttribute('aria-expanded', 'true'); }
      else closeMenu();
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.menu-wrap')) closeMenu();
    });
    // Close all context menus on mousedown anywhere (including webview area)
    document.addEventListener('mousedown', e => {
      const ctxMenu = document.getElementById('contextMenu');
      const tabCtxMenu = document.getElementById('tabContextMenu');
      if (ctxMenu && !ctxMenu.contains(e.target)) ctxMenu.classList.add('hidden');
      if (tabCtxMenu && !tabCtxMenu.contains(e.target)) tabCtxMenu.classList.add('hidden');
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeMenu();
        const ctxMenu = document.getElementById('contextMenu');
        const tabCtxMenu = document.getElementById('tabContextMenu');
        if (ctxMenu) ctxMenu.classList.add('hidden');
        if (tabCtxMenu) tabCtxMenu.classList.add('hidden');
      }
    });
    $$('.menu-item[data-view]').forEach(b => b.addEventListener('click', () => {
      Aether.Tabs.update(Aether.Tabs.activeIdVal(), { view: b.dataset.view });
      closeMenu();
      renderPage();
    }));

    // Voice search removed (Chromium SpeechRecognition bug causes chunked_data_pipe error)
    $('#aiSearchForm').addEventListener('submit', e => {
      e.preventDefault();
      const q = $('#aiSearchInput').value.trim();
      if (!q) return;
      Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), q);
      $('#aiSearchInput').value = '';
      hideAiSuggestions();
    });

    // AI search input — custom search suggestions (text only)
    let aiSuggestTimer = null;
    let aiSuggestIndex = -1;
    let aiSuggestions = [];
    const aiInput = $('#aiSearchInput');
    const aiSugEl = $('#aiSuggestions');
    if (aiInput && aiSugEl) {
      aiInput.addEventListener('input', () => {
        clearTimeout(aiSuggestTimer);
        const q = aiInput.value.trim();
        if (q.length < 2) { hideAiSuggestions(); return; }
        aiSuggestTimer = setTimeout(() => fetchAiSuggestions(q), 150);
      });
      aiInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveAiSelection(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveAiSelection(-1); }
        else if (e.key === 'Enter' && aiSuggestIndex >= 0) {
          e.preventDefault();
          if (aiSuggestions[aiSuggestIndex]) navigateAiSuggestion(aiSuggestions[aiSuggestIndex]);
        }
        else if (e.key === 'Escape') { hideAiSuggestions(); aiInput.blur(); }
      });
      aiInput.addEventListener('blur', () => setTimeout(hideAiSuggestions, 150));
      aiInput.addEventListener('focus', () => { if (aiInput.value.trim().length >= 2) fetchAiSuggestions(aiInput.value.trim()); });
    }

    async function fetchAiSuggestions(query) {
      // Only text suggestions — no links/URLs
      let searchMatches = [];
      try {
        const res = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`);
        const data = await res.json();
        if (Array.isArray(data) && data[1]) {
          searchMatches = data[1].slice(0, 8).map(q => ({
            type: 'search', label: q, url: null, rawQuery: q
          }));
        }
      } catch {}
      aiSuggestions = searchMatches;
      aiSuggestIndex = -1;
      renderAiSuggestions();
    }

    function renderAiSuggestions() {
      if (!aiSuggestions.length) { hideAiSuggestions(); return; }
      aiSugEl.innerHTML = aiSuggestions.map((s, i) => `
        <div class="ai-suggest-item ${i === aiSuggestIndex ? 'active' : ''}" data-idx="${i}">
          <span class="ai-suggest-icon">${aiIconSvg('search')}</span>
          <span class="ai-suggest-label">${escapeHtml(s.label)}</span>
        </div>
      `).join('');
      aiSugEl.classList.remove('hidden');
      aiSugEl.querySelectorAll('.ai-suggest-item').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          const idx = parseInt(el.dataset.idx);
          if (aiSuggestions[idx]) navigateAiSuggestion(aiSuggestions[idx]);
        });
      });
    }

    function aiIconSvg(icon) {
      const icons = {
        history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
        search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
      };
      return icons[icon] || icons.search;
    }

    function escapeHtml(s) { return (s || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }

    function moveAiSelection(delta) {
      if (!aiSuggestions.length) return;
      aiSuggestIndex = (aiSuggestIndex + delta + aiSuggestions.length) % aiSuggestions.length;
      renderAiSuggestions();
    }

    function navigateAiSuggestion(s) {
      if (s.url) Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), s.url, s.label);
      else if (s.rawQuery) Aether.Navigation.openUrlIn(Aether.Tabs.activeIdVal(), s.rawQuery, s.label);
      aiInput.value = '';
      hideAiSuggestions();
    }

    function hideAiSuggestions() {
      if (aiSugEl) aiSugEl.classList.add('hidden');
      aiSuggestions = [];
      aiSuggestIndex = -1;
    }

    // Weather card
    $('#weatherCard').addEventListener('click', () => notify('Weather is based on your device location.'));

    // Add shortcut dialog
    const dialog = $('#addShortcutDialog');
    $('#shortcutCancel').addEventListener('click', () => dialog.classList.add('hidden'));
    $('#shortcutAdd').addEventListener('click', confirmAddShortcut);
    $('#shortcutUrlInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirmAddShortcut(); }
      if (e.key === 'Escape') { e.preventDefault(); dialog.classList.add('hidden'); }
    });
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.classList.add('hidden'); });
  }

  function confirmAddShortcut() {
    const input = $('#shortcutUrlInput');
    const val = input.value.trim();
    if (!val) { input.focus(); return; }
    let url = val;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    let name = Aether.Shortcuts.deriveName(url);
    name = name.charAt(0).toUpperCase() + name.slice(1);
    Aether.Shortcuts.add(name, url);
    $('#addShortcutDialog').classList.add('hidden');
    notify('Shortcut added.');
  }

  function reload() {
    const icon = $('#reloadBtn .reload-icon');
    icon.classList.remove('spinning'); void icon.offsetWidth; icon.classList.add('spinning');
    setTimeout(() => icon.classList.remove('spinning'), 700);
    const tab = Aether.Tabs.activeTab();
    if (tab?.webview && tab.view === 'webview') tab.webview.reload();
    else notify('Start page is up to date.');
  }

  function animateNavButton(btn) {
    btn.classList.remove('animate'); void btn.offsetWidth(); btn.classList.add('animate');
    setTimeout(() => btn.classList.remove('animate'), 300);
  }

  // ---------- Tabs bar handlers ----------
  function initTabsBarHandlers() {
    // Drop on empty tabs area = move to end
    $('#tabs').addEventListener('dragover', e => e.preventDefault());
    $('#tabs').addEventListener('drop', e => {
      e.preventDefault();
      const fromId = parseInt(e.dataTransfer.getData('text/plain'));
      if (fromId) Aether.Tabs.reorder(fromId, null);
    });
  }

  // ---------- Window controls ----------
  function initWindowControls() {
    $('#minimizeWindow').addEventListener('click', () => window.aether.minimize());
    $('#scaleWindow').addEventListener('click', () => window.aether.maximize());
    $('#closeWindow').addEventListener('click', () => window.aether.close());
  }

  // ---------- Keyboard shortcuts ----------
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', event => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key.toLowerCase() === 't') { event.preventDefault(); Aether.Tabs.newTab(); }
      if (ctrl && event.key.toLowerCase() === 'l') { event.preventDefault(); $('#addressInput').focus(); $('#addressInput').select(); }
      if (ctrl && event.key.toLowerCase() === 'r') { event.preventDefault(); reload(); }
      if (ctrl && event.key.toLowerCase() === 'w') { event.preventDefault(); Aether.Tabs.closeTab(Aether.Tabs.activeIdVal()); }
      if (ctrl && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        const t = Aether.Tabs.activeTab();
        if (t?.webview) {
          try { t.webview.focus(); } catch {}
          Aether.Find.toggle(t.webview);
        } else { notify('Open a web page first to use Find.'); }
      }
      if (ctrl && event.shiftKey && event.key.toLowerCase() === 't') { event.preventDefault(); const c = Aether.Tabs.getClosedForReopen(); if (c) { const t = Aether.Tabs.newTab(); Aether.Navigation.openUrlIn(t.id, c.url, c.title); } }
      if (ctrl && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); window.aether.openIncognito(); }
      if (ctrl && event.key.toLowerCase() === 'p') { event.preventDefault(); const t = Aether.Tabs.activeTab(); if (t?.webview) t.webview.print({ printBackground: true }); }
      if (ctrl && event.key === '=') { event.preventDefault(); zoomWebview(1); }
      if (ctrl && event.key === '-') { event.preventDefault(); zoomWebview(-1); }
      if (ctrl && event.key === '0') { event.preventDefault(); zoomWebview(0); }
      if (event.key === 'F11') { event.preventDefault(); window.aether.toggleFullscreen(); }
      if (event.key === 'Escape') {
        if (Aether.Find.isActive()) Aether.Find.hide();
      }
    });
  }

  function zoomWebview(delta) {
    const tab = Aether.Tabs.activeTab();
    if (!tab?.webview) return;
    if (delta === 0) tab.webview.setZoomFactor(1);
    else {
      const cur = tab.webview.getZoomFactor();
      tab.webview.setZoomFactor(Math.max(0.25, Math.min(5, cur + delta * 0.1)));
    }
  }

  // ---------- Greeting ----------
  function updateGreeting() {
    const h = new Date().getHours();
    let g;
    if (h < 12) g = 'Good morning';
    else if (h < 18) g = 'Good afternoon';
    else g = 'Good evening';
    $('#greeting').textContent = g;
  }
  function initGreeting() { updateGreeting(); setInterval(updateGreeting, 60000); }

  // ---------- Bookmark bar toggle ----------
  function initBookmarkBarToggle() {
    const bar = $('#bookmarksBar');
    const toggle = $('#toggleBookmarksBar');
    if (toggle) toggle.addEventListener('click', () => {
      settings.showBookmarksBar = !settings.showBookmarksBar;
      Aether.Storage.saveSettings(settings);
      applySettings();
    });
  }

  // ---------- Clear data dialog ----------
  function initClearDataDialog() {
    const dialog = $('#clearDataDialog');
    $('#showClearData')?.addEventListener('click', () => dialog.classList.remove('hidden'));
    $('#clearDataCancel')?.addEventListener('click', () => dialog.classList.add('hidden'));
    $('#clearDataConfirm')?.addEventListener('click', async () => {
      const opts = {
        history: $('#cdHistory')?.checked,
        bookmarks: $('#cdBookmarks')?.checked,
        cookies: $('#cdCookies')?.checked,
        cache: $('#cdCache')?.checked,
        localStorage: $('#cdLocalstorage')?.checked,
        passwords: $('#cdPasswords')?.checked,
      };
      const range = $('#cdRange')?.value;
      if (opts.history) {
        if (range === 'hour') Aether.History.clearByTimeRange(3600000);
        else if (range === 'day') Aether.History.clearByTimeRange(86400000);
        else if (range === 'all') Aether.History.clear();
      }
      if (opts.bookmarks) { Aether.Bookmarks.all().slice().forEach(b => Aether.Bookmarks.remove(b.id)); }
      if (opts.passwords) Aether.Passwords.clear();
      await window.aether.clearBrowsingData(opts);
      dialog.classList.add('hidden');
      notify('Browsing data cleared.');
      renderPage();
    });
  }

  // ---------- Start ----------
  document.addEventListener('DOMContentLoaded', () => {
    // Add opening animation class
    const win = document.getElementById('browserWindow');
    if (win) {
      win.classList.add('opening');
      setTimeout(() => win.classList.remove('opening'), 800);
    }
    try {
      boot();
    } catch (e) {
      // Display the error on screen so the user can see what went wrong
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:16px;background:#cc0000;color:#fff;font-family:monospace;font-size:13px;white-space:pre-wrap;';
      div.textContent = 'Aether boot error: ' + (e.stack || e.message || e);
      document.body.appendChild(div);
      console.error('Aether boot error:', e);
    }
  });
})();
