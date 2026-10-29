// passwords.js — Simple password manager (stored locally, base64 obfuscated — not real encryption)
// NOTE: For a real browser, passwords should be encrypted with OS keychain. This is a basic implementation.
window.Aether = window.Aether || {};

Aether.Passwords = (() => {
  let passwords = [];

  function init() {
    passwords = Aether.Storage.loadPasswords();
  }

  function save(host, username, password) {
    const existing = passwords.findIndex(p => p.host === host && p.username === username);
    const entry = { id: 'p' + Date.now(), host, username, password: btoa(password), saved: Date.now() };
    if (existing >= 0) passwords[existing] = entry;
    else passwords.push(entry);
    Aether.Storage.savePasswords(passwords);
  }

  function getForHost(host) {
    return passwords.filter(p => p.host === host);
  }

  function remove(id) {
    passwords = passwords.filter(p => p.id !== id);
    Aether.Storage.savePasswords(passwords);
  }

  function all() { return passwords; }
  function clear() { passwords = []; Aether.Storage.clearPasswords(); }

  return { init, save, getForHost, remove, all, clear };
})();
