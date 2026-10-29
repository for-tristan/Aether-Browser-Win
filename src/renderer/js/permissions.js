// permissions.js — Per-site permission management
window.Aether = window.Aether || {};

Aether.Permissions = (() => {
  let perms = {}; // { 'youtube.com': { geolocation: 'allow', notifications: 'block' } }
  const TYPES = [
    { key: 'geolocation', label: 'Location' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'media', label: 'Camera & Microphone' },
    { key: 'cookies', label: 'Cookies' },
    { key: 'popups', label: 'Pop-ups' },
  ];

  function init() {
    perms = Aether.Storage.loadPermissions();
  }

  function getForSite(host) {
    return perms[host] || {};
  }

  function setForSite(host, type, value) {
    if (!perms[host]) perms[host] = {};
    perms[host][type] = value;
    save();
  }

  function clearSite(host) {
    delete perms[host];
    save();
  }

  function allSites() {
    return Object.keys(perms).map(host => ({ host, perms: perms[host] }));
  }

  function save() { Aether.Storage.savePermissions(perms); }
  function types() { return TYPES; }

  return { init, getForSite, setForSite, clearSite, allSites, types };
})();
