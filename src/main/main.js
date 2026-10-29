const { app, BrowserWindow, ipcMain, session, Menu, shell, dialog, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');

let mainWindow;
let incognitoWindows = [];
let downloadedItems = [];

const ASSETS = path.join(__dirname, '..', '..', 'assets');

// ---------- Fetch the OS desktop wallpaper file ----------
function getWallpaperPath() {
  try {
    if (process.platform === 'win32') {
      // Windows: query the registry for the wallpaper path
      const out = execSync('reg query "HKCU\\Control Panel\\Desktop" /v WallPaper', { encoding: 'utf8' });
      const m = out.match(/WallPaper\s+REG_SZ\s+(.+)/);
      if (m && m[1].trim() && fs.existsSync(m[1].trim())) return m[1].trim();
      // Fallback: transcoded wallpaper
      const transcoded = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
      if (fs.existsSync(transcoded)) return transcoded;
    } else if (process.platform === 'darwin') {
      // macOS: use AppleScript
      const out = execSync('osascript -e \'tell application "System Events" to get picture of every desktop\'', { encoding: 'utf8' });
      const p = out.trim().split('\n')[0].trim();
      if (p && fs.existsSync(p)) return p;
    } else if (process.platform === 'linux') {
      // Linux: try gsettings (GNOME), then plasma-convert, then various config files
      try {
        const out = execSync('gsettings get org.gnome.desktop.background picture-uri', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const p = out.trim().replace(/^file:\/\//, '').replace(/^'|'$/g, '');
        if (p && fs.existsSync(p)) return p;
      } catch {}
      try {
        const out = execSync('gsettings get org.gnome.desktop.background picture-uri-dark', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const p = out.trim().replace(/^file:\/\//, '').replace(/^'|'$/g, '');
        if (p && fs.existsSync(p)) return p;
      } catch {}
    }
  } catch (e) {}
  return null;
}

function sendWallpaper() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wpPath = getWallpaperPath();
  if (wpPath) {
    try {
      const data = fs.readFileSync(wpPath);
      const ext = path.extname(wpPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${data.toString('base64')}`;
      mainWindow.webContents.send('desktop-background', { image: dataUrl });
    } catch (e) {}
  }
}

// ---------- Main window ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#1a2840',
    icon: path.join(ASSETS, 'icon.png'),
    title: 'Aether',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
      experimentalFeatures: true
    }
  });

  if (process.platform === 'linux') mainWindow.setIcon(path.join(ASSETS, 'icon-256.png'));

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'browser.html'));
  mainWindow.once('ready-to-show', () => { mainWindow.show(); sendWallpaper(); });

  // No need to recapture on move/resize — the wallpaper is static
  ipcMain.on('recapture-desktop', () => sendWallpaper());

  // Window control IPC
  ipcMain.on('window-minimize', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('window-maximize', e => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.on('window-close', e => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.handle('window-is-maximized', e => BrowserWindow.fromWebContents(e.sender)?.isMaximized() || false);
  ipcMain.handle('window-toggle-fullscreen', e => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return false;
    const fs = !w.isFullScreen();
    w.setFullScreen(fs);
    return fs;
  });
  ipcMain.handle('window-is-fullscreen', e => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() || false);

  mainWindow.on('maximize', () => mainWindow.webContents.send('maximize-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('maximize-changed', false));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-changed', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-changed', false));

  setupCommonHandlers();
}

// ---------- Page color capture (top-level so IPC handler can access it) ----------
let activeColorWebContents = null; // Track which webContents is the active one

function captureColor(c) {
  try {
    activeColorWebContents = c;
    c.executeJavaScript(
      'var bg = getComputedStyle(document.body).backgroundColor;' +
      'if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {' +
      '  bg = getComputedStyle(document.documentElement).backgroundColor;' +
      '}' +
      'if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {' +
      '  bg = "rgb(255, 255, 255)";' +
      '}' +
      'bg;'
    ).then(function(result) {
      // Only apply if no newer request has been made
      if (activeColorWebContents !== c) return; // A different tab is now active
      var m = result.match(/\d+/g);
      if (m && m.length >= 3) {
        var r = parseInt(m[0]), g = parseInt(m[1]), b = parseInt(m[2]);
        if (r >= 250 && g >= 250 && b >= 250) { r = 240; g = 240; b = 240; }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('page-color', { r: r, g: g, b: b });
        }
      }
    }).catch(function() {});
  } catch (e) {}
}

// ---------- Native context menu for ALL webContents (including webviews) ----------
// This uses Chromium's built-in context menu which automatically closes on outside click
app.whenReady().then(() => {
  const { Menu } = require('electron');
  app.on('web-contents-created', (event, contents) => {
    contents.on('context-menu', (e, params) => {
      e.preventDefault();
      const win = BrowserWindow.fromWebContents(contents) || mainWindow;
      if (!win) return;

      const menuItems = [];

      // Spellcheck suggestions
      if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        params.dictionarySuggestions.forEach(suggestion => {
          menuItems.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
        });
        menuItems.push({ type: 'separator' });
      }

      // Edit actions
      if (params.isEditable) {
        if (params.editFlags.canUndo) menuItems.push({ label: 'Undo', role: 'undo', enabled: params.editFlags.canUndo });
        if (params.editFlags.canRedo) menuItems.push({ label: 'Redo', role: 'redo', enabled: params.editFlags.canRedo });
        if (menuItems.length > 0) menuItems.push({ type: 'separator' });
        if (params.editFlags.canCut) menuItems.push({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut });
        if (params.editFlags.canCopy) menuItems.push({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy });
        if (params.editFlags.canPaste) menuItems.push({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste });
        if (params.editFlags.canSelectAll) menuItems.push({ label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll });
        menuItems.push({ type: 'separator' });
      } else if (params.selectionText) {
        menuItems.push({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy });
        menuItems.push({ label: 'Search "' + params.selectionText.slice(0, 25) + (params.selectionText.length > 25 ? '…' : '') + '"',
          click: () => win.webContents.send('context-search', params.selectionText) });
        menuItems.push({ type: 'separator' });
      }

      // Link actions
      if (params.linkURL) {
        menuItems.push({ label: 'Open link in new tab', click: () => win.webContents.send('context-open-link', { url: params.linkURL }) });
        menuItems.push({ label: 'Copy link address', click: () => { clipboard.writeText(params.linkURL); } });
        menuItems.push({ type: 'separator' });
      }

      // Image actions
      if (params.srcURL) {
        menuItems.push({ label: 'Open image in new tab', click: () => win.webContents.send('context-open-link', { url: params.srcURL }) });
        menuItems.push({ label: 'Copy image address', click: () => { clipboard.writeText(params.srcURL); } });
        menuItems.push({ label: 'Save image as…', click: () => { contents.downloadURL(params.srcURL); } });
        menuItems.push({ type: 'separator' });
      }

      // Navigation
      menuItems.push({ label: 'Back', click: () => { if (contents.canGoBack()) contents.goBack(); }, enabled: contents.canGoBack() });
      menuItems.push({ label: 'Forward', click: () => { if (contents.canGoForward()) contents.goForward(); }, enabled: contents.canGoForward() });
      menuItems.push({ label: 'Reload', click: () => contents.reload() });
      menuItems.push({ type: 'separator' });

      // Page actions
      menuItems.push({ label: 'Save as…', click: () => contents.downloadURL(params.pageURL) });
      menuItems.push({ label: 'Print…', click: () => contents.print({ printBackground: true }) });
      menuItems.push({ label: 'Save as PDF…', click: () => {
        dialog.showSaveDialog(win, { title: 'Save as PDF', defaultPath: 'page.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })
          .then(r => { if (!r.canceled) contents.printToPDF({ printBackground: true }).then(buf => fs.writeFileSync(r.filePath, buf)); });
      }});
      menuItems.push({ label: 'View Source', click: () => win.webContents.send('context-open-link', { url: 'view-source:' + params.pageURL }) });
      menuItems.push({ type: 'separator' });
      menuItems.push({ label: 'Inspect', click: () => contents.openDevTools({ mode: 'detach' }) });

      const menu = Menu.buildFromTemplate(menuItems);
      menu.popup(win);
    });

    // Get page color via executeJavaScript from the MAIN process
    // This bypasses cross-origin restrictions that block renderer-side executeJavaScript
    function sendPageColor(c) {
      try {
        const win = BrowserWindow.fromWebContents(c.hostWebContents || c) || mainWindow;
        if (win) win.webContents.send('page-color', null); // placeholder
      } catch {}
    }

    // Reset to dark during navigation start — ONLY for the active tab
    contents.on('did-start-loading', () => {
      var url = contents.getURL();
      if (url && (url.startsWith('http://') || url.startsWith('https://')) && activeColorWebContents === contents) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('page-color', { r: 0, g: 0, b: 0 });
        }
      }
    });

    // Only capture color if this webContents IS the active one
    // Background tabs loading pages should NOT overwrite the active tab's color
    contents.on('did-stop-loading', () => {
      var url = contents.getURL();
      if (url && (url.startsWith('http://') || url.startsWith('https://')) && activeColorWebContents === contents) {
        setTimeout(() => { if (activeColorWebContents === contents) captureColor(contents); }, 200);
      }
    });

    contents.on('did-navigate-in-page', () => {
      var url = contents.getURL();
      if (url && (url.startsWith('http://') || url.startsWith('https://')) && activeColorWebContents === contents) {
        setTimeout(() => { if (activeColorWebContents === contents) captureColor(contents); }, 200);
      }
    });
  });

  // Renderer requests page color for a specific webview by ID
  ipcMain.on('request-page-color-for-id', (event, id) => {
    var wc = require('electron').webContents.fromId(id);
    if (wc) captureColor(wc);
  });

  // Renderer requests page color for the active webview (fallback)
  ipcMain.on('request-page-color', (event) => {
    var allContents = require('electron').webContents.getAllWebContents();
    for (var i = 0; i < allContents.length; i++) {
      var c = allContents[i];
      var url = c.getURL();
      if (url && (url.startsWith('http://') || url.startsWith('https://')) && c.hostWebContents === event.sender) {
        captureColor(c);
        return;
      }
    }
  });
});

// ---------- Incognito window ----------
function createIncognitoWindow() {
  const incognito = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#2a1a40',
    icon: path.join(ASSETS, 'icon.png'),
    title: 'Aether — Incognito',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
      partition: 'incognito' // separate session — no persistent storage
    }
  });

  // Ensure incognito session doesn't persist anything
  const ses = session.fromPartition('incognito', { cache: false });
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false));

  incognito.loadFile(path.join(__dirname, '..', 'renderer', 'browser.html'), { query: { incognito: '1' } });

  incognitoWindows.push(incognito);
  incognito.on('closed', () => {
    incognitoWindows = incognitoWindows.filter(w => w !== incognito);
    // Clear incognito session data on close
    ses.clearStorageData().catch(() => {});
    ses.clearCache().catch(() => {});
  });
  return incognito;
}

// ---------- Common handlers ----------
function setupCommonHandlers() {
  // Permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['geolocation', 'media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  // Downloads
  // Downloads — show Save As dialog once per download (prevent duplicates)
  let downloadHandled = new Set();
  session.defaultSession.on('will-download', (event, item, webContents) => {
    // Use a unique key to prevent double-handling
    const key = item.getURL() + item.getFilename() + Date.now();
    if (downloadHandled.has(key)) { event.preventDefault(); return; }
    downloadHandled.add(key);
    setTimeout(() => downloadHandled.delete(key), 5000);

    const target = webContents ? BrowserWindow.fromWebContents(webContents) || mainWindow : mainWindow;
    const defaultPath = path.join(app.getPath('downloads'), item.getFilename());
    dialog.showSaveDialog(target, {
      title: 'Save As',
      defaultPath: defaultPath,
      filters: [{ name: 'All Files', extensions: ['*'] }]
    }).then(result => {
      if (result.canceled) { item.cancel(); return; }
      item.setSavePath(result.filePath);
      const filePath = item.getSavePath();
      const dl = { filename: path.basename(filePath), url: item.getURL(), state: 'progressing', received: 0, total: item.getTotalBytes(), savePath: filePath };
      downloadedItems.unshift(dl);
      target.webContents.send('download-started', dl);
      item.on('updated', (e, state) => {
        dl.state = state;
        dl.received = item.getReceivedBytes();
        target.webContents.send('download-updated', dl);
      });
      item.once('done', (e, state) => {
        dl.state = state;
        target.webContents.send('download-updated', dl);
      });
    }).catch(() => { item.setSavePath(defaultPath); });
  });

  ipcMain.handle('get-downloads', () => downloadedItems);
  ipcMain.handle('open-downloads-folder', () => shell.openPath(app.getPath('downloads')));
  ipcMain.handle('show-file-in-folder', (e, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle('open-file', (e, filePath) => shell.openPath(filePath));

  // Incognito
  ipcMain.on('open-incognito', () => createIncognitoWindow());

  // Context menu (per-webview)
  ipcMain.on('show-context-menu', (e, info) => {
    const wc = e.sender;
    const menu = buildContextMenu(wc, info);
    const win = BrowserWindow.fromWebContents(wc);
    if (win) menu.popup(win);
  });

  // Clear browsing data
  ipcMain.handle('clear-browsing-data', async (e, opts) => {
    const ses = wcToSession(e.sender);
    await ses.clearStorageData({
      storages: []
        .concat(opts.cookies ? ['cookies'] : [])
        .concat(opts.cache ? ['serviceworkers', 'shadercache', 'cachestorage'] : [])
        .concat(opts.localStorage ? ['localstorage', 'indexdb'] : [])
    });
    if (opts.cache) await ses.clearCache().catch(() => {});
    return true;
  });

  // Save as PDF
  ipcMain.handle('save-pdf', async (e) => {
    const wc = e.sender;
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(wc), {
      title: 'Save as PDF',
      defaultPath: 'page.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return false;
    try {
      await wc.printToPDF({ printBackground: true });
      fs.writeFileSync(result.filePath, await wc.printToPDF({ printBackground: true }));
      return true;
    } catch (err) { return false; }
  });

  // Print
  ipcMain.handle('print-page', (e) => {
    e.sender.print({ printBackground: true });
    return true;
  });

  // Wallpaper list (from assets folder + user wallpapers dir)
  ipcMain.handle('get-wallpapers', () => {
    const list = [];
    const builtIn = ['wallpaper.jpg'];
    builtIn.forEach(f => {
      const p = path.join(ASSETS, f);
      if (fs.existsSync(p)) list.push({ name: f.replace(/\.\w+$/, ''), path: p, builtIn: true });
    });
    // User wallpapers
    const userDir = path.join(app.getPath('userData'), 'wallpapers');
    if (fs.existsSync(userDir)) {
      fs.readdirSync(userDir).forEach(f => {
        if (/\.(jpg|jpeg|png|webp)$/i.test(f)) {
          list.push({ name: f.replace(/\.\w+$/, ''), path: path.join(userDir, f), builtIn: false });
        }
      });
    }
    return list;
  });

  ipcMain.handle('set-custom-wallpaper', async (e) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Choose wallpaper',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile']
    });
    if (result.canceled) return null;
    const userDir = path.join(app.getPath('userData'), 'wallpapers');
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    const dest = path.join(userDir, 'wallpaper-' + Date.now() + path.extname(result.filePaths[0]));
    fs.copyFileSync(result.filePaths[0], dest);
    return dest;
  });

  ipcMain.handle('read-image', (e, p) => {
    try { return 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64'); }
    catch { return null; }
  });

  // Default browser check
  ipcMain.handle('set-default-browser', () => {
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');
    return true;
  });

  // Startup behavior
  ipcMain.handle('set-startup', (e, urls) => {
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'startup.json'), JSON.stringify(urls));
      return true;
    } catch { return false; }
  });
  ipcMain.handle('get-startup', () => {
    try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'startup.json'), 'utf8')); }
    catch { return []; }
  });
}

function wcToSession(wc) {
  // webviews have their own session; main webContents uses default
  return wc.session || session.defaultSession;
}

// ---------- Context menu builder ----------
function buildContextMenu(wc, info) {
  const items = [];
  const { x, y, linkURL, srcURL, selectionText, misspelledWord, editFlags } = info;

  if (selectionText) {
    items.push({ label: 'Copy', click: () => wc.copy() });
    items.push({ label: 'Search "' + selectionText.slice(0, 20) + (selectionText.length > 20 ? '…' : '') + '"', click: () => wc.send('context-search', selectionText) });
    items.push({ type: 'separator' });
  }
  if (linkURL) {
    items.push({ label: 'Open link in new tab', click: () => wc.send('context-open-link', { url: linkURL, newTab: true }) });
    items.push({ label: 'Open link in new window', click: () => wc.send('context-open-link', { url: linkURL, newTab: false }) });
    items.push({ label: 'Copy link address', click: () => clipboard.writeText(linkURL) });
    items.push({ type: 'separator' });
  }
  if (srcURL && /\.(jpg|jpeg|png|gif|webp|svg)/i.test(srcURL)) {
    items.push({ label: 'Open image in new tab', click: () => wc.send('context-open-link', { url: srcURL, newTab: true }) });
    items.push({ label: 'Copy image address', click: () => clipboard.writeText(srcURL) });
    items.push({ label: 'Save image as…', click: () => wc.downloadURL(srcURL) });
    items.push({ type: 'separator' });
  }
  if (editFlags && (editFlags.canCopy || editFlags.canCut || editFlags.canPaste)) {
    if (editFlags.canCut) items.push({ label: 'Cut', click: () => wc.cut() });
    if (editFlags.canCopy) items.push({ label: 'Copy', click: () => wc.copy() });
    if (editFlags.canPaste) items.push({ label: 'Paste', click: () => wc.paste() });
    if (editFlags.canUndo) items.push({ label: 'Undo', click: () => wc.undo() });
    if (editFlags.canRedo) items.push({ label: 'Redo', click: () => wc.redo() });
    if (editFlags.canSelectAll) items.push({ label: 'Select All', click: () => wc.selectAll() });
    items.push({ type: 'separator' });
  }
  items.push({ label: 'Back', click: () => wc.send('context-back') });
  items.push({ label: 'Forward', click: () => wc.send('context-forward') });
  items.push({ label: 'Reload', click: () => wc.send('context-reload') });
  items.push({ type: 'separator' });
  items.push({ label: 'Save as…', click: () => wc.downloadURL(wc.getURL()) });
  items.push({ label: 'Print…', click: () => wc.print({ printBackground: true }) });
  items.push({ label: 'Save as PDF…', click: () => wc.send('context-save-pdf') });
  items.push({ label: 'View Source', click: () => wc.send('context-view-source') });
  items.push({ type: 'separator' });
  items.push({ label: 'Inspect', click: () => wc.openDevTools({ mode: 'detach' }) });

  return Menu.buildFromTemplate(items);
}

// ---------- App menu ----------
const template = [
  { role: 'appMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu', submenu: [
    { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
    { type: 'separator' },
    { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
    { type: 'separator' },
    { role: 'minimize' }, { role: 'close' }
  ]}
];
Menu.setApplicationMenu(Menu.buildFromTemplate(template));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
