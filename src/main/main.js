const { app, BrowserWindow, BrowserView, session, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;
let currentBrowserView;

// Development mode detection
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  try {
    // Configure session security before creating window
    configureSessionSecurity();

    // Create the browser window
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false, // Security: Disable node integration in renderer
        contextIsolation: true, // Security: Enable context isolation
        enableRemoteModule: false, // Security: Disable remote module
        preload: path.join(__dirname, 'preload.js'), // Use preload script for secure communication
        webSecurity: true, // Keep web security enabled
        allowRunningInsecureContent: false, // Block insecure content
        experimentalFeatures: false, // Disable experimental features
        webviewTag: true // Enable webview tag for web content
      },
      icon: path.join(__dirname, '../../assets/icon.png'), // App icon
      show: false // Don't show until ready
    });

    // Load the app
    console.log('Development mode:', isDev);
    
    if (isDev) {
      // Wait a bit for Vite server to be ready
      console.log('Waiting 1 second for Vite server...');
      setTimeout(async () => {
        try {
          console.log('Loading development URL: http://localhost:3000');
          await mainWindow.loadURL('http://localhost:3000');
          console.log('Successfully loaded development URL');
        } catch (err) {
          console.error('Failed to load development URL:', err);
          // Show window anyway so user can see the error
          mainWindow.show();
        }
      }, 1000);
      mainWindow.webContents.openDevTools(); // Open DevTools in development
    } else {
      mainWindow.loadFile(path.join(__dirname, '../../build/index.html')).catch(err => {
        console.error('Failed to load production file:', err);
        mainWindow.show(); // Show window anyway
      });
    }

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
      console.log('Window ready to show');
      mainWindow.show();
    });

    // Add additional error logging
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Main window failed to load:', {
        errorCode,
        errorDescription,
        url: validatedURL
      });
      mainWindow.show(); // Show window so user can see the error
    });

    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Main window finished loading successfully');
    });

    // Log console messages from renderer process
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[Renderer Console ${level}]:`, message);
    });

    // Log any crashes
    mainWindow.webContents.on('crashed', (event, killed) => {
      console.error('Renderer process crashed:', { killed });
    });

    // Log unresponsive renderer
    mainWindow.webContents.on('unresponsive', () => {
      console.error('Renderer process became unresponsive');
    });

    // Handle window closed
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (error) {
    console.error('Error creating window:', error);
  }

  // Security: Prevent new window creation without permission
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // For now, deny all popup windows - we'll handle this in the browser logic
    console.log('Blocked popup attempt to:', url);
    return { action: 'deny' };
  });

  // Security: Handle navigation attempts for main window only
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow navigation to localhost in development
    if (isDev && parsedUrl.origin === 'http://localhost:3000') {
      return;
    }
    
    // Block navigation away from our app in the main window
    // (but allow webview navigation)
    event.preventDefault();
    console.log('Blocked main window navigation to:', navigationUrl);
  });

  // Keep BrowserView bounds in sync on resize
  mainWindow.on('resize', () => {
    try {
      if (currentBrowserView) {
        const bounds = mainWindow.getBounds();
        const navigationHeight = 120;
        currentBrowserView.setBounds({
          x: 0,
          y: navigationHeight,
          width: bounds.width,
          height: bounds.height - navigationHeight
        });
      }
    } catch (e) {
      console.warn('Failed to update BrowserView bounds on resize:', e);
    }
  });

  // macOS: two-finger swipe gestures for back/forward
  mainWindow.on('swipe', (event, direction) => {
    try {
      mainWindow.webContents.send('gesture-swipe', { direction });
    } catch (e) {
      console.warn('Failed to propagate swipe gesture:', e);
    }
  });
}

function configureSessionSecurity() {
  try {
    const ses = session.defaultSession;

    // Security: Set secure defaults with better website compatibility
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      console.log('Permission request:', permission, 'from', webContents.getType());
      
      // Allow essential permissions for normal web functionality
      const allowedPermissions = [
        'clipboard-read',
        'clipboard-write',
        'media',
        'geolocation',
        'notifications',
        'background-sync',
        'fullscreen'
      ];
      
      const isAllowed = allowedPermissions.includes(permission);
      console.log(`Permission ${permission} ${isAllowed ? 'granted' : 'denied'}`);
      callback(isAllowed);
    });

    // Security: Permission check handler
    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      console.log('Permission check:', permission, requestingOrigin);
      
      // Allow essential permissions for web browsing
      const allowedPermissions = [
        'clipboard-read',
        'clipboard-write',
        'display-capture',
        'media',
        'microphone', 
        'camera',
        'geolocation',
        'notifications',
        'background-sync',
        'fullscreen',
        'openExternal'
      ];
      
      // For webviews, be more permissive to allow normal web functionality
      if (webContents.getType() === 'webview') {
        return allowedPermissions.includes(permission);
      }
      
      // Main window should be more restrictive
      return ['clipboard-read', 'clipboard-write'].includes(permission);
    });

    // Configure User Agent for better compatibility
    ses.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // Enable experimental web features for better compatibility
    ses.setPermissionCheckHandler = ses.setPermissionCheckHandler || (() => true);

    // Configure webview behavior
    ses.webRequest.onBeforeRequest((details, callback) => {
      // For now, allow all requests - we'll add filtering later
      callback({});
    });

    // Privacy: Clear cache on startup in development
    if (process.env.NODE_ENV === 'development') {
      ses.clearCache().catch(err => {
        console.warn('Could not clear cache:', err);
      });
    }
  } catch (error) {
    console.error('Error configuring session security:', error);
  }
}

// Create and manage BrowserView for web content
async function createBrowserView(url) {
  try {
    console.log('Creating BrowserView for URL:', url);
    
    // Destroy existing BrowserView if it exists
    if (currentBrowserView) {
      mainWindow.removeBrowserView(currentBrowserView);
      currentBrowserView.destroy();
      currentBrowserView = null;
    }

    // Create new BrowserView
    currentBrowserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        sandbox: false
      }
    });

    // Set up BrowserView
    mainWindow.setBrowserView(currentBrowserView);
    
    // Calculate position (below the navigation bar)
    const bounds = mainWindow.getBounds();
    const navigationHeight = 120; // Height for navigation + tabs
    
    currentBrowserView.setBounds({
      x: 0,
      y: navigationHeight,
      width: bounds.width,
      height: bounds.height - navigationHeight
    });

    // Set up event listeners
    currentBrowserView.webContents.on('did-finish-load', () => {
      console.log('BrowserView loaded successfully');
      const currentUrl = currentBrowserView.webContents.getURL();
      const title = currentBrowserView.webContents.getTitle();
      mainWindow.webContents.send('navigation-changed', { url: currentUrl, title });
    });

    currentBrowserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.log('BrowserView load failed:', errorCode, errorDescription);
      mainWindow.webContents.send('load-error', { 
        errorCode, 
        errorDescription, 
        url: validatedURL 
      });
    });

    // Load the URL
    if (url && url !== 'about:blank') {
      await currentBrowserView.webContents.loadURL(url);
    }

    return currentBrowserView;
  } catch (error) {
    console.error('Error creating BrowserView:', error);
    throw error;
  }
}

// IPC Handlers for browser functionality
function setupIpcHandlers() {
  // Navigation handlers
  ipcMain.handle('navigate', async (event, url) => {
    console.log('Navigate request:', url);
    return { success: true };
  });

  // Simple navigation for testing
  ipcMain.handle('navigateToUrl', async (event, url) => {
    console.log('NavigateToUrl request:', url);
    return { success: true, url };
  });

  ipcMain.handle('go-back', async (event) => {
    console.log('Go back request');
    return { success: true };
  });

  ipcMain.handle('go-forward', async (event) => {
    console.log('Go forward request');
    return { success: true };
  });

  ipcMain.handle('reload', async (event) => {
    console.log('Reload request');
    return { success: true };
  });

  // Tab management handlers
  ipcMain.handle('create-tab', async (event, url) => {
    console.log('Create tab request:', url);
    return { success: true };
  });

  ipcMain.handle('close-tab', async (event, tabId) => {
    console.log('Close tab request:', tabId);
    return { success: true };
  });

  ipcMain.handle('switch-tab', async (event, tabId) => {
    console.log('Switch tab request:', tabId);
    return { success: true };
  });

  // Bookmark handlers - Simple file-based storage
  const fs = require('fs');
  const path = require('path');
  const { app } = require('electron');
  
  const getBookmarksPath = () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'bookmarks.json');
  };

  const loadBookmarks = () => {
    try {
      const bookmarksPath = getBookmarksPath();
      if (fs.existsSync(bookmarksPath)) {
        const data = fs.readFileSync(bookmarksPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }
    return [];
  };

  const saveBookmarks = (bookmarks) => {
    try {
      const bookmarksPath = getBookmarksPath();
      const userDataPath = path.dirname(bookmarksPath);
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving bookmarks:', error);
      return false;
    }
  };

  ipcMain.handle('add-bookmark', async (event, url, title) => {
    console.log('Add bookmark request:', url, title);
    try {
      const bookmarks = loadBookmarks();
      const bookmark = { url, title: title || url, dateAdded: new Date().toISOString() };
      
      // Check if bookmark already exists
      const existingIndex = bookmarks.findIndex(b => b.url === url);
      if (existingIndex >= 0) {
        bookmarks[existingIndex] = bookmark; // Update existing
      } else {
        bookmarks.push(bookmark); // Add new
      }
      
      const success = saveBookmarks(bookmarks);
      return { success };
    } catch (error) {
      console.error('Error adding bookmark:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('remove-bookmark', async (event, url) => {
    console.log('Remove bookmark request:', url);
    try {
      const bookmarks = loadBookmarks();
      const filteredBookmarks = bookmarks.filter(b => b.url !== url);
      const success = saveBookmarks(filteredBookmarks);
      return { success };
    } catch (error) {
      console.error('Error removing bookmark:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-bookmarks', async (event) => {
    console.log('Get bookmarks request');
    try {
      const bookmarks = loadBookmarks();
      return bookmarks;
    } catch (error) {
      console.error('Error getting bookmarks:', error);
      return [];
    }
  });

  // History management - Simple file-based storage
  const getHistoryPath = () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'history.json');
  };

  const loadHistory = () => {
    try {
      const historyPath = getHistoryPath();
      if (fs.existsSync(historyPath)) {
        const data = fs.readFileSync(historyPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    }
    return [];
  };

  const saveHistory = (history) => {
    try {
      const historyPath = getHistoryPath();
      const userDataPath = path.dirname(historyPath);
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      // Keep only last 1000 entries to prevent file from getting too large
      const limitedHistory = history.slice(-1000);
      fs.writeFileSync(historyPath, JSON.stringify(limitedHistory, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving history:', error);
      return false;
    }
  };

  const addToHistory = (url, title) => {
    try {
      if (!url || url === 'about:blank') return;
      
      const history = loadHistory();
      const historyItem = {
        url,
        title: title || url,
        visitTime: new Date().toISOString()
      };
      
      // Remove existing entry for this URL if it exists
      const filteredHistory = history.filter(item => item.url !== url);
      
      // Add new entry at the end
      filteredHistory.push(historyItem);
      
      saveHistory(filteredHistory);
    } catch (error) {
      console.error('Error adding to history:', error);
    }
  };

  ipcMain.handle('get-history', async (event) => {
    console.log('Get history request');
    try {
      const history = loadHistory();
      // Return history sorted by visit time (newest first)
      return history.sort((a, b) => new Date(b.visitTime) - new Date(a.visitTime));
    } catch (error) {
      console.error('Error getting history:', error);
      return [];
    }
  });

  ipcMain.handle('clear-history', async (event) => {
    console.log('Clear history request');
    try {
      const success = saveHistory([]);
      return { success };
    } catch (error) {
      console.error('Error clearing history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('add-to-history', async (event, url, title) => {
    console.log('Add to history request:', url, title);
    try {
      addToHistory(url, title);
      return { success: true };
    } catch (error) {
      console.error('Error adding to history:', error);
      return { success: false, error: error.message };
    }
  });

  // Downloads management - Simple file-based storage
  const getDownloadsPath = () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'downloads.json');
  };

  const loadDownloads = () => {
    try {
      const downloadsPath = getDownloadsPath();
      if (fs.existsSync(downloadsPath)) {
        const data = fs.readFileSync(downloadsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading downloads:', error);
    }
    return [];
  };

  const saveDownloads = (downloads) => {
    try {
      const downloadsPath = getDownloadsPath();
      const userDataPath = path.dirname(downloadsPath);
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      fs.writeFileSync(downloadsPath, JSON.stringify(downloads, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving downloads:', error);
      return false;
    }
  };

  // Downloads IPC handlers
  ipcMain.handle('get-downloads', async (event) => {
    console.log('Get downloads request');
    try {
      const downloads = loadDownloads();
      // Return downloads sorted by date (newest first)
      return downloads.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    } catch (error) {
      console.error('Error getting downloads:', error);
      return [];
    }
  });

  ipcMain.handle('clear-downloads', async (event) => {
    console.log('Clear downloads request');
    try {
      const success = saveDownloads([]);
      return { success };
    } catch (error) {
      console.error('Error clearing downloads:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('remove-download', async (event, downloadId) => {
    console.log('Remove download request:', downloadId);
    try {
      const downloads = loadDownloads();
      const filteredDownloads = downloads.filter(d => d.id !== downloadId);
      const success = saveDownloads(filteredDownloads);
      return { success };
    } catch (error) {
      console.error('Error removing download:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-download-location', async (event, filePath) => {
    console.log('Open download location request:', filePath);
    try {
      if (fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return { success: true };
      } else {
        return { success: false, error: 'File not found' };
      }
    } catch (error) {
      console.error('Error opening download location:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-download', async (event, filePath) => {
    console.log('Open download request:', filePath);
    try {
      if (fs.existsSync(filePath)) {
        await shell.openPath(filePath);
        return { success: true };
      } else {
        return { success: false, error: 'File not found' };
      }
    } catch (error) {
      console.error('Error opening download:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-download-file', async (event, filePath) => {
    console.log('Delete download file request:', filePath);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { success: true };
      } else {
        return { success: false, error: 'File not found' };
      }
    } catch (error) {
      console.error('Error deleting download file:', error);
      return { success: false, error: error.message };
    }
  });

  // Settings storage (Phase 2: preferences groundwork)
  const getSettingsPath = () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'settings.json');
  };

  const loadSettings = () => {
    try {
      const p = getSettingsPath();
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
    return {};
  };

  const saveSettings = (settings) => {
    try {
      const p = getSettingsPath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(settings, null, 2));
      return true;
    } catch (e) {
      console.warn('Failed to save settings:', e);
      return false;
    }
  };

  ipcMain.handle('get-settings', async () => {
    console.log('Get settings request');
    return loadSettings();
  });

  ipcMain.handle('update-settings', async (event, partial) => {
    console.log('Update settings request:', partial);
    const current = loadSettings();
    const updated = { ...current, ...(partial || {}) };
    const ok = saveSettings(updated);
    return { success: ok, settings: updated };
  });

  // Back-compat simple handlers
  ipcMain.handle('get-setting', async (event, key) => {
    const s = loadSettings();
    return { value: s[key] };
  });

  ipcMain.handle('set-setting', async (event, key, value) => {
    const s = loadSettings();
    s[key] = value;
    return { success: saveSettings(s) };
  });

  // Privacy handlers (placeholder implementations)
  ipcMain.handle('enable-private-mode', async (event) => {
    console.log('Enable private mode request');
    return { success: true };
  });

  ipcMain.handle('toggle-ad-blocker', async (event, enabled) => {
    console.log('Toggle ad blocker request:', enabled);
    return { success: true };
  });

  ipcMain.handle('clear-browsing-data', async (event, options) => {
    console.log('Clear browsing data request:', options);
    return { success: true };
  });

  // Bookmarks import/export (Phase 2: organization groundwork)
  ipcMain.handle('export-bookmarks', async () => {
    try {
      const bookmarks = loadBookmarks();
      const userDataPath = app.getPath('userData');
      const exportDir = path.join(userDataPath, 'exports');
      if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const exportPath = path.join(exportDir, `bookmarks-${ts}.json`);
      fs.writeFileSync(exportPath, JSON.stringify(bookmarks, null, 2));
      shell.showItemInFolder(exportPath);
      return { success: true, path: exportPath };
    } catch (e) {
      console.error('Export bookmarks failed:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('import-bookmarks', async (event, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(data)) {
        return { success: false, error: 'Invalid bookmarks format' };
      }
      const existing = loadBookmarks();
      const map = new Map(existing.map(b => [b.url, b]));
      for (const b of data) {
        if (b && b.url) map.set(b.url, { url: b.url, title: b.title || b.url, dateAdded: b.dateAdded || new Date().toISOString() });
      }
      const merged = Array.from(map.values());
      saveBookmarks(merged);
      return { success: true, count: merged.length };
    } catch (e) {
      console.error('Import bookmarks failed:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('import-bookmarks-data', async (event, bookmarksArray) => {
    try {
      if (!Array.isArray(bookmarksArray)) {
        return { success: false, error: 'Invalid bookmarks array' };
      }
      const existing = loadBookmarks();
      const map = new Map(existing.map(b => [b.url, b]));
      for (const b of bookmarksArray) {
        if (b && b.url) map.set(b.url, { url: b.url, title: b.title || b.url, dateAdded: b.dateAdded || new Date().toISOString() });
      }
      const merged = Array.from(map.values());
      saveBookmarks(merged);
      return { success: true, count: merged.length };
    } catch (e) {
      console.error('Import bookmarks data failed:', e);
      return { success: false, error: e.message };
    }
  });
}

// Setup IPC handlers before app is ready
setupIpcHandlers();

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Per user request: closing all tabs/windows should quit the app on all platforms
  app.quit();
});

app.on('activate', () => {
  // Only recreate a window if needed; if user closed all tabs, they expect app to stay closed unless launched
  if (BrowserWindow.getAllWindows().length === 0 && !app.isQuitting) {
    createWindow();
  }
});

// Security: Prevent navigation to external protocols (but allow webview navigation)
app.on('web-contents-created', (event, contents) => {
  const type = contents.getType();
  console.log('Web contents created:', type);
  
  // Only apply restrictions to main window, not webview contents
  if (type === 'window') {
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);

      if (parsedUrl.origin !== 'http://localhost:3000' && process.env.NODE_ENV === 'development') {
        event.preventDefault();
        console.log('Blocked main window navigation to:', navigationUrl);
      }
    });
    
    // Prevent new window creation from main window
    contents.setWindowOpenHandler(({ url }) => {
      console.log('Blocked window open attempt from main window:', url);
      return { action: 'deny' };
    });
  } else if (type === 'webview' || type === 'remote') {
    console.log('Webview/remote content created, allowing navigation');
    // Allow webview to navigate freely - this is what we want for browsing
    contents.setWindowOpenHandler(({ url }) => {
      console.log('Webview trying to open window:', url);
      // For now, block popups but allow navigation
      return { action: 'deny' };
    });
    
    // Don't block navigation for webview content
    contents.on('will-navigate', (event, navigationUrl) => {
      console.log('Webview navigating to:', navigationUrl);
      // Allow navigation for webview
    });
  } else {
    console.log('Unknown content type:', type, 'allowing navigation');
  }
});
