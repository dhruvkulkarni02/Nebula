const { app, BrowserWindow, BrowserView, session, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
// Adblock engine imports
let fetchImpl = null;
try { fetchImpl = require('cross-fetch'); } catch (e) { fetchImpl = global.fetch; }
let ElectronBlocker = null;
try {
  ElectronBlocker = require('@cliqz/adblocker-electron').ElectronBlocker;
} catch (e) {
  ElectronBlocker = null;
}

let blockerInstance = null;

// Synchronous IPC for renderer/preload to fetch the absolute webview preload path
try {
  ipcMain.on('nebula-get-webview-preload-path', (event) => {
    try {
      event.returnValue = path.resolve(__dirname, 'webview-preload.js');
    } catch (e) {
      event.returnValue = '';
    }
  });
} catch (e) {}

// Keep a global reference of the window object
let mainWindow;
let settingsWindow;
let currentBrowserView;
// Simple content blocking state and helpers
// Enable ad blocking by default to reduce noisy ads during dev and testing
let adBlockEnabled = true;
let adBlockStats = { blocked: 0, allowed: 0 };
let adBlockAllowlist = new Set(); // hostnames for which blocking is disabled
let filterEngine = null;
// Circular buffer of recent blocked requests for diagnostics (dev-only)
const LAST_BLOCKED_MAX = 200;
const lastBlocked = [];
function pushBlockedEntry(entry) {
  try {
    const e = Object.assign({ ts: Date.now() }, entry || {});
    lastBlocked.push(e);
    if (lastBlocked.length > LAST_BLOCKED_MAX) lastBlocked.shift();
  } catch (e) {}
}

// Expose IPC for diagnostics: get and clear last-blocked entries
try {
  ipcMain.handle('get-last-blocked', async () => {
    return { entries: lastBlocked.slice().reverse() };
  });
  ipcMain.handle('clear-last-blocked', async () => {
    lastBlocked.length = 0; return { success: true };
  });
} catch (e) {}

// Fetch helper using native https (with timeout)
function fetchText(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const https = require('https');
      const req = https.get(url, { timeout }, (res) => {
        if (res.statusCode && res.statusCode >= 400) return resolve(null);
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { try { req.destroy(); } catch {} ; resolve(null); });
    } catch (e) { resolve(null); }
  });
}

async function initFullFilters() {
  try {
    // Prefer a maintained ElectronBlocker when available for full EasyList semantics
      try {
        if (!blockerInstance && ElectronBlocker) {
          const crossFetch = require('cross-fetch');
          // First attempt: try to initialize from prebuilt bundle (fast path)
          try {
            if (typeof ElectronBlocker.fromPrebuiltFull === 'function') {
              const blocker = await ElectronBlocker.fromPrebuiltFull(crossFetch);
              blockerInstance = blocker;
              // By default, do NOT enable the engine's cosmetic/mutation-based injections here because
              // they can modify <script> elements or use MutationObservers that trigger Trusted Types/CSP errors
              // in complex sites (e.g., YouTube). Keep network filters active and manage cosmetics conservatively.
              try {
                if (blockerInstance.config) {
                  blockerInstance.config.loadCosmeticFilters = false;
                  blockerInstance.config.enableMutationObserver = false;
                }
              } catch (e) {}
              try { blockerInstance.enableBlockingInSession(session.defaultSession); console.log('[Adblock] ElectronBlocker initialized (prebuilt) and attached to default session (cosmetics disabled)'); } catch (e) { console.warn('Failed to attach ElectronBlocker to session:', e?.message || e); }
              return { engine: 'electron-blocker', instance: blockerInstance };
            }
          } catch (err) {
            console.warn('ElectronBlocker.fromPrebuiltFull failed (or not available), will try fromLists:', err?.message || err);
          }

          // Second attempt: explicitly load known lists and initialize from them
          try {
            const adblock = require('@cliqz/adblocker');
            // Prefer the most-complete list set available in the package
            const lists = Array.isArray(adblock.fullLists) ? adblock.fullLists : (Array.isArray(adblock.adsAndTrackingLists) ? adblock.adsAndTrackingLists : (Array.isArray(adblock.adsLists) ? adblock.adsLists : []));
            if (!Array.isArray(lists) || lists.length === 0) {
              throw new Error('No adblock lists available from @cliqz/adblocker');
            }
            // Defensive: ensure fetch is a function
            const fetchFn = (typeof crossFetch === 'function') ? crossFetch : (crossFetch && typeof crossFetch.default === 'function' ? crossFetch.default : null);
            if (!fetchFn) throw new Error('cross-fetch is not available as a function');
            // Use the library factory which expects (fetch, urls, config)
            const blocker = await ElectronBlocker.fromLists(fetchFn, lists, { enableCompression: true });
            blockerInstance = blocker;
            try {
              if (blockerInstance.config) {
                blockerInstance.config.loadCosmeticFilters = false;
                blockerInstance.config.enableMutationObserver = false;
              }
            } catch (e) {}
            try { blockerInstance.enableBlockingInSession(session.defaultSession); console.log('[Adblock] ElectronBlocker initialized via fromLists and attached (cosmetics disabled)'); } catch (e) { console.warn('Failed to attach ElectronBlocker to session:', e?.message || e); }
            return { engine: 'electron-blocker', instance: blockerInstance };
          } catch (e) {
            console.warn('ElectronBlocker fallback fromLists failed:', e?.message || e);
            // allow falling through to local parser fallback below
          }
        }
      } catch (e) {
        console.warn('ElectronBlocker init failed, falling back to local parser:', e?.message || e);
      }
    const cacheDir = path.join(app.getPath('userData'), 'adlists');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    // Primary sources (EasyList + EasyPrivacy)
    const sources = [
      { url: 'https://easylist.to/easylist/easylist.txt', file: path.join(cacheDir, 'easylist.txt') },
      { url: 'https://easylist.to/easylist/easyprivacy.txt', file: path.join(cacheDir, 'easyprivacy.txt') }
    ];

    const collected = [];
    for (const s of sources) {
      let txt = await fetchText(s.url, 10000);
      if (!txt && fs.existsSync(s.file)) {
        try { txt = fs.readFileSync(s.file, 'utf8'); } catch {}
      }
      if (txt) {
        try { fs.writeFileSync(s.file, txt, 'utf8'); } catch {}
        collected.push(txt);
      }
    }

    // Also include local default fallback rules shipped with the app
    try {
      const localPath = path.join(__dirname, 'adlists', 'default.txt');
      if (fs.existsSync(localPath)) collected.push(fs.readFileSync(localPath, 'utf8'));
    } catch {}

    const allText = collected.join('\n');
    const lines = allText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const hostSuffixes = new Set();
    const substrings = new Set();
    const regexes = [];
    const exceptions = []; // rules starting with @@

    for (let ln of lines) {
      if (!ln || ln.startsWith('!') || ln.startsWith('#')) continue; // comments
      if (ln.startsWith('@@')) { exceptions.push(ln.slice(2)); continue; }
      // cosmetic rules (contain ## or #@#) skip
      if (ln.includes('##') || ln.includes('#@#')) continue;
      // Simple domain anchor: ||example.com^ or ||example.com
      if (ln.startsWith('||')) {
        let v = ln.slice(2).replace(/\^.*$/, '');
        v = v.replace(/^\./, '').toLowerCase();
        if (v) hostSuffixes.add(v);
        continue;
      }
      // Leading anchor: |http:// or |https:// or |https://www...
      if (ln.startsWith('|')) {
        // remove leading | and possible trailing ^
        let v = ln.replace(/^\|+/, '').replace(/\^$/, '');
        if (v) {
          try { regexes.push(new RegExp('^' + v.replace(/\*/g, '.*').replace(/\./g, '\\.'), 'i')); } catch {};
        }
        continue;
      }
      // Wildcard or path-containing rule -> convert to regex
      if (ln.indexOf('*') !== -1 || ln.indexOf('/') !== -1 || ln.indexOf('^') !== -1) {
        try {
          let reStr = ln.replace(/\^/g, '(?:$|\\W)').replace(/\./g, '\\.').replace(/\*/g, '.*');
          // ensure we match anywhere
          regexes.push(new RegExp(reStr, 'i'));
        } catch (e) {}
        continue;
      }
      // Otherwise, plain substring match
      substrings.add(ln.toLowerCase());
    }

    // Also convert exceptions into a simple test list (prefixes)
    const exceptionSubs = exceptions.map(e => e.trim()).filter(Boolean);

    filterEngine = { hostSuffixes: Array.from(hostSuffixes), substrings: Array.from(substrings), regexes, exceptions: exceptionSubs };
    console.log(`[Adblock] initialized filters: hosts=${filterEngine.hostSuffixes.length}, subs=${filterEngine.substrings.length}, regexes=${filterEngine.regexes.length}, exceptions=${filterEngine.exceptions.length}`);
    return filterEngine;
  } catch (e) {
    console.warn('initFullFilters failed:', e?.message || e);
    filterEngine = null;
    return null;
  }
}

