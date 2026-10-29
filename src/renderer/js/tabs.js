// tabs.js — Tab management (reorder, pin, mute, reopen closed, session restore)
window.Aether = window.Aether || {};

Aether.Tabs = (() => {
  let nextId = 1;
  let tabs = [];
  let activeId = null;
  let closedTabs = []; // for reopen-closed-tab
  let draggedTabId = null;
  const newTabIds = new Set();

  const events = {
    onRender: null,
    onSwitch: null,
    onOpen: null,
  };

  function init(initialView = 'home', restoreSession = false) {
    nextId = 1;
    tabs = [];
    activeId = null;
    closedTabs = [];
    // Only restore session if explicitly requested
    if (restoreSession) {
      const saved = Aether.Storage.loadSession();
      if (saved && saved.length) {
        saved.forEach(s => {
          const tab = { id: nextId++, title: s.title || 'Restored', url: s.url || '', view: s.url ? 'webview' : 'home', webview: null, loading: false, pinned: false, muted: false };
          tabs.push(tab);
        });
        activeId = tabs[0]?.id || null;
        return;
      }
    }
    newTab(initialView);
  }

  function newTab(view = 'home') {
    const tab = { id: nextId++, title: 'New Tab', url: '', view, webview: null, loading: false, pinned: false, muted: false };
    tabs.push(tab);
    activeId = tab.id;
    newTabIds.add(tab.id);
    events.onOpen && events.onOpen(tab);
    render();
    // Auto-switch to the new tab: trigger onSwitch so renderPage runs
    events.onSwitch && events.onSwitch(activeTab());
    return tab;
  }

  function closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    const t = tabs[idx];
    // Save for reopen-closed
    if (t.url) closedTabs.unshift({ url: t.url, title: t.title });
    closedTabs = closedTabs.slice(0, 25);

    if (t.webview) t.webview.remove();

    if (tabs.length === 1) {
      // Don't close last tab — reset it
      tabs[0] = { id: nextId++, title: 'New Tab', url: '', view: 'home', webview: null, loading: false, pinned: false, muted: false };
      activeId = tabs[0].id;
    } else {
      tabs = tabs.filter(t => t.id !== id);
      if (activeId === id) activeId = tabs[Math.max(0, idx - 1)].id;
    }
    // Save the updated session so closed tabs don't reappear on restart
    saveSession();
    render();
    events.onSwitch && events.onSwitch(activeTab());
  }

  function reopenClosed() {
    const c = closedTabs.shift();
    if (!c) return null;
    return newTab();
  }

  function getClosedForReopen() { return closedTabs[0] || null; }

  function switchTo(id) {
    activeId = id;
    render();
    events.onSwitch && events.onSwitch(activeTab());
  }

  function get(id) { return tabs.find(t => t.id === id); }
  function all() { return tabs; }
  function activeTab() { return tabs.find(t => t.id === activeId); }
  function activeIdVal() { return activeId; }

  function update(id, patch) {
    const t = get(id);
    if (t) Object.assign(t, patch);
    render();
  }

  function togglePin(id) {
    const t = get(id);
    if (!t) return;
    t.pinned = !t.pinned;
    // Move pinned to front
    tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    render();
  }

  function toggleMute(id) {
    const t = get(id);
    if (!t || !t.webview) return;
    t.muted = !t.muted;
    try { t.webview.setAudioMuted(t.muted); } catch {}
    render();
  }

  // Reorder — drag tab fromId, drop before toId (null = end)
  function reorder(fromId, toId) {
    const fromIdx = tabs.findIndex(t => t.id === fromId);
    if (fromIdx < 0) return;
    const [moved] = tabs.splice(fromIdx, 1);
    if (toId === null) {
      tabs.push(moved);
    } else {
      const toIdx = tabs.findIndex(t => t.id === toId);
      tabs.splice(toIdx, 0, moved);
    }
    render();
  }

  function setAudioState(id, isPlaying) {
    const t = get(id);
    if (!t) return;
    t.isPlayingAudio = isPlaying;
    render();
  }

  function saveSession() {
    Aether.Storage.saveSession(tabs.map(t => ({ url: t.url, title: t.title })));
  }

  function render() {
    events.onRender && events.onRender();
  }

  function isNew(id) { return newTabIds.has(id); }
  function clearNew(id) { newTabIds.delete(id); }

  return {
    init, newTab, closeTab, reopenClosed, getClosedForReopen,
    switchTo, get, all, activeTab, activeIdVal, update,
    togglePin, toggleMute, reorder, setAudioState, saveSession,
    isNew, clearNew, events
  };
})();
