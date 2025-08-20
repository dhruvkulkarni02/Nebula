import React, { useEffect, useRef, useState } from 'react';
import FindInPage from './FindInPage';
import '../styles/WebView.css';

const WebView = ({ url, isLoading, onUrlChange, onNavigate, onOpenFind, onStopAvailable, onZoomAvailable, onFaviconChange, onAudioAvailable, onLoadingChange, onProgressChange, onOverlayToolsAvailable, onNavAvailable, onNavStateChange, settings }) => {
  const webviewRef = useRef(null);
  const isLoadingRef = useRef(false);
  const queuedSwipeRef = useRef('');
  const [swipeIndicator, setSwipeIndicator] = useState({ dir: '', visible: false, ignored: false });
  const [loadProgress, setLoadProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [showAddTile, setShowAddTile] = useState(false);
  const [tileForm, setTileForm] = useState({ title: '', url: '' });
  const partitionNameRef = useRef('webview');
  const [wvPreload, setWvPreload] = useState(() => {
    try {
      const p = window.electronAPI?.getWebviewPreloadPath?.();
  try { console.log('[WebView] initial getWebviewPreloadPath ->', p); } catch {}
      if (!p || typeof p !== 'string') return '';
      // Normalize: if caller returned file:// URL, strip scheme to get filesystem path
      try {
        if (p.startsWith('file://')) {
          const url = new URL(p);
          return url.pathname;
        }
      } catch {}
      return p;
    } catch {
      return '';
    }
  });

  // Decide partition once per window for private browsing
  useEffect(() => {
    try {
      const isPrivate = !!window.electronAPI?.isPrivateWindow?.();
      if (isPrivate) {
        if (!window.__nebulaPrivatePartition) {
          window.__nebulaPrivatePartition = 'private-webview-' + Date.now();
        }
        partitionNameRef.current = window.__nebulaPrivatePartition;
      }
      // Resolve webview preload path once on mount
      try {
        const p = window.electronAPI?.getWebviewPreloadPath?.();
        if (p && typeof p === 'string') {
          let normalized = p;
          try { if (p.startsWith('file://')) normalized = new URL(p).pathname; } catch {}
          console.log('Resolved webview preload path (normalized):', normalized);
          setWvPreload(normalized);
        }
      } catch {}
    } catch {}
  }, []);

  // Keep latest callback props in refs so listener effect doesn't depend on changing identities
  const onUrlChangeRef = useRef(onUrlChange);
  const onFaviconChangeRef = useRef(onFaviconChange);
  useEffect(() => { onUrlChangeRef.current = onUrlChange; }, [onUrlChange]);
  useEffect(() => { onFaviconChangeRef.current = onFaviconChange; }, [onFaviconChange]);

  // Track whether we've already exposed control callbacks to the parent to avoid update loops
  const exposedOnceRef = useRef({ find: false, stop: false, zoom: false, audio: false });

  // Expose webviewRef to parent via callback
  useEffect(() => {
    if (onOpenFind && !exposedOnceRef.current.find) {
      // Only expose a function to open the find UI on demand (once per mount)
      onOpenFind(() => setShowFind(true));
      exposedOnceRef.current.find = true;
    }
  }, [onOpenFind]);

  // Ensure find UI is closed on navigation changes
  useEffect(() => {
    setShowFind(false);
  }, [url]);

  useEffect(() => {
    if (onStopAvailable && !exposedOnceRef.current.stop) {
      onStopAvailable(() => {
        const webview = webviewRef.current;
        if (webview && webview.stop) webview.stop();
      });
      exposedOnceRef.current.stop = true;
    }
  }, [onStopAvailable]);

  useEffect(() => {
    if (onZoomAvailable && !exposedOnceRef.current.zoom) {
      onZoomAvailable({
        zoomIn: () => {
          const webview = webviewRef.current;
          if (!webview) return;
          const current = webview.getZoomFactor();
          webview.setZoomFactor(Math.min(current + 0.1, 3));
        },
        zoomOut: () => {
          const webview = webviewRef.current;
          if (!webview) return;
          const current = webview.getZoomFactor();
          webview.setZoomFactor(Math.max(current - 0.1, 0.25));
        },
        resetZoom: () => {
          const webview = webviewRef.current;
          if (!webview) return;
          webview.setZoomFactor(1);
        }
      });
      exposedOnceRef.current.zoom = true;
    }
  }, [onZoomAvailable]);

  useEffect(() => {
    if (onAudioAvailable && !exposedOnceRef.current.audio) {
      onAudioAvailable({
        toggleMute: () => {
          const webview = webviewRef.current;
          if (!webview) return;
          const muted = webview.isAudioMuted();
          webview.setAudioMuted(!muted);
        }
      });
      exposedOnceRef.current.audio = true;
    }
  }, [onAudioAvailable]);

  // Expose back/forward/reload controls to parent
  useEffect(() => {
    if (onNavAvailable && webviewRef.current) {
      const wv = webviewRef.current;
      onNavAvailable({
        goBack: () => { try { if (wv.canGoBack()) wv.goBack(); } catch {} },
        goForward: () => { try { if (wv.canGoForward()) wv.goForward(); } catch {} },
        reload: () => { try { wv.reload(); } catch {} },
      });
    }
  }, [onNavAvailable, webviewRef.current]);

  // Overlay tools removed

  useEffect(() => {
    // Only set up event listeners if we have a valid URL and webview element
    if (!url || url === 'about:blank' || !webviewRef.current) {
      // Silently bail when there's no actionable URL or ref to avoid log spam during app idle/start page
      return;
    }

    const webview = webviewRef.current;

    // Reset error state when URL changes
    setHasError(false);
    setErrorMessage('');
    setLoadProgress(0);

    // Handle navigation events
    const handleNavigation = async () => {
      try {
        const currentUrl = webview.getURL();
        const title = webview.getTitle();
        console.log('Navigation:', currentUrl, title);
        onUrlChangeRef.current && onUrlChangeRef.current(currentUrl, title);

  // Propagate nav state (canGoBack/Forward)
  try { onNavStateChange && onNavStateChange({ canGoBack: !!webview.canGoBack(), canGoForward: !!webview.canGoForward() }); } catch {}

        // Add to history (skip for private windows)
        const isPrivate = !!window.electronAPI?.isPrivateWindow?.();
        if (window.electronAPI && currentUrl && currentUrl !== 'about:blank' && !isPrivate) {
          await window.electronAPI.addToHistory(currentUrl, title);
        }
      } catch (error) {
        console.error('Navigation error:', error);
      }
    };

    const handlePageLoad = () => {
      console.log('Page loaded successfully');
      handleNavigation();
      setLoadProgress(100);
      try { onProgressChange && onProgressChange(100); } catch {}
      try { onLoadingChange && onLoadingChange(false); } catch {}
      setHasError(false);
      // clear loading state and process any queued swipe
      try { isLoadingRef.current = false; } catch {}
      try {
        const q = queuedSwipeRef.current;
        if (q) {
          queuedSwipeRef.current = '';
          try { console.log('Processing queued swipe after load:', q); } catch {}
          processSwipe(q);
        }
      } catch {}
    };

    const handlePageTitle = () => {
      handleNavigation();
    };

    const handleLoadProgress = (event) => {
      const progress = Math.round((event?.progress || 0) * 100);
      setLoadProgress(progress);
    };

    const handleLoadStart = () => {
      console.log('Load started');
      setLoadProgress(10);
      try { onProgressChange && onProgressChange(10); } catch {}
      try { onLoadingChange && onLoadingChange(true); } catch {}
  try { onNavStateChange && onNavStateChange({ canGoBack: !!webview.canGoBack(), canGoForward: !!webview.canGoForward() }); } catch {}
      setHasError(false);
  try { isLoadingRef.current = true; } catch {}
    };

    const handleLoadStop = () => {
      console.log('Load stopped');
      setLoadProgress(100);
      try { onProgressChange && onProgressChange(100); } catch {}
      try { onLoadingChange && onLoadingChange(false); } catch {}
  try { onNavStateChange && onNavStateChange({ canGoBack: !!webview.canGoBack(), canGoForward: !!webview.canGoForward() }); } catch {}
      try { isLoadingRef.current = false; } catch {}
      // If load stopped and we have a queued swipe, process it (but keep cooldown semantics)
      try {
        const q = queuedSwipeRef.current;
        if (q) {
          queuedSwipeRef.current = '';
          try { console.log('Processing queued swipe after load stop:', q); } catch {}
          processSwipe(q);
        }
      } catch {}
    };

    const handleFailLoad = (event) => {
      const code = event?.errorCode;
      const desc = event?.errorDescription || 'Unknown error';
      const vurl = event?.validatedURL || url;
      const isMain = !!event?.isMainFrame;
      console.error('WebView load failed:', { code, desc, url: vurl, isMain });
      // Ignore subframe/resource failures (e.g., ad/tracker blocks) and benign aborts
      const benignCodes = new Set([-3, -27]); // ERR_ABORTED, ERR_BLOCKED_BY_RESPONSE
      if (!isMain || benignCodes.has(code)) {
        return;
      }
      setHasError(true);
      setErrorMessage(`Failed to load (${code}): ${desc}`);
      setLoadProgress(0);
      try { onProgressChange && onProgressChange(0); } catch {}
      try { onLoadingChange && onLoadingChange(false); } catch {}
    };

    // Wait for webview to be ready
    const handleDomReady = () => {
  console.log('WebView DOM ready - url:', url, 'preload:', wvPreload);
      // Don't set URL here - it's already set via the src attribute
      try {
        const wv = webviewRef.current;
        if (wv && !wv.__nebulaGestureInjected) {
          // Inject a minimal guest-side wheel listener so we can detect horizontal trackpad swipes
          const script = `(() => {
            try {
              if (window.__nebulaGestureInjected) return;
              window.__nebulaGestureInjected = true;
              let accum = 0; let cooldownUntil = 0;
              const THRESHOLD = 120; const COOLDOWN = 400;
              const onWheel = (e) => {
                try {
                  const dx = (typeof e.deltaX === 'number') ? e.deltaX : 0;
                  const dy = (typeof e.deltaY === 'number') ? e.deltaY : 0;
                  if (Math.abs(dx) <= Math.abs(dy)) return;
                  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                  if (now < cooldownUntil) return;
                  accum += dx;
                  if (accum >= THRESHOLD) { accum = 0; cooldownUntil = now + COOLDOWN; try { window.postMessage({ __nebulaSwipe: 'right' }, '*'); } catch {} }
                  else if (accum <= -THRESHOLD) { accum = 0; cooldownUntil = now + COOLDOWN; try { window.postMessage({ __nebulaSwipe: 'left' }, '*'); } catch {} }
                } catch {}
              };
              window.addEventListener('wheel', onWheel, { passive: true, capture: true });
              document.addEventListener('wheel', onWheel, { passive: true, capture: true });
            } catch (e) {}
          })();`;
          try { wv.executeJavaScript(script).catch(() => {}); } catch {}
          wv.__nebulaGestureInjected = true;
        }
      } catch (e) {}
    };

    const handleFaviconUpdated = (event) => {
      if (onFaviconChangeRef.current) {
        onFaviconChangeRef.current(event.favicons || []);
      }
    };

    // Handle permission requests (media/fullscreen)
    const handlePermissionRequest = (e) => {
      const p = e?.permission;
      if (["media", "microphone", "camera", "fullscreen", "pointerLock"].includes(p)) {
        try { e.request?.allow(); } catch {}
      } else {
        try { e.request?.deny(); } catch {}
      }
    };

  // Add event listeners
    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleLoadStart);
    webview.addEventListener('did-stop-loading', handleLoadStop);
    webview.addEventListener('did-finish-load', handlePageLoad);
    webview.addEventListener('did-fail-load', handleFailLoad);
    webview.addEventListener('page-title-updated', handlePageTitle);
    webview.addEventListener('did-navigate', handleNavigation);
    webview.addEventListener('did-navigate-in-page', handleNavigation);
    webview.addEventListener('page-favicon-updated', handleFaviconUpdated);
    webview.addEventListener('permissionrequest', handlePermissionRequest);

    // Trackpad horizontal swipe synthesis (renderer-side fallback)
  let wheelAccum = 0;
  let wheelCooldownUntil = 0;
  const wheelThreshold = 150; // more sensitive
  const wheelCooldownMs = 350;
  // Central swipe cooldown to dedupe duplicate messages coming from multiple layers
  // (guest sendToHost + postMessage + renderer/main synthesis). This ensures
  // one physical gesture triggers at most one navigation action per cooldown window.
  const SWIPE_COOLDOWN_MS = 600;
  let lastSwipeAt = 0;
  const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const processSwipe = (dir) => {
    try {
      const now = nowMs();
      if (now - lastSwipeAt < SWIPE_COOLDOWN_MS) {
        try { console.log('Swipe ignored due to cooldown (ms):', Math.round(now - lastSwipeAt)); } catch {}
        return false;
      }

      const canBack = !!(webview && webview.canGoBack && webview.canGoBack());
      const canForward = !!(webview && webview.canGoForward && webview.canGoForward());
      try { console.log('Processing swipe (pre-check):', dir, 'canBack=', canBack, 'canForward=', canForward); } catch {}

      // If there's nothing to do, show a ghost indicator briefly and don't consume cooldown
      if (!canBack && !canForward) {
        try { console.log('Swipe ignored: no history available for', dir); } catch {}
        try { setSwipeIndicator({ dir, visible: true, ignored: true }); } catch {}
        setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
        return false;
      }

      // Mark cooldown only when we are actually going to attempt navigation
      lastSwipeAt = now;

      try { console.log('Processing swipe:', dir, 'canBack=', canBack, 'canForward=', canForward); } catch {}

      const tryBack = () => {
        if (canBack) {
          try { webview.goBack(); return true; } catch (err) { console.warn('goBack failed', err); }
        }
        try { webview.executeJavaScript && webview.executeJavaScript('history.back();').catch(()=>{}); } catch {}
        return false;
      };
      const tryForward = () => {
        if (canForward) {
          try { webview.goForward(); return true; } catch (err) { console.warn('goForward failed', err); }
        }
        try { webview.executeJavaScript && webview.executeJavaScript('history.forward();').catch(()=>{}); } catch {}
        return false;
      };

      if (dir === 'right') {
        if (!tryBack()) tryForward();
      } else if (dir === 'left') {
        if (!tryForward()) tryBack();
      }
      return true;
    } catch (err) {
      console.warn('processSwipe error', err);
      return false;
    }
  };
    const handleWheel = (e) => {
      try {
  console.log('WebView element wheel event:', { dx: e.deltaX, dy: e.deltaY });
        // Only consider horizontal gestures
        const absX = Math.abs(e.deltaX);
        const absY = Math.abs(e.deltaY);
        if (absX <= absY) return;
        const now = performance.now ? performance.now() : Date.now();
        if (now < wheelCooldownUntil) return;
        wheelAccum += e.deltaX;
        if (wheelAccum >= wheelThreshold) {
          wheelAccum = 0;
          wheelCooldownUntil = now + wheelCooldownMs;
          // swipe right -> back
          try { if (webview.canGoBack && webview.canGoBack()) webview.goBack(); } catch {}
        } else if (wheelAccum <= -wheelThreshold) {
          wheelAccum = 0;
          wheelCooldownUntil = now + wheelCooldownMs;
          // swipe left -> forward
          try { if (webview.canGoForward && webview.canGoForward()) webview.goForward(); } catch {}
        }
      } catch {}
    };
    webview.addEventListener('wheel', handleWheel, { passive: true });

    // Security: Add console message handler for debugging
    webview.addEventListener('console-message', (e) => {
      if (process.env.NODE_ENV === 'development' && e.level >= 2) {
        console.log('WebView console:', e.message);
      }
    });

    // Listen for ipc messages sent from guest preload via ipcRenderer.sendToHost
    const handleIpcMessage = (e) => {
      try {
        try { console.log('WebView ipc-message received:', e && e.channel, e && e.args); } catch {}
        if (e?.channel === 'nebula-swipe') {
          const dir = (e?.args && e.args[0]) || '';
          try {
            // If the webview is currently loading, queue the swipe to avoid navigation errors
            if (isLoadingRef.current) {
              queuedSwipeRef.current = dir;
              try { setSwipeIndicator({ dir, visible: true, ignored: false }); } catch {}
              setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
            } else {
              try { setSwipeIndicator({ dir, visible: true, ignored: false }); } catch {}
              setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
              processSwipe(dir);
            }
          } catch (err) { console.warn('ipc-message handler error', err); }
        }
      } catch {}
    };
    try { webview.addEventListener('ipc-message', handleIpcMessage); } catch {}

    // Receive synthesized swipe messages from the guest page's preload via postMessage
    const handleMessage = (event) => {
      try {
        try { console.log('WebView host message event:', event && event.data); } catch {}
        const data = event?.data || {};
        if (data && data.__nebulaSwipe === 'right') {
          try {
            if (isLoadingRef.current) {
              queuedSwipeRef.current = 'right';
              try { setSwipeIndicator({ dir: 'right', visible: true, ignored: false }); } catch {}
              setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
            } else {
              try { setSwipeIndicator({ dir: 'right', visible: true, ignored: false }); } catch {}
              setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
              processSwipe('right');
            }
          } catch (err) { console.warn(err); }
        } else if (data && data.__nebulaSwipe === 'left') {
          try {
            if (isLoadingRef.current) {
              queuedSwipeRef.current = 'left';
              try { setSwipeIndicator({ dir: 'left', visible: true, ignored: false }); } catch {}
              setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
            } else {
              try { setSwipeIndicator({ dir: 'left', visible: true, ignored: false }); } catch {}
              setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
              processSwipe('left');
            }
          } catch (err) { console.warn(err); }
        }
      } catch {}
    };
    window.addEventListener('message', handleMessage);

    // Load timeout
    const loadTimeout = setTimeout(() => {
      if (loadProgress < 100) {
        console.warn('Page load timeout for:', url);
        setHasError(true);
        setErrorMessage('Page load timeout (30 seconds)');
      }
    }, 30000);

    // URL is already set via the src attribute, no need to set it again

    // Cleanup
    return () => {
      clearTimeout(loadTimeout);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleLoadStart);
      webview.removeEventListener('did-stop-loading', handleLoadStop);
      webview.removeEventListener('did-finish-load', handlePageLoad);
      webview.removeEventListener('did-fail-load', handleFailLoad);
      webview.removeEventListener('page-title-updated', handlePageTitle);
      webview.removeEventListener('did-navigate', handleNavigation);
      webview.removeEventListener('did-navigate-in-page', handleNavigation);
      webview.removeEventListener('page-favicon-updated', handleFaviconUpdated);
  webview.removeEventListener('permissionrequest', handlePermissionRequest);
  try { webview.removeEventListener('ipc-message', handleIpcMessage); } catch {}
  window.removeEventListener('message', handleMessage);
  webview.removeEventListener('wheel', handleWheel);
    };
  }, [url]);

  if (hasError) {
    return (
      <div className="webview-container">
        <div className="error-page">
          <h2>Unable to load page</h2>
          <p>The page at <strong>{url}</strong> could not be loaded.</p>
          {errorMessage && <p className="error-details">{errorMessage}</p>}
          <button onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="webview-container">
  {(() => { try { console.log('[WebView] rendering webview with preload ->', wvPreload); } catch {} return null; })()}
      {/* Spinner overlay removed: progress now shown as a slim bar in the navigation area */}
      
  {!url || url === 'about:blank' ? (
        <div className="start-page" style={{
          backgroundImage: settings?.homeWallpaper ? `url('${settings.homeWallpaper}')` : 'none',
          backgroundSize: 'cover', backgroundPosition: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24
        }}>
          <h1 style={{
            backdropFilter: settings?.homeWallpaper ? 'blur(4px)' : 'none',
            padding: 8, borderRadius: 8,
            color: getComputedStyle(document.documentElement).getPropertyValue('--fg') || undefined
          }}>🌤️ NebulaBrowser</h1>
          <p style={{ marginBottom: 16 }}>Tip: Cmd/Ctrl+L to focus the address bar, Cmd/Ctrl+T to open a new tab.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12, width:'min(900px, 90vw)' }}>
            {/* Add Tile card */}
            <button onClick={()=>{ setTileForm({ title:'', url:'' }); setShowAddTile(true); }} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:8,
              background:'var(--card-bg)', color:'var(--fg)', border:'1px dashed var(--border)', borderRadius:12, padding:'14px', cursor:'pointer'
            }} title="Add a site to Home">
              <div style={{ width:32, height:32, borderRadius:8, background:'color-mix(in srgb, var(--accent) 15%, transparent)', display:'flex', alignItems:'center', justifyContent:'center' }}>＋</div>
              <div style={{ fontWeight:600, fontSize:14, textAlign:'center' }}>Add Tile</div>
            </button>
            {(settings?.homeTiles || []).map((tile, i) => (
              <button key={i} onClick={()=> onNavigate && tile?.url && onNavigate(tile.url)} style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:8,
                background:'var(--card-bg)', color:'var(--fg)', border:'1px solid var(--border)', borderRadius:12, padding:'14px', cursor:'pointer'
              }}>
                {tile?.icon ? (
                  <img alt="" src={tile.icon} style={{ width:32, height:32, objectFit:'contain' }} />
                ) : (
                  <div style={{ width:32, height:32, borderRadius:8, background:'var(--muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>🔗</div>
                )}
                <div style={{ fontWeight:600, fontSize:14, textAlign:'center', maxWidth:140, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{tile?.title || tile?.url}</div>
              </button>
            ))}
          </div>

          {showAddTile && (
            <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'color-mix(in srgb, var(--bg) 40%, transparent)' }} onClick={()=>setShowAddTile(false)}>
              <div style={{ background:'var(--panel)', color:'var(--fg)', border:'1px solid var(--border)', borderRadius:12, padding:16, width:360 }} onClick={(e)=>e.stopPropagation()}>
                <h3 style={{ marginBottom:8 }}>Add Tile</h3>
                <div style={{ display:'grid', gap:8 }}>
                  <input placeholder="URL (https://...)" value={tileForm.url} onChange={(e)=> setTileForm(f=>({ ...f, url: e.target.value }))} style={{ padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8, background:'var(--bg)', color:'var(--fg)' }} />
                  <input placeholder="Title (optional)" value={tileForm.title} onChange={(e)=> setTileForm(f=>({ ...f, title: e.target.value }))} style={{ padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8, background:'var(--bg)', color:'var(--fg)' }} />
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                    <button onClick={()=>setShowAddTile(false)} style={{ padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8, background:'transparent', cursor:'pointer' }}>Cancel</button>
                    <button onClick={async ()=>{
                      try {
                        const ensureUrl = (u)=>{ let s=String(u||'').trim(); if(!s) return ''; if(!/^https?:\/\//i.test(s)){ s='https://'+s; } return s; };
                        const u = ensureUrl(tileForm.url);
                        if (!u) return;
                        let title = (tileForm.title||'').trim();
                        const host = (()=>{ try{ return new URL(u).hostname; }catch{return ''; }})();
                        if (!title) title = host || u;
                        const origin = (()=>{ try{ return new URL(u).origin; }catch{return ''; }})();
                        const icon = origin ? origin + '/favicon.ico' : '';
                        const cur = (settings?.homeTiles || []);
                        const existingIdx = cur.findIndex(t => (t.url||'').trim() === u);
                        const next = [...cur];
                        if (existingIdx >= 0) next[existingIdx] = { ...next[existingIdx], title, url: u, icon };
                        else next.unshift({ title, url: u, icon });
                        await window.electronAPI?.updateSettings?.({ ...settings, homeTiles: next });
                        setShowAddTile(false);
                      } catch {}
                    }} style={{ padding:'8px 10px', border:'1px solid var(--accent)', borderRadius:8, background:'var(--accent)', color:'#fff', cursor:'pointer' }}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <webview
          ref={webviewRef}
          src={url}
          className="webview"
          // Security settings - balance security with compatibility
          nodeintegration="false"
          webpreferences="contextIsolation=true,enableRemoteModule=false,sandbox=true,allowRunningInsecureContent=false,experimentalFeatures=false,disableBlinkFeatures=IdleDetection"
          // Disallow popups by default; they can be handled via target=_blank navigations
          // allowpopups
          // Disable legacy plugins (Pepper/Flash)
          plugins="false"
          // Updated user agent for better compatibility with modern websites
          useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
          // Partition for session management
          partition={partitionNameRef.current}
          // Enable experimental web platform features
          experimentalfeatures="false"
          // Dedicated guest preload for gesture detection; webview expects a file:// URL
          preload={wvPreload ? `file://${wvPreload}` : undefined}
        />
      )}
      
      <FindInPage
        isOpen={showFind}
        onClose={() => setShowFind(false)}
        webviewRef={webviewRef}
      />
      {/* Swipe indicator overlay */}
      {swipeIndicator && swipeIndicator.visible && (
        <div className={`swipe-indicator ${swipeIndicator.dir === 'left' ? 'left' : 'right'} visible`} aria-hidden>
          <div className={`arrow ${swipeIndicator.ignored ? 'ghost' : ''}`}>{swipeIndicator.dir === 'left' ? '→' : '←'}</div>
        </div>
      )}
    </div>
  );
};

export default WebView;