// Helper that adapts cross-fetch to what ElectronBlocker expects
function FetcherFromUrl(crossFetch) {
  return async (url) => {
    try {
      const resp = await crossFetch(url);
      if (!resp || !resp.ok) return null;
      return await resp.text();
    } catch (e) { return null; }
  };
}
const AD_HOST_SUFFIXES = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'g.doubleclick.net', 'adservice.google.com', 'facebook.net', 'connect.facebook.net', 'fbcdn.net',
  'ads.twitter.com', 'static.ads-twitter.com', 'analytics.twitter.com', 'ads.linkedin.com',
  'px.ads.linkedin.com', 'ads.reddit.com', 'taboola.com', 'outbrain.com', 'zemanta.com', 'criteo.com',
  'criteo.net', 'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'adroll.com', 'segment.com',
  'mixpanel.com', 'mathtag.com', 'yieldmo.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'rfihub.com',
  'moatads.com'
];
// Hosts that should be treated as critical media sites where aggressive blocking may break functionality.
const CRITICAL_HOSTS = ['youtube.com','www.youtube.com','ytimg.com','googlevideo.com','youtube-nocookie.com','youtu.be'];
function hostnameFromUrl(u) { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function hostMatchesSuffix(host, suffix) {
  return host === suffix || host.endsWith('.' + suffix) || (suffix.endsWith('.*') && host.endsWith('.' + suffix.slice(0, -2)));
}
function shouldBlockUrl(u) {
  const h = hostnameFromUrl(u);
  if (!h) return false;

  // Block by known ad host suffixes first
  for (const suf of AD_HOST_SUFFIXES) {
    if (hostMatchesSuffix(h, suf)) return true;
  }

  // Additional heuristics for YouTube / googlevideo ad endpoints.
  // YouTube often serves ad-related requests from a mix of ad-specific hosts
  // and endpoint paths or query parameters on otherwise normal hosts.
  try {
    const url = new URL(u);
    const host = (url.hostname || '').toLowerCase();
    const path = (url.pathname || '').toLowerCase();
    const query = (url.search || '').toLowerCase();

    // Target common YouTube ad endpoints and typical ad-serving paths
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com') || host.includes('googlevideo.com') || host.includes('ytimg.com')) {
      // Avoid blocking essential YouTube endpoints which break playback/navigation.
      // Only treat clearly ad-marked paths as ads (keep metadata endpoints like /get_video_info accessible).
      // Path-based heuristics (only strong ad markers)
      if (path.includes('/ad/') || path.includes('ad_break') || path.includes('/adsrc') || path.includes('/pagead/')) {
        return true;
      }

      // Query-parameter heuristics: look for ad-related params but be conservative
      const adParams = ['adformat', 'adurl', 'ad_unit', 'adunit', 'ad_tag', 'ad_k', 'ad_type', 'adbreak', 'ad_break', 'adsid', 'adsrc', 'ads'];
      for (const p of adParams) {
        if (query.includes(p + '=') || query.includes('&' + p + '=')) {
          return true;
        }
      }

      // googlevideo sometimes hosts ad streams; only block when the path/query contains explicit ad markers
      if (host.endsWith('googlevideo.com') && (path.includes('/ad/') || path.includes('ad_tag') || path.includes('adformat'))) {
        return true;
      }
    }

    // Common ad-like resource filenames (ad.js, ad-loader, ads-..., doubleclick, etc.)
    try {
      const filename = path.split('/').pop() || '';
      const lower = filename.toLowerCase();
      const adNamePatterns = ['ad.js', 'ads.js', 'ads-','adserver','ad_iframe','doubleclick','admanager','pagead','adslot','adthumb','adview'];
      for (const p of adNamePatterns) {
        if (lower.includes(p)) return true;
      }
    } catch {}
  } catch (e) {
    // ignore parse errors and fall through
  }

  return false;
}

