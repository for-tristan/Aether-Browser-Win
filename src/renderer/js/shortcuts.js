// shortcuts.js — Shortcut tiles management
window.Aether = window.Aether || {};

Aether.Shortcuts = (() => {
  let shortcuts = [];
  let events = { onRender: null };

  function init() {
    shortcuts = Aether.Storage.loadShortcuts();
  }

  function add(name, url) {
    const s = { id: 's' + Date.now(), name, url };
    shortcuts.push(s);
    save();
    render();
    return s;
  }

  function remove(id) {
    shortcuts = shortcuts.filter(s => s.id !== id);
    save();
    render();
  }

  function all() { return shortcuts; }
  function save() { Aether.Storage.saveShortcuts(shortcuts); }
  function render() { events.onRender && events.onRender(); }

  function getFaviconUrl(url) {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; }
    catch { return ''; }
  }

  function deriveName(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').split('.')[0]; }
    catch { return 'Shortcut'; }
  }

  return { init, add, remove, all, getFaviconUrl, deriveName, events };
})();
