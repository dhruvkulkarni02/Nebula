const { contextBridge, ipcRenderer } = require('electron');

// Ask main process synchronously for the webview preload path (avoids requiring path module here)
let __nebula_webview_preload_path = '';
try {
  __nebula_webview_preload_path = ipcRenderer.sendSync('nebula-get-webview-preload-path') || '';
  try { console.log('[Preload API] sync got webview preload path ->', __nebula_webview_preload_path); } catch {}
} catch (e) {
  try { console.warn('[Preload API] failed to sync webview preload path', e); } catch {}
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Navigation
  navigate: (url) => ipcRenderer.invoke('navigate', url),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),
  
  // BrowserView navigation
  navigateToUrl: (url) => ipcRenderer.invoke('navigateToUrl', url),

  // Tab management
  createTab: (url) => ipcRenderer.invoke('create-tab', url),
  closeTab: (tabId) => ipcRenderer.invoke('close-tab', tabId),
  switchTab: (tabId) => ipcRenderer.invoke('switch-tab', tabId),
  getTabs: () => ipcRenderer.invoke('get-tabs'),

  // Bookmarks
  addBookmark: (url, title) => ipcRenderer.invoke('add-bookmark', url, title),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  removeBookmark: (url) => ipcRenderer.invoke('remove-bookmark', url),
  exportBookmarks: () => ipcRenderer.invoke('export-bookmarks'),
  importBookmarksFromPath: (filePath) => ipcRenderer.invoke('import-bookmarks', filePath),
  importBookmarksData: (bookmarksArray) => ipcRenderer.invoke('import-bookmarks-data', bookmarksArray),
  updateBookmarkMeta: (url, meta) => ipcRenderer.invoke('update-bookmark-meta', url, meta),
  dedupeBookmarks: () => ipcRenderer.invoke('dedupe-bookmarks'),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  addToHistory: (url, title) => ipcRenderer.invoke('add-to-history', url, title),

  // Downloads
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  clearDownloads: () => ipcRenderer.invoke('clear-downloads'),
  removeDownload: (downloadId) => ipcRenderer.invoke('remove-download', downloadId),
  openDownloadLocation: (filePath) => ipcRenderer.invoke('open-download-location', filePath),
  openDownload: (filePath) => ipcRenderer.invoke('open-download', filePath),
  deleteDownloadFile: (filePath) => ipcRenderer.invoke('delete-download-file', filePath),
  showDownloadInFolder: (filePath) => ipcRenderer.invoke('open-download-location', filePath),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (_e, data) => callback?.(_e, data)),
  removeSettingsUpdatedListener: (callback) => ipcRenderer.removeListener('settings-updated', callback),
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  openReaderWindow: (html) => ipcRenderer.invoke('open-reader-window', html),

  // Privacy
  clearBrowsingData: (options) => ipcRenderer.invoke('clear-browsing-data', options),
  isPrivateWindow: () => {
    try {
      const params = new URLSearchParams(location.search || '');
      return params.get('private') === '1';
    } catch {
      return false;
    }
  },
  openPrivateWindow: () => ipcRenderer.invoke('open-private-window'),
  getAdblockStats: () => ipcRenderer.invoke('get-adblock-stats'),
  resetAdblockStats: () => ipcRenderer.invoke('reset-adblock-stats'),
  toggleAdblockForSite: (hostname, enabled) => ipcRenderer.invoke('toggle-adblock-for-site', { hostname, enabled }),

  // Site permissions
  getSitePermissions: (origin) => ipcRenderer.invoke('get-site-permissions', origin),
  setSitePermission: (origin, permission, value) => ipcRenderer.invoke('set-site-permission', { origin, permission, value }),

  // Suggestions (fetched in main to avoid CORS)
  getSuggestions: (query, engine) => ipcRenderer.invoke('get-suggestions', { query, engine }),

  // Event listeners for BrowserView
  onNavigation: (callback) => ipcRenderer.on('navigation-changed', callback),
  onLoadingState: (callback) => ipcRenderer.on('loading-state-changed', callback),
  onLoadError: (callback) => ipcRenderer.on('load-error', callback),
  onDownloadStarted: (callback) => ipcRenderer.on('download-started', (_e, data) => callback(_e, data)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_e, data) => callback(_e, data)),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (_e, data) => callback(_e, data)),

  // Remove listeners
  removeNavigationListener: (callback) => ipcRenderer.removeListener('navigation-changed', callback),
  removeLoadingStateListener: (callback) => ipcRenderer.removeListener('loading-state-changed', callback),
  removeLoadErrorListener: (callback) => ipcRenderer.removeListener('load-error', callback),
  removeDownloadStartedListener: (callback) => ipcRenderer.removeListener('download-started', callback),
  removeDownloadProgressListener: (callback) => ipcRenderer.removeListener('download-progress', callback),
  removeDownloadCompleteListener: (callback) => ipcRenderer.removeListener('download-complete', callback),

  // Gestures
  onSwipeGesture: (callback) => ipcRenderer.on('gesture-swipe', (_e, data) => callback(_e, data)),
  removeSwipeGestureListener: (callback) => ipcRenderer.removeListener('gesture-swipe', callback),

  // Global shortcuts forwarded from main
  // Returns an unsubscribe function to correctly remove the specific handler
  onShortcut: (callback) => {
    const handler = (_e, data) => callback?.(_e, data);
    ipcRenderer.on('shortcut', handler);
    return () => ipcRenderer.removeListener('shortcut', handler);
  },
  // Back-compat: direct remove if the same handler function reference was passed
  removeShortcutListener: (callback) => ipcRenderer.removeListener('shortcut', callback),

    // WebView preload path (absolute filesystem path). Return a plain path (not file://)
    getWebviewPreloadPath: () => {
      try {
        return __nebula_webview_preload_path;
      } catch {
        return '';
      }
    },
});
