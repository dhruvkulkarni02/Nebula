const { contextBridge, ipcRenderer } = require('electron');

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

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),

  // Privacy
  clearBrowsingData: (options) => ipcRenderer.invoke('clear-browsing-data', options),

  // Event listeners for BrowserView
  onNavigation: (callback) => ipcRenderer.on('navigation-changed', callback),
  onLoadingState: (callback) => ipcRenderer.on('loading-state-changed', callback),
  onLoadError: (callback) => ipcRenderer.on('load-error', callback),

  // Remove listeners
  removeNavigationListener: (callback) => ipcRenderer.removeListener('navigation-changed', callback),
  removeLoadingStateListener: (callback) => ipcRenderer.removeListener('loading-state-changed', callback),
  removeLoadErrorListener: (callback) => ipcRenderer.removeListener('load-error', callback),
});
