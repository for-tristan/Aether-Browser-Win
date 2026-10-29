// find.js — Find in page (Ctrl+F)
window.Aether = window.Aether || {};

Aether.Find = (() => {
  let active = false;
  let query = '';
  let findBar = null;
  let input = null;
  let resultLabel = null;
  let activeWebview = null;

  function init() {
    findBar = document.getElementById('findBar');
    input = document.getElementById('findInput');
    resultLabel = document.getElementById('findResult');
    if (input) {
      input.addEventListener('input', () => {
        query = input.value;
        if (activeWebview && query) {
          try { activeWebview.findInPage(query); } catch (e) { console.log('findInPage error:', e); }
        } else if (activeWebview) {
          try { activeWebview.stopFindInPage('clearSelection'); } catch {}
        }
        if (resultLabel) resultLabel.textContent = '';
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (activeWebview && query) {
            try { activeWebview.findInPage(query, { findNext: e.shiftKey ? false : true }); } catch (e) {}
          }
        }
        if (e.key === 'Escape') { e.preventDefault(); hide(); }
      });
    }
    const nextBtn = document.getElementById('findNext');
    const prevBtn = document.getElementById('findPrev');
    const closeBtn = document.getElementById('findClose');
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (activeWebview && query) { try { activeWebview.findInPage(query, { findNext: true }); } catch {} }
    });
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (activeWebview && query) { try { activeWebview.findInPage(query, { forward: false }); } catch {} }
    });
    if (closeBtn) closeBtn.addEventListener('click', hide);
  }

  function show(webview) {
    activeWebview = webview;
    active = true;
    if (findBar) findBar.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
    if (resultLabel) resultLabel.textContent = '';
    events && events.onToggle && events.onToggle(true);
  }

  function hide() {
    active = false;
    if (findBar) findBar.classList.add('hidden');
    if (activeWebview) {
      try { activeWebview.stopFindInPage('clearSelection'); } catch {}
    }
    activeWebview = null;
    events && events.onToggle && events.onToggle(false);
  }

  function toggle(webview) {
    if (active) hide();
    else show(webview);
  }

  function onFoundResult(activeMatch, matches) {
    if (resultLabel && matches) {
      resultLabel.textContent = activeMatch + ' of ' + matches;
    }
  }

  return { init, show, hide, toggle, onFoundResult, isActive: () => active };
})();
