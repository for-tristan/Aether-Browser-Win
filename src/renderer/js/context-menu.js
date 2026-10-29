// context-menu.js — Native context menu is handled by main.js via web-contents-created
// This file is kept for compatibility but does nothing (the main process handles everything)
window.Aether = window.Aether || {};

Aether.ContextMenu = (() => {
  function init() {}
  function attach(webview, tab) {
    // Native context menu is handled in main.js — nothing to do here
  }
  return { init, attach };
})();
