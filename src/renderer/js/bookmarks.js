// bookmarks.js — Bookmarks with folders + bookmarks bar
window.Aether = window.Aether || {};

Aether.Bookmarks = (() => {
  let bookmarks = []; // [{ id, title, url, folder, added }]
  let folders = [];   // [{ id, name }]
  let events = { onRender: null };

  function init() {
    bookmarks = Aether.Storage.loadBookmarks();
    // Backward compat: ensure folder field
    bookmarks.forEach(b => { if (!b.folder) b.folder = null; });
  }

  function add(title, url, folder = null) {
    const b = { id: 'b' + Date.now(), title, url, folder, added: Date.now() };
    bookmarks.push(b);
    save();
    render();
    return b;
  }

  function remove(id) {
    bookmarks = bookmarks.filter(b => b.id !== id);
    save();
    render();
  }

  function isBookmarked(url) {
    return bookmarks.some(b => b.url === url);
  }

  function toggle(title, url) {
    if (isBookmarked(url)) {
      bookmarks = bookmarks.filter(b => b.url !== url);
      save();
      render();
      return false;
    } else {
      add(title, url);
      return true;
    }
  }

  function addFolder(name) {
    const f = { id: 'f' + Date.now(), name };
    folders.push(f);
    save();
    render();
    return f;
  }

  function removeFolder(id) {
    folders = folders.filter(f => f.id !== id);
    // Move bookmarks in that folder to root
    bookmarks.forEach(b => { if (b.folder === id) b.folder = null; });
    save();
    render();
  }

  function moveToFolder(bookmarkId, folderId) {
    const b = bookmarks.find(b => b.id === bookmarkId);
    if (b) { b.folder = folderId; save(); render(); }
  }

  function search(q) {
    if (!q) return bookmarks;
    const lower = q.toLowerCase();
    return bookmarks.filter(b => b.title.toLowerCase().includes(lower) || b.url.toLowerCase().includes(lower));
  }

  function byFolder(folderId) {
    return bookmarks.filter(b => b.folder === folderId);
  }

  function exportHTML() {
    let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
    folders.forEach(f => {
      html += `  <DT><H3>${f.name}</H3>\n  <DL><p>\n`;
      byFolder(f.id).forEach(b => {
        html += `    <DT><A HREF="${b.url}">${b.title}</A>\n`;
      });
      html += '  </DL><p>\n';
    });
    byFolder(null).forEach(b => {
      html += `  <DT><A HREF="${b.url}">${b.title}</A>\n`;
    });
    html += '</DL><p>';
    return html;
  }

  function importHTML(html) {
    // Simple parser for Netscape bookmark format
    const linkRegex = /<A HREF="([^"]+)"[^>]*>([^<]+)<\/A>/gi;
    let m;
    let count = 0;
    while ((m = linkRegex.exec(html)) !== null) {
      if (!isBookmarked(m[1])) {
        add(m[2], m[1]);
        count++;
      }
    }
    return count;
  }

  function save() { Aether.Storage.saveBookmarks(bookmarks); }
  function render() { events.onRender && events.onRender(); }

  return { init, add, remove, isBookmarked, toggle, addFolder, removeFolder, moveToFolder,
           search, byFolder, all: () => bookmarks, folders: () => folders,
           exportHTML, importHTML, events };
})();
