// history.js — History with search + date grouping
window.Aether = window.Aether || {};

Aether.History = (() => {
  let items = [];
  let events = { onRender: null };

  function init() {
    items = Aether.Storage.loadHistory();
  }

  function add(title, url) {
    items.push({ title, url, time: Date.now() });
    items = items.slice(-500); // cap
    save();
  }

  function remove(url) {
    items = items.filter(i => i.url !== url);
    save();
  }

  function clear() {
    items = [];
    Aether.Storage.clearHistory();
  }

  function clearByTimeRange(rangeMs) {
    const cutoff = Date.now() - rangeMs;
    items = items.filter(i => i.time >= cutoff);
    save();
  }

  function search(q) {
    if (!q) return items.slice().reverse();
    const lower = q.toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(lower) || i.url.toLowerCase().includes(lower)).reverse();
  }

  function groupedByDate() {
    const groups = { Today: [], Yesterday: [], 'This week': [], 'This month': [], Older: [] };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo = today - 7 * 86400000;
    const monthAgo = today - 30 * 86400000;
    [...items].reverse().forEach(i => {
      if (i.time >= today) groups.Today.push(i);
      else if (i.time >= yesterday) groups.Yesterday.push(i);
      else if (i.time >= weekAgo) groups['This week'].push(i);
      else if (i.time >= monthAgo) groups['This month'].push(i);
      else groups.Older.push(i);
    });
    return groups;
  }

  function save() { Aether.Storage.saveHistory(items); }

  return { init, add, remove, clear, clearByTimeRange, search, groupedByDate, all: () => items, events };
})();