// Additional compiled patterns to catch common ad/tracker URL shapes and path fragments.
const AD_URL_PATTERNS = [
  /(^|\/)ads?($|\/|[\?\#])/i,
  /doubleclick/i,
  /pagead/i,
  /adserver/i,
  /adservice/i,
  /adthumb/i,
  /adview/i,
  /track(er|ing|ing_)/i,
  /pixel(\.|\/)/i,
  /banner(\.|\/)/i,
  /interstitial/i,
  /secureads/i,
  /spotx/i,
  /sovrn/i,
  /rubicon/i,
  /openx/i,
  /adsystem/i,
  /googlesyndication/i,
  /adsafeprotected/i,
  /taboola/i,
  /outbrain/i,
  /criteo/i,
  /yandex.*ads?/i
];

// Whitelist common search suggestion endpoints so autocomplete/suggestions keep working
const SUGGESTION_URL_PATTERNS = [
  /complete\/search/i,            // google suggestion endpoints (complete/search)
  /suggest/i,                     // generic 'suggest' endpoints
  /ac\.duckduckgo\.com\/ac\//i, // duckduckgo autocomplete
  /suggestqueries\.google\.com/i,
  /clients1\.google\.com/i,
  /www\.google(?:apis)?\.com\/complete/i,
  /bing\.com\/AS\/Suggestions/i
];

// Filename-based heuristics
function looksLikeAdFilename(pathname) {
  try {
    const filename = (pathname || '').split('/').pop() || '';
    const lower = filename.toLowerCase();
    const patterns = ['ad.', 'ad-', 'ads.', 'ads-', 'advert', 'adserver', 'doubleclick', 'googletag'];
    for (const p of patterns) if (lower.indexOf(p) !== -1) return true;
  } catch {}
  return false;
}

// A higher-level gate used by the webRequest handler to decide cancellation
function isLikelyAdRequest(details) {
  try {
    if (!details || !details.url) return false;
    // If this looks like a search-suggestion/autocomplete request, never treat it as an ad
    try {
      for (const sre of SUGGESTION_URL_PATTERNS) {
        if (sre.test(details.url)) return false;
      }
    } catch {}
    // Respect allowlist early
    const ref = details.referrer || (details.requestHeaders && (details.requestHeaders.Referer || details.requestHeaders.referer)) || '';
    const refHost = hostnameFromUrl(ref);
    if (refHost && adBlockAllowlist.has(refHost)) return false;

    const u = new URL(details.url);
    const host = (u.hostname || '').toLowerCase();
    const path = (u.pathname || '').toLowerCase();
    const query = (u.search || '').toLowerCase();

    // Host suffixes caught earlier
    for (const suf of AD_HOST_SUFFIXES) if (hostMatchesSuffix(host, suf)) return true;

    // Patterns in host or path
    for (const re of AD_URL_PATTERNS) {
      try { if (re.test(host) || re.test(path) || re.test(query)) return true; } catch {}
    }

    // Filename heuristics
    if (looksLikeAdFilename(path)) return true;

    // Query parameter heuristics
  // Remove overly broad params like 'client' and 'slot' which are used by suggestion APIs
  const adParams = ['adformat', 'adurl', 'ad_unit', 'adunit', 'ad_tag', 'ad_k', 'ad_type', 'adbreak', 'adsid', 'adsrc', 'ads'];
    for (const p of adParams) if (query.includes(p + '=')) return true;

    // Heuristic: third-party requests that are scripts/xhr/fetch and include ad-like tokens
    const suspectTypes = new Set(['script', 'xhr', 'fetch', 'subFrame', 'image']);
    const type = (details.resourceType || '').toLowerCase();
    const isThirdParty = refHost && host && refHost !== host;
    if (isThirdParty && suspectTypes.has(type)) {
      for (const re of AD_URL_PATTERNS) try { if (re.test(details.url)) return true; } catch {}
    }
  } catch (e) {}
  return false;
}

// Global shortcut de-duplication across window and any webviews
// Ensures we only dispatch a given shortcut action once within a short window,
// preventing cases like Cmd+T opening multiple tabs from multiple sources.
const _lastShortcutTs = new Map();
const SHORTCUT_DEDUP_WINDOW_MS = 200;
function dedupAndSendShortcut(targetWebContents, payload) {
  try {
    if (!targetWebContents || targetWebContents.isDestroyed()) return;
    const action = payload && payload.action;
    if (!action) return;
    const now = Date.now();
    const last = _lastShortcutTs.get(action) || 0;
    if (now - last < SHORTCUT_DEDUP_WINDOW_MS) return; // drop duplicate
    _lastShortcutTs.set(action, now);
    targetWebContents.send('shortcut', payload);
  } catch (e) {
    console.warn('Failed to send shortcut:', e?.message || e);
  }
}

// Swipe synthesis via horizontal wheel aggregation (for cases where native 'swipe' isn't fired)
const _swipeAgg = new Map(); // sourceKey -> { accum, cooldownUntil }
function processWheelForSwipe(targetWebContents, sourceKey, deltaX) {
  try {
    if (!targetWebContents || targetWebContents.isDestroyed()) return;
    const now = Date.now();
    const st = _swipeAgg.get(sourceKey) || { accum: 0, cooldownUntil: 0 };
    if (now < st.cooldownUntil) return;
    // Accumulate horizontal deltas; positive = right, negative = left
    st.accum += (typeof deltaX === 'number' ? deltaX : 0);
  const threshold = 220; // tuned for macOS trackpads (lower for easier detection during testing)
    if (st.accum >= threshold) {
      st.accum = 0;
      st.cooldownUntil = now + 450;
      console.log('Synth swipe gesture: right');
      targetWebContents.send('gesture-swipe', { direction: 'right', synthesized: true });
    } else if (st.accum <= -threshold) {
      st.accum = 0;
      st.cooldownUntil = now + 450;
      console.log('Synth swipe gesture: left');
      targetWebContents.send('gesture-swipe', { direction: 'left', synthesized: true });
    }
    _swipeAgg.set(sourceKey, st);
  } catch {}
}

// Development mode detection
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Improve media compatibility (e.g., YouTube autoplay after user intent)
// Note: This relaxes Chromium's autoplay policy for smoother video playback
try {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  // Privacy: Reduce WebRTC IP leak exposure
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
  // Improve trackpad swipe history navigation
  app.commandLine.appendSwitch('overscroll-history-navigation', '1');
} catch (e) {
  // no-op
}

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
      // macOS: enables rubber-banding; can improve gesture propagation
      scrollBounce: true,
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
      // Wait a bit for Vite server to be ready, then try dev URL; fallback to built index.html
      const tryDevThenFallback = async () => {
        try {
          console.log('Loading development URL: http://localhost:3000');
          await mainWindow.loadURL('http://localhost:3000');
          console.log('Successfully loaded development URL');
        } catch (err) {
          console.error('Failed to load development URL, falling back to built index.html:', err);
          try {
            const builtIndex = path.join(__dirname, '../../build/index.html');
            console.log('Loading built file:', builtIndex);
            await mainWindow.loadFile(builtIndex);
          } catch (fallbackErr) {
            console.error('Failed to load built index.html:', fallbackErr);
          }
        }
      };
      console.log('Waiting 1 second for Vite server...');
      setTimeout(() => { tryDevThenFallback(); }, 1000);
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

    // Global keyboard shortcuts routed to renderer so they work even when a webview has focus
  mainWindow.webContents.on('before-input-event', (event, input) => {
      try {
        if (!input || input.type !== 'keyDown') return;
        const meta = !!(input.meta || input.control);
        const alt = !!input.alt;
        const shift = !!input.shift;
        const key = String(input.key || '').toLowerCase();
        const code = String(input.code || '');
        const repeat = !!input.isAutoRepeat;

        // Swallow auto-repeats for meta-based shortcuts to avoid spamming actions (e.g., Cmd+T)
        if (meta && repeat) {
          event.preventDefault();
          return;
        }

        // Navigation: Back / Forward
        if ((meta && key === '[') || (alt && !meta && !shift && (key === 'arrowleft' || code === 'ArrowLeft'))) {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'back', source: 'host', repeat });
          return;
        }
        if ((meta && key === ']') || (alt && !meta && !shift && (key === 'arrowright' || code === 'ArrowRight'))) {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'forward', source: 'host', repeat });
          return;
        }

        // Reload
        if (meta && key === 'r' && !shift && !alt) {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'reload', source: 'host', repeat });
          return;
        }
        if (meta && shift && key === 'r') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'reloadHard', source: 'host', repeat });
          return;
        }

        // New/Close Tab
        if (meta && !shift && !alt && key === 't') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'newTab', source: 'host', repeat });
          return;
        }
        if (meta && !shift && !alt && key === 'w') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'closeTab', source: 'host', repeat });
          return;
        }

        // Focus address bar
        if (meta && !shift && !alt && key === 'l') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'focusOmnibox', source: 'host', repeat });
          return;
        }

        // Find in page
        if (meta && !shift && !alt && key === 'f') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'find', source: 'host', repeat });
          return;
        }

        // Reopen closed tab
        if (meta && shift && !alt && key === 't') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'reopenClosedTab', source: 'host', repeat });
          return;
        }

        // Cycle tabs (Cmd/Ctrl+Tab, +Shift for prev)
        if (meta && key === 'tab') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: shift ? 'prevTab' : 'nextTab', source: 'host', repeat });
          return;
        }

        // Switch to tab by number (1..9)
        if (meta && !shift && !alt && /^[1-9]$/.test(key)) {
          event.preventDefault();
          const index = key === '9' ? 9 : parseInt(key, 10); // 9 = last
          dedupAndSendShortcut(mainWindow.webContents, { action: 'nthTab', index, source: 'host', repeat });
          return;
        }

        // Zoom controls
        if (meta && !alt && !shift && (key === '=' || key === '+')) {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'zoomIn', source: 'host', repeat });
          return;
        }
        if (meta && !alt && !shift && key === '-') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'zoomOut', source: 'host', repeat });
          return;
        }
        if (meta && !alt && !shift && key === '0') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'resetZoom', source: 'host', repeat });
          return;
        }

        // Mute toggle
        if (meta && !alt && !shift && key === 'm') {
          event.preventDefault();
          dedupAndSendShortcut(mainWindow.webContents, { action: 'toggleMute', source: 'host', repeat });
          return;
        }
      } catch (e) {
        console.warn('before-input-event handler error:', e?.message || e);
      }
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
    // Allow dev server and local file loads
    if (isDev) {
      if (parsedUrl.protocol === 'file:' || parsedUrl.origin === 'http://localhost:3000') {
        return;
      }
    } else {
      if (parsedUrl.protocol === 'file:') {
        return;
      }
    }
    // Block navigation away from our app in the main window (webview still allowed elsewhere)
    event.preventDefault();
    console.log('Blocked main window navigation to:', navigationUrl);
  });

  // Keep BrowserView bounds in sync on resize
  mainWindow.on('resize', () => {
    try {
      if (currentBrowserView) {
  const bounds = mainWindow.getBounds();
  const navigationHeight = 88;
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
  console.log('[Gesture][MainWindow] swipe:', direction);
      mainWindow.webContents.send('gesture-swipe', { direction });
    } catch (e) {
      console.warn('Failed to propagate swipe gesture:', e);
    }
  });

  // Fallback: synthesize swipe from horizontal wheel deltas in main window
  try {
    mainWindow.webContents.on('wheel', (_ev, deltaX, deltaY, deltaZ) => {
      // Only consider horizontal gesture
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
  processWheelForSwipe(mainWindow.webContents, 'main', deltaX);
      }
    });
  } catch {}
}

