// downloads.js — Download tracking with progress, open, show-in-folder
window.Aether = window.Aether || {};

Aether.Downloads = (() => {
  let items = [];
  let events = { onRender: null };

  function init() {
    window.aether.getDownloads().then(dls => { items = dls || []; });
    window.aether.onDownloadStarted(dl => { items.unshift(dl); render(); });
    window.aether.onDownloadUpdated(dl => {
      const idx = items.findIndex(d => d.filename === dl.filename && d.url === dl.url);
      if (idx >= 0) items[idx] = dl;
      else items.unshift(dl);
      render();
    });
  }

  function progress(dl) {
    if (!dl.total || dl.total <= 0) return dl.state === 'completed' ? 100 : 0;
    return Math.round((dl.received / dl.total) * 100);
  }

  function openFile(dl) {
    if (dl.savePath) window.aether.openFile(dl.savePath);
  }
  function showInFolder(dl) {
    if (dl.savePath) window.aether.showFileInFolder(dl.savePath);
  }
  function openDownloadsFolder() { window.aether.openDownloadsFolder(); }

  function all() { return items; }
  function render() { events.onRender && events.onRender(); }

  return { init, progress, openFile, showInFolder, openDownloadsFolder, all, events };
})();
