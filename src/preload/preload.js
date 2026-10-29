const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aether', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  toggleFullscreen: () => ipcRenderer.invoke('window-toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  onMaximizeChange: (cb) => ipcRenderer.on('maximize-changed', (_, v) => cb(v)),
  onFullscreenChange: (cb) => ipcRenderer.on('fullscreen-changed', (_, v) => cb(v)),

  // Downloads
  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_, dl) => cb(dl)),
  onDownloadUpdated: (cb) => ipcRenderer.on('download-updated', (_, dl) => cb(dl)),
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  showFileInFolder: (path) => ipcRenderer.invoke('show-file-in-folder', path),
  openFile: (path) => ipcRenderer.invoke('open-file', path),

  // Incognito
  openIncognito: () => ipcRenderer.send('open-incognito'),
  isIncognito: () => new URLSearchParams(location.search).get('incognito') === '1',

  // Context menu (sent from webview to renderer, then to main)
  showContextMenu: (info) => ipcRenderer.send('show-context-menu', info),
  onContextAction: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('context-search', (_, t) => cb({ type: 'search', text: t }));
    ipcRenderer.on('context-open-link', (_, d) => cb({ type: 'open-link', ...d }));
    ipcRenderer.on('context-back', () => cb({ type: 'back' }));
    ipcRenderer.on('context-forward', () => cb({ type: 'forward' }));
    ipcRenderer.on('context-reload', () => cb({ type: 'reload' }));
    ipcRenderer.on('context-save-pdf', () => cb({ type: 'save-pdf' }));
    ipcRenderer.on('context-view-source', () => cb({ type: 'view-source' }));
  },

  // Clear browsing data
  clearBrowsingData: (opts) => ipcRenderer.invoke('clear-browsing-data', opts),

  // Print / PDF
  savePDF: () => ipcRenderer.invoke('save-pdf'),
  printPage: () => ipcRenderer.invoke('print-page'),

  // Wallpapers
  getWallpapers: () => ipcRenderer.invoke('get-wallpapers'),
  setCustomWallpaper: () => ipcRenderer.invoke('set-custom-wallpaper'),
  readImage: (p) => ipcRenderer.invoke('read-image', p),

  // Default browser + startup
  setDefaultBrowser: () => ipcRenderer.invoke('set-default-browser'),
  setStartup: (urls) => ipcRenderer.invoke('set-startup', urls),
  getStartup: () => ipcRenderer.invoke('get-startup'),

  // Desktop capture — used as body background so liquid glass frosts the real desktop
  onDesktopBackground: (cb) => ipcRenderer.on('desktop-background', (_, data) => cb(data)),
  recaptureDesktop: () => ipcRenderer.send('recapture-desktop'),
  onPageColor: (cb) => ipcRenderer.on('page-color', (_, data) => cb(data)),
  requestPageColor: () => ipcRenderer.send('request-page-color'),
  requestPageColorForId: (id) => ipcRenderer.send('request-page-color-for-id', id),
});
