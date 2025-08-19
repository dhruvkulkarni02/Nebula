import React, { useEffect, useRef, useState } from 'react';
import FindInPage from './FindInPage';
import '../styles/WebView.css';

const WebView = ({ url, isLoading, onUrlChange, onNavigate, onOpenFind, onStopAvailable, onZoomAvailable, onFaviconChange, onAudioAvailable, onLoadingChange, onProgressChange, onOverlayToolsAvailable, onNavAvailable, onNavStateChange, settings }) => {
  const webviewRef = useRef(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [showAddTile, setShowAddTile] = useState(false);
  const [tileForm, setTileForm] = useState({ title: '', url: '' });
  const partitionNameRef = useRef('webview');
  const [wvPreload, setWvPreload] = useState('');

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
        if (p && typeof p === 'string' && p.startsWith('file:')) {
          setWvPreload(p);
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
    };

    const handleLoadStop = () => {
      console.log('Load stopped');
      setLoadProgress(100);
      try { onProgressChange && onProgressChange(100); } catch {}
      try { onLoadingChange && onLoadingChange(false); } catch {}
  try { onNavStateChange && onNavStateChange({ canGoBack: !!webview.canGoBack(), canGoForward: !!webview.canGoForward() }); } catch {}
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
      console.log('WebView DOM ready');
      // Don't set URL here - it's already set via the src attribute
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
    const handleWheel = (e) => {
      try {
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
        if (e?.channel === 'nebula-swipe') {
          const dir = (e?.args && e.args[0]) || '';
          if (dir === 'right') {
            try { if (webview.canGoBack && webview.canGoBack()) webview.goBack(); } catch {}
          } else if (dir === 'left') {
            try { if (webview.canGoForward && webview.canGoForward()) webview.goForward(); } catch {}
          }
        }
      } catch {}
    };
    try { webview.addEventListener('ipc-message', handleIpcMessage); } catch {}

    // Receive synthesized swipe messages from the guest page's preload via postMessage
    const handleMessage = (event) => {
      try {
        const data = event?.data || {};
        if (data && data.__nebulaSwipe === 'right') {
          // right -> back
          try { if (webview.canGoBack && webview.canGoBack()) webview.goBack(); } catch {}
        } else if (data && data.__nebulaSwipe === 'left') {
          // left -> forward
          try { if (webview.canGoForward && webview.canGoForward()) webview.goForward(); } catch {}
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
        wvPreload ? (
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
          // Dedicated guest preload for gesture detection; must be a file:// URL
          preload={wvPreload}
        />) : (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>Loading…</div>
        )
      )}
      
      <FindInPage
        isOpen={showFind}
        onClose={() => setShowFind(false)}
        webviewRef={webviewRef}
      />
    </div>
  );
};

export default WebView;
