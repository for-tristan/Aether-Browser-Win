// navigation.js — URL normalization, webview creation, address bar logic
window.Aether = window.Aether || {};

Aether.Navigation = (() => {
  const searchEngines = {
    google: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    bing: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    duckduckgo: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  };

  let settings = null;
  let pageArea = null;

  function init(s, pa) { settings = s; pageArea = pa; }

  function normalizeQuery(raw) {
    const value = (raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (/^view-source:/i.test(value)) return value;
    if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(value) && !value.includes(' ')) return `https://${value}`;
    return searchEngines[settings.searchEngine](value);
  }

  // CSS injected into every webview to hide scrollbars
  const HIDE_SCROLLBARS_CSS = `
    *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
    * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  `;

  function createWebview(tab) {
    const wv = document.createElement('webview');
    wv.className = 'webview hidden';
    wv.allowpopups = '';
    wv.setAttribute('webpreferences', 'contextIsolation=yes');
    // Set dark background to prevent white flash during page loads

    wv.addEventListener('dom-ready', () => {
      try { wv.insertCSS(HIDE_SCROLLBARS_CSS); } catch {}
    });

    wv.addEventListener('did-navigate', (e) => {
      tab.url = e.url;
      Aether.History.add(tab.title, e.url);
      if (Aether.Tabs.activeIdVal() === tab.id) {
        document.getElementById('addressInput').value = e.url;
      }
      updateNavButtons();
      Aether.Tabs.saveSession();
      // Request page color immediately on navigation if this is the active tab
      if (Aether.Tabs.activeIdVal() === tab.id) {
        try {
          var wcId = wv.getWebContentsId();
          if (wcId && window.aether.requestPageColorForId) {
            window.aether.requestPageColorForId(wcId);
          }
        } catch (e) {}
      }
      // Inject ambient light effect for YouTube
      if (e.url.includes('youtube.com/watch')) {
        Aether.AmbientLight.inject(wv, e.url);
      }
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      tab.url = e.url;
      if (Aether.Tabs.activeIdVal() === tab.id) document.getElementById('addressInput').value = e.url;
      updateNavButtons();
      // Request page color on in-page navigation too
      if (Aether.Tabs.activeIdVal() === tab.id) {
        try {
          var wcId2 = wv.getWebContentsId();
          if (wcId2 && window.aether.requestPageColorForId) {
            window.aether.requestPageColorForId(wcId2);
          }
        } catch (e) {}
      }
      // Inject ambient light for YouTube (also handles in-page navigation to videos)
      if (e.url.includes('youtube.com/watch')) {
        Aether.AmbientLight.inject(wv, e.url);
      }
    });
    wv.addEventListener('page-title-updated', (e) => {
      Aether.Tabs.update(tab.id, { title: (e.title || 'Untitled').slice(0, 36) });
    });
    wv.addEventListener('did-start-loading', () => { Aether.Tabs.update(tab.id, { loading: true }); });
    wv.addEventListener('did-stop-loading', () => {
      Aether.Tabs.update(tab.id, { loading: false });
      // Request page color when page finishes loading
      if (Aether.Tabs.activeIdVal() === tab.id) {
        try {
          var wcId3 = wv.getWebContentsId();
          if (wcId3 && window.aether.requestPageColorForId) {
            window.aether.requestPageColorForId(wcId3);
          }
        } catch (e) {}
      }
    });
    wv.addEventListener('new-window', (e) => {
      e.preventDefault();
      const newTab = Aether.Tabs.newTab();
      openUrlIn(newTab.id, e.url);
    });
    // Audio state
    wv.addEventListener('media-started-playing', () => Aether.Tabs.setAudioState(tab.id, true));
    wv.addEventListener('media-paused', () => Aether.Tabs.setAudioState(tab.id, false));
    // Find in page results
    wv.addEventListener('found-in-page', (e) => {
      Aether.Find.onFoundResult(e.result.activeMatchOrdinal, e.result.matches);
    });

    // Context menu
    Aether.ContextMenu.attach(wv, tab);

    tab.webview = wv;
    pageArea.appendChild(wv);
    return wv;
  }

  function openUrlIn(tabId, raw, titleHint = '') {
    const tab = Aether.Tabs.get(tabId);
    if (!tab) return;
    const url = normalizeQuery(raw);
    if (!url) return;
    if (!tab.webview) createWebview(tab);
    tab.url = url;
    if (!titleHint) { try { titleHint = new URL(url).hostname.replace(/^www\./, ''); } catch { titleHint = 'Loading…'; } }
    tab.title = titleHint.slice(0, 36) || 'Web page';
    tab.view = 'webview';
    tab.webview.src = url;
    Aether.Tabs.events.onRender && Aether.Tabs.events.onRender();
    if (Aether.Tabs.activeIdVal() === tabId) {
      Aether.UI.renderPage();
    }
  }

  function showWebview(tab) {
    document.querySelectorAll('webview').forEach(w => w.classList.add('hidden'));
    if (tab.webview) tab.webview.classList.remove('hidden');
  }

  function updateNavButtons() {
    const tab = Aether.Tabs.activeTab();
    const backBtn = document.getElementById('backBtn');
    const fwdBtn = document.getElementById('forwardBtn');
    if (!tab || !tab.webview) {
      backBtn.disabled = true;
      fwdBtn.disabled = true;
    } else {
      backBtn.disabled = !tab.webview.canGoBack();
      fwdBtn.disabled = !tab.webview.canGoForward();
    }
    fwdBtn.classList.toggle('muted-icon', fwdBtn.disabled);
    backBtn.classList.toggle('muted-icon', backBtn.disabled);
  }

  // ---------- Page color sampling — via main process IPC ----------
  // The main process captures the webview's top strip and sends the color here
  function initPageColorListener() {
    if (window.aether.onPageColor) {
      window.aether.onPageColor(function(data) {
        console.log('[Aether] Renderer received page-color:', data);
        if (data && typeof data.r === 'number') {
          applyPageColor(data.r, data.g, data.b);
        }
      });
    }
  }

  function samplePageColor(tab) {
    // Color is now sent from the main process via did-stop-loading / did-navigate events
    // This function is kept for compatibility but does nothing — the main process handles it
    // Just reset to dark if we're on the home page
    if (!tab || !tab.webview) {
      resetPageColor();
    }
  }

  function applyPageColor(r, g, b) {
    if (isNaN(r) || isNaN(g) || isNaN(b)) return;
    // Always use the page's actual color
    document.documentElement.style.setProperty('--page-tint-r', r);
    document.documentElement.style.setProperty('--page-tint-g', g);
    document.documentElement.style.setProperty('--page-tint-b', b);
    // If bright, add light-bg class so icons turn dark
    var isBright = r > 160 && g > 160 && b > 160;
    var tabbar = document.querySelector('.tabbar');
    var toolbar = document.querySelector('.toolbar');
    if (tabbar) tabbar.classList.toggle('light-bg', isBright);
    if (toolbar) toolbar.classList.toggle('light-bg', isBright);
  }

  function resetPageColor() {
    document.documentElement.style.setProperty('--page-tint-r', 0);
    document.documentElement.style.setProperty('--page-tint-g', 0);
    document.documentElement.style.setProperty('--page-tint-b', 0);
    var tabbar = document.querySelector('.tabbar');
    var toolbar = document.querySelector('.toolbar');
    if (tabbar) tabbar.classList.remove('light-bg');
    if (toolbar) toolbar.classList.remove('light-bg');
  }

  return { init, normalizeQuery, createWebview, openUrlIn, showWebview, updateNavButtons, samplePageColor, initPageColorListener, resetPageColor };
})();