function createSettingsWindow() {
  try {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      return settingsWindow;
    }
    settingsWindow = new BrowserWindow({
      width: 760,
      height: 560,
      resizable: true,
      minimizable: false,
      maximizable: false,
      parent: mainWindow || undefined,
      modal: false,
      title: 'Settings',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
      },
      show: false,
    });

    if (isDev) {
      const tryDevThenFallback = async () => {
        try {
          await settingsWindow.loadURL('http://localhost:3000?settingsWindow=1');
        } catch (err) {
          try {
            const builtIndex = path.join(__dirname, '../../build/index.html');
            await settingsWindow.loadFile(builtIndex, { query: { settingsWindow: '1' } });
          } catch (fallbackErr) {
            console.error('Failed to load Settings window in dev and fallback:', fallbackErr);
          }
        }
      };
      setTimeout(() => { tryDevThenFallback(); }, 300);
    } else {
      const indexPath = path.join(__dirname, '../../build/index.html');
      settingsWindow.loadFile(indexPath, { query: { settingsWindow: '1' } }).catch(() => {});
    }

    settingsWindow.once('ready-to-show', () => settingsWindow && settingsWindow.show());
    settingsWindow.on('closed', () => { settingsWindow = null; });
    return settingsWindow;
  } catch (e) {
    console.error('Failed to create settings window:', e);
  }
}

// IPC to open settings window
ipcMain.handle('open-settings-window', async () => {
  createSettingsWindow();
  return { ok: true };
});

// Open a dedicated Reader window for sanitized HTML content when in-page injection
ipcMain.handle('open-reader-window', async (_event, htmlContent) => {
  try {
    if (!htmlContent) return { ok: false, error: 'empty' };
    const win = new BrowserWindow({
      width: 900,
      height: 800,
      title: 'Reader',
      modal: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        // No preload needed; content is static
      }
    });
    // Load the provided HTML via a data URL (safer than writing to disk)
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(String(htmlContent));
    await win.loadURL(dataUrl);
    win.show();
    return { ok: true };
  } catch (e) {
    console.error('Failed to open reader window:', e);
    return { ok: false, error: String(e) };
  }
});

