// storage.js — persistence layer (localStorage + Electron session)
window.Aether = window.Aether || {};

Aether.Storage = (() => {
  const K = {
    settings: 'aether-settings',
    history: 'aether-history',
    bookmarks: 'aether-bookmarks',
    shortcuts: 'aether-shortcuts',
    passwords: 'aether-passwords',
    permissions: 'aether-permissions',
    startup: 'aether-startup',
    session: 'aether-session',
  };

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
  function remove(key) { try { localStorage.removeItem(key); } catch {} }

  return {
    loadSettings: () => load(K.settings, { searchEngine: 'google', showShortcuts: true, showWeather: true, showBookmarksBar: false, theme: 'auto', wallpaper: null, startupBehavior: 'newtab' }),
    saveSettings: s => save(K.settings, s),
    loadHistory: () => load(K.history, []),
    saveHistory: h => save(K.history, h),
    loadBookmarks: () => load(K.bookmarks, []),
    saveBookmarks: b => save(K.bookmarks, b),
    loadShortcuts: () => load(K.shortcuts, []),
    saveShortcuts: s => save(K.shortcuts, s),
    loadPasswords: () => load(K.passwords, []),
    savePasswords: p => save(K.passwords, p),
    loadPermissions: () => load(K.permissions, {}),
    savePermissions: p => save(K.permissions, p),
    loadSession: () => load(K.session, null),
    saveSession: s => save(K.session, s),
    clearSession: () => remove(K.session),
    clearHistory: () => remove(K.history),
    clearBookmarks: () => remove(K.bookmarks),
    clearPasswords: () => remove(K.passwords),
    clearAll: () => Object.values(K).forEach(k => remove(k)),
  };
})();