function configureSessionSecurity() {
  try {
    const ses = session.defaultSession;

    // Initialize ad blocker state from settings
    try {
      const s = (typeof loadSettings === 'function') ? loadSettings() : {};
      adBlockEnabled = !!s.enableAdBlocker;
      adBlockAllowlist = new Set((s.adBlockAllowlist || []).map(h => String(h || '').toLowerCase()).filter(Boolean));
    } catch (e) {
      console.warn('Failed to load settings for ad blocker:', e?.message || e);
    }

    // Load site permissions from settings
    let sitePermissions = {};
    try {
      const s = (typeof loadSettings === 'function') ? loadSettings() : {};
      sitePermissions = s.sitePermissions || {};
    } catch {}

    // Security: Set secure defaults with better website compatibility and per-site overrides
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      let fromType = 'unknown';
      try {
        if (webContents && !webContents.isDestroyed() && typeof webContents.getType === 'function') {
          fromType = webContents.getType();
        }
      } catch {}
      console.log('Permission request:', permission, 'from', fromType);
      
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

      // Apply per-origin overrides if available
      try {
        const origin = (webContents && typeof webContents.getURL === 'function') ? new URL(webContents.getURL()).origin : '';
        if (origin && sitePermissions[origin] && Object.prototype.hasOwnProperty.call(sitePermissions[origin], permission)) {
          const decision = !!sitePermissions[origin][permission];
          console.log(`Permission ${permission} overridden for ${origin}: ${decision ? 'granted' : 'denied'}`);
          try { callback(decision); } catch {}
          return;
        }
      } catch {}

      const isAllowed = allowedPermissions.includes(permission);
      console.log(`Permission ${permission} ${isAllowed ? 'granted' : 'denied'}`);
      try { callback(isAllowed); } catch (e) { console.warn('Permission callback failed:', e?.message || e); }
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
      let isWebview = false;
      try {
        isWebview = !!(webContents && !webContents.isDestroyed() && typeof webContents.getType === 'function' && webContents.getType() === 'webview');
      } catch {}
      if (isWebview) {
        return allowedPermissions.includes(permission);
      }
      
      // Main window should be more restrictive; include per-origin overrides
      try {
        const origin = requestingOrigin || (webContents && typeof webContents.getURL === 'function' ? new URL(webContents.getURL()).origin : '');
        if (origin && sitePermissions[origin] && Object.prototype.hasOwnProperty.call(sitePermissions[origin], permission)) {
          return !!sitePermissions[origin][permission];
        }
      } catch {}
      return ['clipboard-read', 'clipboard-write'].includes(permission);
    });

    // Configure User Agent for better compatibility
    ses.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // Enable experimental web features for better compatibility
    ses.setPermissionCheckHandler = ses.setPermissionCheckHandler || (() => true);

    // Configure webview behavior
  // Broaden blocked resource types to cover fonts, stylesheets, objects and other resource shapes
  const BLOCKED_TYPES = new Set(['script', 'image', 'xhr', 'fetch', 'subFrame', 'media', 'beacon', 'ping', 'stylesheet', 'font', 'object', 'other']);
    ses.webRequest.onBeforeRequest((details, callback) => {
      try {
        // HTTPS upgrade for top-level navigations (best-effort), but skip in dev for localhost
        try {
          const isMain = details.resourceType === 'mainFrame';
          const u = new URL(details.url);
          const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.local');
          if (isMain && u.protocol === 'http:' && !(isDev && isLocalhost)) {
            u.protocol = 'https:';
            return callback({ redirectURL: u.toString() });
          }
        } catch {}

        // Strip common tracking parameters from URLs
        try {
          const u = new URL(details.url);
          const before = u.toString();
          const TRACK_PARAMS = new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid','ref','igshid','msclkid']);
          let changed = false;
          for (const p of Array.from(u.searchParams.keys())) {
            if (TRACK_PARAMS.has(p)) { u.searchParams.delete(p); changed = true; }
          }
          if (changed) {
            const after = u.toString();
            if (after !== before) return callback({ redirectURL: after });
          }
        } catch {}

        // Only consider blocking for non-mainFrame resources and types we target
        if (!adBlockEnabled || details.resourceType === 'mainFrame' || !BLOCKED_TYPES.has(details.resourceType)) {
          adBlockStats.allowed++;
          return callback({});
        }

        // Respect allowlist early
        const ref = details.referrer || (details.requestHeaders && (details.requestHeaders.Referer || details.requestHeaders.referer)) || '';
        const refHost = hostnameFromUrl(ref);
        if (refHost && adBlockAllowlist.has(refHost)) { adBlockStats.allowed++; return callback({}); }

        // Never block suggestion/autocomplete endpoints
        try {
          for (const sre of SUGGESTION_URL_PATTERNS) {
            if (sre.test(details.url)) { adBlockStats.allowed++; return callback({}); }
          }
        } catch {}

        // Bypass ad blocking for critical video/asset hosts (conservative allowlist)
        try {
          const reqHost = hostnameFromUrl(details.url);
          if (reqHost) {
            for (const ch of CRITICAL_HOSTS) {
              if (hostMatchesSuffix(reqHost, ch) || reqHost === ch) {
                adBlockStats.allowed++;
                console.log(`[AdBlock][bypass] host=${reqHost} reason=critical-site url=${details.url}`);
                return callback({});
              }
            }
          }
        } catch (e) {}

        // If the maintained blocker is available, consult it first (without letting it register its own network listeners)
        try {
          if (blockerInstance && typeof blockerInstance.match === 'function') {
            try {
              const adblock = require('@cliqz/adblocker');
              const req = adblock.Request.fromRawDetails({
                _originalRequestDetails: details,
                requestId: `${details.id}`,
                sourceUrl: details.referrer,
                tabId: details.webContentsId,
                type: (details.resourceType || 'other'),
                url: details.url,
              });
              if (blockerInstance.config && blockerInstance.config.guessRequestTypeFromUrl) try { req.guessTypeOfRequest(); } catch {}
              const { redirect, match } = blockerInstance.match(req);
              if (redirect) {
                adBlockStats.blocked++;
                console.log(`[AdBlock][blocked] source=electron-blocker reason=redirect url=${details.url} type=${details.resourceType}`);
                try { pushBlockedEntry({ source: 'electron-blocker', reason: 'redirect', url: details.url, type: details.resourceType, redirect: !!redirect.dataUrl, reqHost: hostnameFromUrl(details.url) }); } catch (e) {}
                return callback({ redirectURL: redirect.dataUrl });
              }
              if (match) {
                adBlockStats.blocked++;
                console.log(`[AdBlock][blocked] source=electron-blocker url=${details.url} type=${details.resourceType}`);
                try { pushBlockedEntry({ source: 'electron-blocker', reason: 'match', url: details.url, type: details.resourceType, reqHost: hostnameFromUrl(details.url) }); } catch (e) {}
                return callback({ cancel: true });
              }
            } catch (e) {
              // If any adblock evaluation error occurs, fall through to local heuristics
              console.warn('Adblock.match error:', e?.message || e);
            }
          }
        } catch (e) {}

        // Local parser fallback
        try {
          if (filterEngine) {
            const urlLower = details.url.toLowerCase();
            const u = (() => { try { return new URL(details.url); } catch { return null; } })();
            const host = u && u.hostname ? u.hostname.toLowerCase() : '';

            // Exceptions (simple contains match)
            let excepted = false;
            for (const ex of (filterEngine.exceptions || [])) try { if (urlLower.includes(ex.toLowerCase())) { excepted = true; break; } } catch {}
            if (!excepted) {
              for (const hs of (filterEngine.hostSuffixes || [])) {
                if (!hs) continue; if (host === hs || host.endsWith('.' + hs)) { adBlockStats.blocked++; console.log(`[AdBlock][blocked] source=local-host-suffix url=${details.url}`); try { pushBlockedEntry({ source: 'local-host-suffix', url: details.url, type: details.resourceType, reqHost: host, matchedHostSuffix: hs }); } catch (e) {} return callback({ cancel: true }); }
              }
              let matched = false;
              for (const sub of (filterEngine.substrings || [])) { try { if (!sub) continue; if (urlLower.includes(sub)) { matched = true; break; } } catch {} }
              if (!matched) { for (const re of (filterEngine.regexes || [])) try { if (re.test(details.url)) { matched = true; break; } } catch {} }
              if (matched) { adBlockStats.blocked++; console.log(`[AdBlock][blocked] source=local-parser url=${details.url}`); try { pushBlockedEntry({ source: 'local-parser', url: details.url, type: details.resourceType, reqHost: host }); } catch (e) {} return callback({ cancel: true }); }
            }
          }
        } catch (e) {}

        // Heuristic fallback
        if (shouldBlockUrl(details.url) || isLikelyAdRequest(details)) {
          adBlockStats.blocked++;
          console.log(`[AdBlock][blocked] source=heuristic url=${details.url} type=${details.resourceType}`);
          try { pushBlockedEntry({ source: 'heuristic', url: details.url, type: details.resourceType, reqHost: hostnameFromUrl(details.url) }); } catch (e) {}
          return callback({ cancel: true });
        }

        adBlockStats.allowed++;
      } catch (e) {
        console.warn('onBeforeRequest handler error:', e?.message || e);
      }
      callback({});
    });

    // Add privacy-forward request headers and strip third-party cookies/referrers
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const headers = details.requestHeaders || {};
        headers['DNT'] = '1'; // Do Not Track
        headers['Sec-GPC'] = '1'; // Global Privacy Control
        headers['Accept-Language'] = headers['Accept-Language'] || 'en-US,en;q=0.5';

        // If third-party (request host differs from referrer host), strip cookies and referer
        const reqHost = hostnameFromUrl(details.url);
        const ref = headers.Referer || headers.referer || details.referrer || '';
        const refHost = hostnameFromUrl(ref);
        if (reqHost && refHost && reqHost !== refHost) {
          delete headers['Cookie'];
          delete headers['cookie'];
          delete headers['Referer'];
          delete headers['referer'];
        }
        callback({ requestHeaders: headers });
      } catch (e) {
        callback({});
      }
    });

    // Ensure a sane Referrer-Policy for responses when sites omit it
    ses.webRequest.onHeadersReceived((details, callback) => {
      try {
        const responseHeaders = details.responseHeaders || {};
        const hasPolicy = Object.keys(responseHeaders).some(k => k.toLowerCase() === 'referrer-policy');
        if (!hasPolicy) {
          responseHeaders['Referrer-Policy'] = ['strict-origin-when-cross-origin'];
        }
        callback({ responseHeaders });
      } catch (e) {
        callback({});
      }
    });

    // Diagnostic: log network errors (including blocked-by-client/response) with context
    try {
      ses.webRequest.onErrorOccurred((details) => {
        try {
          if (!details || !details.url) return;
          const err = String(details.error || '').toLowerCase();
          // Common error indicators when a request was blocked by a handler
          if (err.includes('blocked') || err.includes('err_blocked') || err.includes('cancelled') || err.includes('aborted')) {
            console.log(`[AdBlock][net-error] err=${details.error} resourceType=${details.resourceType} webContentsId=${details.webContentsId || '(unknown)'} url=${details.url} referrer=${details.referrer || ''}`);
          }
        } catch (e) {}
      });
    } catch (e) {}

    // Hook download events to track progress and completion
    try {
      ses.on('will-download', (event, item, webContents) => {
        try {
          const totalBytes = item.getTotalBytes();
          const url = item.getURL();
          const filename = item.getFilename();
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const startTime = new Date().toISOString();
          const base = { id, filename, url, totalBytes, receivedBytes: 0, state: 'progressing', startTime, endTime: null, savePath: item.getSavePath?.() };

          // Persist initial record
          try {
            const list = (typeof loadDownloads === 'function') ? loadDownloads() : [];
            list.push(base);
            saveDownloads(list);
          } catch {}

          // Notify renderer
          try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('download-started', base)); } catch {}

          item.on('updated', (_evt, state) => {
            try {
              const receivedBytes = item.getReceivedBytes();
              const progress = { id, receivedBytes, state: state || 'progressing' };
              BrowserWindow.getAllWindows().forEach(w => w.webContents.send('download-progress', progress));
            } catch {}
          });

          item.on('done', (_evt, state) => {
            try {
              const endTime = new Date().toISOString();
              const savePath = item.getSavePath?.();
              const final = { id, state, endTime, savePath };
              // Update persisted record
              try {
                const list = loadDownloads();
                const idx = list.findIndex(d => d.id === id);
                if (idx >= 0) list[idx] = { ...list[idx], ...final };
                saveDownloads(list);
              } catch {}
              BrowserWindow.getAllWindows().forEach(w => w.webContents.send('download-complete', { id, state, endTime, savePath }));
            } catch {}
          });
        } catch (e) {
          console.warn('Download hook error:', e?.message || e);
        }
      });
    } catch {}

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
  const navigationHeight = 88; // Height for navigation + tabs (slimmer navbar)
    
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

  // Update bookmark metadata (tags, note, color, pinned, etc.)
  ipcMain.handle('update-bookmark-meta', async (event, url, meta) => {
    try {
      const bookmarks = loadBookmarks();
      const idx = bookmarks.findIndex(b => b.url === url);
      if (idx === -1) return { success: false, error: 'Bookmark not found' };
      const original = bookmarks[idx] || {};
      const allowed = ['tags', 'note', 'color', 'pinned', 'title'];
      const patch = {};
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(meta || {}, k)) patch[k] = meta[k];
      }
      bookmarks[idx] = { ...original, ...patch };
      const success = saveBookmarks(bookmarks);
      return { success };
    } catch (e) {
      console.error('Error updating bookmark meta:', e);
      return { success: false, error: e?.message || String(e) };
    }
  });

  // Remove duplicate bookmarks (by URL)
  ipcMain.handle('dedupe-bookmarks', async () => {
    try {
      const bookmarks = loadBookmarks();
      const seen = new Set();
      const deduped = [];
      for (const b of bookmarks) {
        const key = (b.url || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(b);
      }
      const success = saveBookmarks(deduped);
      return { success, removed: bookmarks.length - deduped.length };
    } catch (e) {
      console.error('Error deduping bookmarks:', e);
      return { success: false, error: e?.message || String(e) };
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
    if (Object.prototype.hasOwnProperty.call(updated, 'enableAdBlocker')) {
      adBlockEnabled = !!updated.enableAdBlocker;
      console.log('Ad blocker now', adBlockEnabled ? 'ENABLED' : 'DISABLED');
    }
    // Keep allowlist in sync without requiring restart
    if (Object.prototype.hasOwnProperty.call(updated, 'adBlockAllowlist')) {
      try {
        const list = Array.isArray(updated.adBlockAllowlist) ? updated.adBlockAllowlist : [];
        adBlockAllowlist = new Set(list.map(h => String(h || '').toLowerCase()).filter(Boolean));
      } catch {}
    }
    // Notify all renderer windows that settings changed
    try {
      const { BrowserWindow } = require('electron');
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.webContents.send('settings-updated', updated); } catch {}
      }
    } catch {}
    return { success: ok, settings: updated };
  });

  // Site permissions get/set
  ipcMain.handle('get-site-permissions', async (event, origin) => {
    try {
      const s = loadSettings();
      const map = s.sitePermissions || {};
      return { success: true, permissions: map[origin] || {} };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('set-site-permission', async (event, payload) => {
    try {
      const { origin, permission, value } = payload || {};
      if (!origin || !permission) return { success: false, error: 'origin and permission required' };
      const s = loadSettings();
      const map = s.sitePermissions || {};
      map[origin] = map[origin] || {};
      map[origin][permission] = !!value;
      const ok = saveSettings({ ...s, sitePermissions: map });
      return { success: ok };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
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

  ipcMain.handle('open-private-window', async () => {
    try {
      const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'NebulaBrowser — Private',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, 'preload.js'),
          webSecurity: true,
          allowRunningInsecureContent: false,
          experimentalFeatures: false,
          webviewTag: true,
          partition: 'private:' + Date.now()
        }
      });
      await win.loadURL(isDev ? 'http://localhost:3000/?private=1' : 'file://' + path.join(__dirname, '../../build/index.html?private=1'));
      try {
        // Clear storage/cookies/cache on close for the private session
        win.on('closed', async () => {
          try {
            const ps = win.webContents.session;
            await ps.clearStorageData();
            await ps.clearCache();
            const cookies = await ps.cookies.get({});
            for (const c of cookies) {
              try { await ps.cookies.remove((c.secure ? 'https://' : 'http://') + c.domain.replace(/^[.]/, '') + (c.path || '/'), c.name); } catch {}
            }
          } catch {}
        });
      } catch {}
      return { success: true };
    } catch (e) {
      console.error('Failed to open private window:', e);
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('toggle-ad-blocker', async (event, enabled) => {
    console.log('Toggle ad blocker request:', enabled);
  adBlockEnabled = !!enabled;
  return { success: true, enabled: adBlockEnabled };
  });

  ipcMain.handle('clear-browsing-data', async (event, options) => {
    console.log('Clear browsing data request:', options);
    return { success: true };
  });

  ipcMain.handle('get-adblock-stats', async () => {
    return { ...adBlockStats };
  });

  // Diagnostics: expose adblock internals for debugging (non-sensitive)
  ipcMain.handle('get-adblock-diagnostics', async () => {
    try {
      return {
        enabled: !!adBlockEnabled,
        allowlistSize: adBlockAllowlist.size || 0,
        stats: { ...adBlockStats },
        engine: blockerInstance ? 'electron-blocker' : (filterEngine ? 'local-parser' : 'none'),
        blockerAttachedToDefaultSession: (function(){ try { return !!(blockerInstance && session && session.defaultSession && blockerInstance && typeof blockerInstance.enableBlockingInSession === 'function'); } catch { return false; } })(),
        filterSummary: filterEngine ? { hosts: (filterEngine.hostSuffixes||[]).length, substrings: (filterEngine.substrings||[]).length, regexes: (filterEngine.regexes||[]).length, exceptions: (filterEngine.exceptions||[]).length } : null
      };
    } catch (e) {
      return { error: String(e) };
    }
  });

  ipcMain.handle('reset-adblock-stats', async () => {
    adBlockStats = { blocked: 0, allowed: 0 };
    return { ...adBlockStats };
  });

  ipcMain.handle('toggle-adblock-for-site', async (event, payload) => {
    try {
      const { hostname, enabled } = payload || {};
      const host = String(hostname || '').toLowerCase();
      if (!host) return { success: false, error: 'No hostname' };
      if (enabled === false) adBlockAllowlist.add(host); else adBlockAllowlist.delete(host);
      // Persist allowlist to settings
      const cur = loadSettings();
      const list = Array.from(adBlockAllowlist.values());
      saveSettings({ ...cur, adBlockAllowlist: list });
      return { success: true, allowlisted: enabled === false };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  // Query suggestions fetched in main to avoid CORS in renderer
  ipcMain.handle('get-suggestions', async (_event, payload) => {
    try {
      const { query, engine } = payload || {};
      const q = String(query || '').trim();
      if (!q) return [];
      const eng = String((engine || 'google')).toLowerCase();
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4000);
      const headers = { 'Accept': 'application/json, text/plain, */*', 'User-Agent': session.defaultSession.getUserAgent() };
      let url;
      if (eng === 'duckduckgo') {
        url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`;
      } else if (eng === 'brave') {
        url = `https://search.brave.com/api/suggest?q=${encodeURIComponent(q)}`;
      } else {
        url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(q)}`;
      }
      const resp = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(t);
      if (!resp.ok) return [];
      const ct = resp.headers.get('content-type') || '';
      let data;
      if (ct.includes('application/json')) data = await resp.json();
      else data = await resp.json().catch(async () => { try { return JSON.parse(await resp.text()); } catch { return null; } });
  let phrases = [];
      if (eng === 'duckduckgo') {
        if (Array.isArray(data)) {
          // Newer/observed DDG shape: [ queryString, [suggestions...] ]
          if (Array.isArray(data[1])) {
            phrases = data[1].map(String);
          } else if (data.length && typeof data[0] === 'object' && data[0] && 'phrase' in data[0]) {
            // Alternate DDG shape: [{ phrase: "..." }, ...]
            phrases = data.map(x => x?.phrase || '').filter(Boolean);
          } else {
            // Fallback: coerce items to strings
            phrases = data.map(String).filter(Boolean);
          }
        } else if (data && (Array.isArray(data.suggestions) || Array.isArray(data.results))) {
          // Fallback shape sometimes seen
          const arr = (data.suggestions || data.results || []).map(x => (typeof x === 'string' ? x : x?.phrase || x?.value || ''));
          phrases = arr.filter(Boolean);
        } else if (typeof data === 'string') {
          // Last-ditch: string payload; split by separators
          phrases = String(data).split(/[\n\r,\u2022\u2023\u25E6\u2043\u2219]+/).map(s => s.trim()).filter(Boolean);
        } else {
          phrases = [];
        }
        // Dev logging to diagnose response shape issues (only in development)
        if (process.env.NODE_ENV === 'development') {
          try {
            const preview = JSON.stringify(data)?.slice(0, 300);
            console.log('[Suggestions][DDG] raw:', typeof data, Array.isArray(data) ? `array(len=${data.length})` : 'object', preview);
            console.log('[Suggestions][DDG] parsed phrases:', phrases.slice(0, 10));
          } catch {}
        }
       } else if (eng === 'brave') {
        if (Array.isArray(data)) {
          const arr = Array.isArray(data[1]) ? data[1] : [];
          phrases = arr.map(String);
        } else if (data && (Array.isArray(data.suggestions) || Array.isArray(data.results))) {
          const arr = (data.suggestions || data.results || []).map(x => (typeof x === 'string' ? x : x?.phrase || x?.value || ''));
          phrases = arr.filter(Boolean);
        }
      } else {
        // google
        phrases = Array.isArray(data) && Array.isArray(data[1]) ? data[1].map(String) : [];
      }
      const uniq = [];
      const seen = new Set();
      const qLower = q.toLowerCase();
      for (const p of phrases) {
        const s = String(p || '').trim();
        if (!s || seen.has(s)) continue;
        if (s.toLowerCase() === qLower) continue; // ignore exact query echo
        seen.add(s);
        uniq.push(s);
        if (uniq.length >= 10) break;
      }
      return uniq;
    } catch (e) {
      return [];
    }
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
app.whenReady().then(async () => {
  try { await initFullFilters(); } catch (e) { console.warn('initFullFilters failed:', e); }
  try { await createWindow(); } catch (e) { console.warn('createWindow failed:', e); }
});

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
  // For now, block popups but allow navigation; record blocked popups
  try { pushBlockedEntry({ source: 'popup', url: String(url || ''), reqHost: hostnameFromUrl(String(url || '')), type: 'popup' }); } catch (e) {}
  return { action: 'deny' };
    });
    
    // Don't block navigation for webview content
    contents.on('will-navigate', (event, navigationUrl) => {
      console.log('Webview navigating to:', navigationUrl);
      // Allow navigation for webview
    });

  // Forward swipe gestures from webview to host (renderer) so history navigation works
    try {
      contents.on('swipe', (_event, direction) => {
        try {
          const host = contents.hostWebContents || null;
          if (host && !host.isDestroyed()) {
            console.log('Webview swipe gesture:', direction);
            host.send('gesture-swipe', { direction });
          }
        } catch (e) {
          console.warn('Failed to forward swipe from webview:', e?.message || e);
        }
      });
    } catch {}

    // Fallback: synthesize swipe from horizontal wheel deltas in webview
    try {
      contents.on('wheel', (_ev, deltaX, deltaY, deltaZ) => {
        try {
          console.log(`[Gesture][WebView ${contents.id}] wheel dx=${deltaX}, dy=${deltaY}`);
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            const host = contents.hostWebContents || null;
            if (host && !host.isDestroyed()) {
              processWheelForSwipe(host, `wv-${contents.id}`, deltaX);
            }
          }
        } catch (err) {
          console.warn('Error in webview wheel handler:', err);
        }
      });
    } catch (e) { console.warn('Failed to attach wheel handler to webview contents:', e); }

  // Forward keyboard shortcuts from webview to host so they work when webview is focused
    try {
      contents.on('before-input-event', (event, input) => {
        try {
          if (!input || input.type !== 'keyDown') return;
          const meta = !!(input.meta || input.control);
          const alt = !!input.alt;
          const shift = !!input.shift;
          const key = String(input.key || '').toLowerCase();
          const repeat = !!input.isAutoRepeat;
          const host = contents.hostWebContents || null;
          const send = (payload) => { if (host && !host.isDestroyed()) dedupAndSendShortcut(host, { ...payload, source: 'webview', repeat }); };

          // Swallow auto-repeats for meta-based shortcuts to avoid spamming actions
          if (meta && repeat) {
            event.preventDefault();
            return;
          }

          // Back / Forward
          if ((meta && key === '[') || (alt && !meta && !shift && key === 'arrowleft')) {
            event.preventDefault();
            return send({ action: 'back' });
          }
          if ((meta && key === ']') || (alt && !meta && !shift && key === 'arrowright')) {
            event.preventDefault();
            return send({ action: 'forward' });
          }
          // Reload
          if (meta && key === 'r' && !shift && !alt) {
            event.preventDefault();
            return send({ action: 'reload' });
          }
          if (meta && shift && key === 'r') {
            event.preventDefault();
            return send({ action: 'reloadHard' });
          }
          // New/Close tab
          if (meta && !shift && !alt && key === 't') {
            event.preventDefault();
            return send({ action: 'newTab' });
          }
          if (meta && !shift && !alt && key === 'w') {
            event.preventDefault();
            return send({ action: 'closeTab' });
          }
          // Omnibox / find
          if (meta && !shift && !alt && key === 'l') {
            event.preventDefault();
            return send({ action: 'focusOmnibox' });
          }
          if (meta && !shift && !alt && key === 'f') {
            event.preventDefault();
            return send({ action: 'find' });
          }
          // Reopen closed tab
          if (meta && shift && !alt && key === 't') {
            event.preventDefault();
            return send({ action: 'reopenClosedTab' });
          }
          // Cycle tabs
          if (meta && key === 'tab') {
            event.preventDefault();
            return send({ action: shift ? 'prevTab' : 'nextTab' });
          }
          // Switch nth tab
          if (meta && !shift && !alt && /^[1-9]$/.test(key)) {
            event.preventDefault();
            const index = key === '9' ? 9 : parseInt(key, 10);
            return send({ action: 'nthTab', index });
          }
          // Zoom
          if (meta && !alt && !shift && (key === '=' || key === '+')) {
            event.preventDefault();
            return send({ action: 'zoomIn' });
          }
          if (meta && !alt && !shift && key === '-') {
            event.preventDefault();
            return send({ action: 'zoomOut' });
          }
          if (meta && !alt && !shift && key === '0') {
            event.preventDefault();
            return send({ action: 'resetZoom' });
          }
          // Mute
          if (meta && !alt && !shift && key === 'm') {
            event.preventDefault();
            return send({ action: 'toggleMute' });
          }
        } catch (e) {
          console.warn('webview before-input-event error:', e?.message || e);
        }
      });
    } catch {}
  } else {
    console.log('Unknown content type:', type, 'allowing navigation');
  }
  // Ensure ElectronBlocker is attached to newly created webContents sessions so webviews/BrowserViews are covered
  try {
    if (blockerInstance && contents && typeof contents.session !== 'undefined' && contents.session) {
      try {
        blockerInstance.enableBlockingInSession(contents.session);
        console.log('[Adblock] attached blocker to new webContents session:', contents.id || '(unknown)');
      } catch (e) {
        // Some blocker builds may not expose enableBlockingInSession for this session type; ignore
        console.warn('[Adblock] failed to attach blocker to new session:', e?.message || e);
      }
    }
  } catch (e) {}
});
