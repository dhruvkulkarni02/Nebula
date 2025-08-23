import React, { useEffect, useRef, useState } from 'react';
import FindInPage from './FindInPage';
import IconAdd from './icons/IconAdd';
import '../styles/WebView.css';
import { OnboardingProvider } from './onboarding/OnboardingProvider';
import { OnboardingOverlay } from './onboarding/OnboardingOverlay';
import { defaultOnboardingSteps } from './onboarding/steps';

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
  const [tileContextMenu, setTileContextMenu] = useState({ open: false, x: 0, y: 0, tileIndex: null });
  const [editingTile, setEditingTile] = useState(null);
  const [draggedTileIndex, setDraggedTileIndex] = useState(null);
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
        // Toggle a simple reader-mode overlay by extracting main article content
        toggleReader: async () => {
          try {
            const w = webviewRef.current;
            if (!w) return;
            // Ask the guest to return simplified HTML via executeJavaScript
            const script = `(() => {
              try {
                // Basic readability-like extraction: prefer <article>, then main, then heuristics
                const pick = el => el ? el.innerHTML : '';
                const article = document.querySelector('article');
                if (article) return { title: (document.title||''), html: pick(article) };
                const main = document.querySelector('main');
                if (main) return { title: (document.title||''), html: pick(main) };
                // Fallback: choose the largest <div> by textContent length
                let best = null; let bestLen = 0;
                document.querySelectorAll('div').forEach(d => {
                  const t = (d.textContent||'').trim(); if (t.length > bestLen) { best = d; bestLen = t.length; }
                });
                if (best) return { title: (document.title||''), html: pick(best) };
                return { title: (document.title||''), html: document.body ? document.body.innerHTML : '' };
              } catch (e) { return { title: document.title||'', html: '' }; }
            })();`;
            const res = await w.executeJavaScript(script, true).catch(() => null);
            if (!res || !res.html) {
              // Toggle off if no content
              w.executeJavaScript(`document.documentElement.querySelector('#__nebula_reader')?.remove();`).catch(()=>{});
              return;
            }
            // Inject overlay using an isolated iframe (srcdoc) to avoid site CSS/JS interference
            const sanitized = res.html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
            const readerHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${(res.title||'')}</title><style>body{font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#111; background:#fff; padding:28px; line-height:1.6; max-width:75ch; margin:28px auto;} h1{font-size:20px; margin-bottom:12px;} img{max-width:100%; height:auto;} a{color:#0066cc;} </style></head><body><h1>${(res.title||'')}</h1><div>${sanitized}</div></body></html>`;
            const overlay = `(() => {
              try {
                const existing = document.getElementById('__nebula_reader');
                if (existing) { existing.remove(); return 'removed'; }
                const container = document.createElement('div');
                container.id = '__nebula_reader';
                container.style.position = 'fixed';
                container.style.inset = '6vh 8vw';
                container.style.overflow = 'hidden';
                container.style.background = 'transparent';
                container.style.padding = '0';
                container.style.borderRadius = '12px';
                container.style.boxShadow = '0 30px 70px rgba(0,0,0,0.32)';
                container.style.zIndex = 2147483647;
                const close = document.createElement('button');
                close.textContent = 'Close';
                close.style.position = 'absolute';
                close.style.right = '12px';
                close.style.top = '12px';
                close.style.zIndex = 2147483650;
                close.onclick = () => container.remove();
                const iframe = document.createElement('iframe');
                iframe.setAttribute('sandbox', 'allow-same-origin');
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.style.borderRadius = '12px';
                // Compose minimal wrapper HTML for srcdoc
                const srcdoc = ${JSON.stringify(readerHtml)};
                iframe.srcdoc = srcdoc;
                // Fill container and insert
                container.appendChild(close);
                container.appendChild(iframe);
                document.body.appendChild(container);
                return 'ok';
              } catch(e) { return 'fail'; }
            })();`;
            const injected = await w.executeJavaScript(overlay).catch(()=>null);
            // If in-page injection failed (CSP/TrustedTypes), fall back to opening a dedicated reader window via the main API
            if (!injected || injected === 'fail') {
              try {
                if (window.electronAPI && typeof window.electronAPI.openReaderWindow === 'function') {
                  await window.electronAPI.openReaderWindow(readerHtml);
                  return;
                }
              } catch (e) {}
            }
          } catch (e) {}
        },
        // Capture a thumbnail of the webview content (returns data URL) — best-effort
        captureThumbnail: async () => {
          try {
            const w = webviewRef.current;
            if (!w) return null;
            // Preferred API: webview.capturePage() returns a Promise with NativeImage
            if (typeof w.capturePage === 'function') {
              const img = await w.capturePage();
              try { return img.toDataURL(); } catch { return null; }
            }
            return null;
          } catch (e) { return null; }
        }
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

    // Inject lightweight ad-hiding CSS for common ad containers to reduce popups
    const injectAdCss = () => {
      try {
        const css = `
          /* Strong ad selectors + overlay removals */
          [id^=ad-], [id*=ad_], [id*=adslot], [class*=ad-], [class*=ads-], .ad, .ads, .adsbox, .adslot, .ad-banner, .ad-container, .advertisement, .ad-placeholder, .adblock-message, .ad_iframe, iframe[id^=google_ads_iframe], .banner-ad, .sponsored, .commercial, [data-ad], [data-ad-client], [data-ad-slot] { display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; width: 0 !important; pointer-events: none !important; }
          /* Hide common full-screen and sticky overlays used for ads */
          .overlay, .modal, .ad-overlay, .popup, .subscribe-modal, .newsletter-modal, .cookie-consent, .cookie-consent-banner { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
          .adsbygoogle { display: none !important; }
          /* Reduce z-index abuse */
          iframe, .ad_iframe { z-index: 0 !important; }
        `;
        const inj = `(function(){try{if(window.__nebula_ad_css_injected) return; const s=document.createElement('style'); s.id='__nebula_ad_css'; s.textContent=${JSON.stringify(css)}; (document.head||document.documentElement).appendChild(s); window.__nebula_ad_css_injected = true; }catch(e){} })();`;
        try { webviewRef.current && webviewRef.current.executeJavaScript(inj).catch(()=>{}); } catch {}
      } catch {}
    };
    try { injectAdCss(); } catch {}

    // Inject a dynamic remover to watch for new ad nodes (helps against SPA-inserted ads)
    const injectAdObserver = () => {
      try {
        const script = `(() => {
          try {
            if (window.__nebulaAdObserver) return;
            const isAdNode = (n) => {
              try {
                if (!n || n.nodeType !== 1) return false;
                const id = (n.id||'').toLowerCase();
                const cls = (n.className||'').toString().toLowerCase();
                const attr = Array.from(n.attributes||[]).map(a=>a.name+"="+(a.value||''));
                if (/^ad-|ad_|adslot|ads-|ads_|doubleclick|googlesyndication|admanager|pagead|ad_iframe|adbanner/.test(id)) return true;
                if (/\b(ad|ads|advert|sponsored|ad-banner|adslot|ad-container|ad_iframe|adsbygoogle)\b/.test(cls)) return true;
                for (const a of attr) if (/data-ad|data-ad-client|data-ad-slot|data-track|aria-label=["']?ad/i.test(a)) return true;
                return false;
              } catch { return false; }
            };
            const removeIfAd = (node) => {
              try {
                if (!node) return;
                if (isAdNode(node)) { node.remove(); return; }
                // Also inspect descendants
                const kids = node.querySelectorAll && node.querySelectorAll('[id],[class],[data-ad]');
                if (kids && kids.length) {
                  for (const k of kids) if (isAdNode(k)) try { k.remove(); } catch {}
                }
              } catch {}
            };
            const obs = new MutationObserver((mutations) => {
              for (const m of mutations) {
                for (const n of m.addedNodes || []) removeIfAd(n);
              }
            });
            obs.observe(document.documentElement||document.body, { childList: true, subtree: true });
            // Run once at start
            try { removeIfAd(document.documentElement || document.body); } catch {}
            window.__nebulaAdObserver = true;
          } catch(e) {}
        })();`;
        try { webviewRef.current && webviewRef.current.executeJavaScript(script).catch(()=>{}); } catch {}
      } catch {}
    };
    try { injectAdObserver(); } catch {}

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
  // Suppression window to ignore duplicate incoming tokens (ipc vs postMessage)
  const DUP_SUPPRESSION_MS = 180;
  let lastIncomingAt = 0;
  let lastIncomingToken = '';
  // Single hide timeout handle for the indicator to avoid multiple setTimeouts
  let indicatorHideHandle = null;
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

      // Attempt the requested direction first. If it's not available (e.g. the
      // device emits tokens inverted for this hardware), fall back to the
      // opposite direction when it's actually possible. This avoids doing
      // nothing on devices that send the opposite token while still not
      // undoing successful guest navigation (we only fallback when the
      // primary action couldn't be performed).
      if (dir === 'right') {
        const ok = tryBack();
        if (!ok) tryForward();
      } else if (dir === 'left') {
        const ok = tryForward();
        if (!ok) tryBack();
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
          // Synthesize an incoming token (guest would post 'right' for positive dx).
          const incoming = 'right';
          processSwipe(incoming);
        } else if (wheelAccum <= -wheelThreshold) {
          wheelAccum = 0;
          wheelCooldownUntil = now + wheelCooldownMs;
          const incoming = 'left';
          processSwipe(incoming);
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
          const incoming = (e?.args && e.args[0]) || '';
          // Dedupe near-duplicate incoming messages (ipc vs postMessage)
          const now = nowMs();
          if (incoming === lastIncomingToken && (now - lastIncomingAt) < DUP_SUPPRESSION_MS) {
            try { console.log('Duplicate incoming token suppressed:', incoming); } catch {}
            return;
          }
          lastIncomingAt = now; lastIncomingToken = incoming;
          // Normalize incoming token against current history state to handle
          // devices that report inverted delta signs. If the incoming token
          // doesn't map to an available action, prefer the action that is
          // possible (canGoBack/canGoForward).
          const canBackNow = !!(webview && webview.canGoBack && webview.canGoBack());
          const canForwardNow = !!(webview && webview.canGoForward && webview.canGoForward());
          let dir = incoming;
          if (incoming === 'left') {
            // guest said 'left' — on some hardware this actually means back
            if (canBackNow && !canForwardNow) dir = 'right';
            else if (!canBackNow && canForwardNow) dir = 'left';
          } else if (incoming === 'right') {
            if (canForwardNow && !canBackNow) dir = 'left';
            else if (!canForwardNow && canBackNow) dir = 'right';
          }
          try {
            // If the webview is currently loading, queue the swipe to avoid navigation errors
              if (isLoadingRef.current) {
              queuedSwipeRef.current = dir;
              try { setSwipeIndicator({ dir, visible: true, ignored: false }); } catch {}
              // reset single hide timer
              try { if (indicatorHideHandle) clearTimeout(indicatorHideHandle); } catch {}
              indicatorHideHandle = setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
            } else {
              try { setSwipeIndicator({ dir, visible: true, ignored: false }); } catch {}
              try { if (indicatorHideHandle) clearTimeout(indicatorHideHandle); } catch {}
              indicatorHideHandle = setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
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
          const incoming = 'right';
          const now = nowMs();
          if (incoming === lastIncomingToken && (now - lastIncomingAt) < DUP_SUPPRESSION_MS) {
            try { console.log('Duplicate incoming token suppressed (postMessage):', incoming); } catch {}
            return;
          }
          lastIncomingAt = now; lastIncomingToken = incoming;
          // Normalize postMessage tokens similarly to the ipc path
          const canBackNow = !!(webview && webview.canGoBack && webview.canGoBack());
          const canForwardNow = !!(webview && webview.canGoForward && webview.canGoForward());
          let dir = 'right';
          if (canForwardNow && !canBackNow) dir = 'left';
          else if (!canForwardNow && canBackNow) dir = 'right';
          try {
            if (isLoadingRef.current) {
              queuedSwipeRef.current = dir;
              try { setSwipeIndicator({ dir, visible: true, ignored: false }); } catch {}
              try { if (indicatorHideHandle) clearTimeout(indicatorHideHandle); } catch {}
              indicatorHideHandle = setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
            } else {
              try { setSwipeIndicator({ dir, visible: true, ignored: false }); } catch {}
              try { if (indicatorHideHandle) clearTimeout(indicatorHideHandle); } catch {}
              indicatorHideHandle = setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
              processSwipe(dir);
            }
          } catch (err) { console.warn(err); }
        } else if (data && data.__nebulaSwipe === 'left') {
          const incoming = 'left';
          const now = nowMs();
          if (incoming === lastIncomingToken && (now - lastIncomingAt) < DUP_SUPPRESSION_MS) {
            try { console.log('Duplicate incoming token suppressed (postMessage):', incoming); } catch {}
            return;
          }
          lastIncomingAt = now; lastIncomingToken = incoming;
          let dir = 'left';
          if (canBackNow && !canForwardNow) dir = 'right';
          else if (!canBackNow && canForwardNow) dir = 'left';
          try {
            if (isLoadingRef.current) {
              queuedSwipeRef.current = dir;
              try { setSwipeIndicator({ dir, visible: true, ignored: false }); } catch {}
              try { if (indicatorHideHandle) clearTimeout(indicatorHideHandle); } catch {}
              indicatorHideHandle = setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
            } else {
              try { setSwipeIndicator({ dir, visible: true, ignored: false }); } catch {}
              try { if (indicatorHideHandle) clearTimeout(indicatorHideHandle); } catch {}
              indicatorHideHandle = setTimeout(() => { try { setSwipeIndicator(s => ({ ...s, visible: false })); } catch {} }, 700);
              processSwipe(dir);
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

  // Tile management functions
  const handleTileContextMenu = (e, tileIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setTileContextMenu({ 
      open: true, 
      x: e.clientX, 
      y: e.clientY, 
      tileIndex 
    });
  };

  const handleDeleteTile = async (tileIndex) => {
    try {
      const tiles = settings?.homeTiles || [];
      const newTiles = tiles.filter((_, i) => i !== tileIndex);
      await window.electronAPI?.updateSettings?.({ ...settings, homeTiles: newTiles });
      setTileContextMenu({ open: false, x: 0, y: 0, tileIndex: null });
    } catch (err) {
      console.error('Failed to delete tile:', err);
    }
  };

  const handleEditTile = (tileIndex) => {
    const tile = (settings?.homeTiles || [])[tileIndex];
    if (tile) {
      setEditingTile({ ...tile, index: tileIndex });
      setTileContextMenu({ open: false, x: 0, y: 0, tileIndex: null });
    }
  };

  const handleSaveEditTile = async () => {
    try {
      if (!editingTile) return;
      const tiles = [...(settings?.homeTiles || [])];
      tiles[editingTile.index] = {
        title: editingTile.title,
        url: editingTile.url,
        icon: editingTile.icon
      };
      await window.electronAPI?.updateSettings?.({ ...settings, homeTiles: tiles });
      setEditingTile(null);
    } catch (err) {
      console.error('Failed to save tile edit:', err);
    }
  };

  const handleTileDragStart = (e, tileIndex) => {
    setDraggedTileIndex(tileIndex);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tileIndex.toString());
  };

  const handleTileDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTileDrop = async (e, dropIndex) => {
    e.preventDefault();
    const dragIndex = draggedTileIndex;
    
    if (dragIndex === null || dragIndex === dropIndex) {
      setDraggedTileIndex(null);
      return;
    }

    try {
      const tiles = [...(settings?.homeTiles || [])];
      const [movedTile] = tiles.splice(dragIndex, 1);
      tiles.splice(dropIndex, 0, movedTile);
      await window.electronAPI?.updateSettings?.({ ...settings, homeTiles: tiles });
      setDraggedTileIndex(null);
    } catch (err) {
      console.error('Failed to reorder tiles:', err);
      setDraggedTileIndex(null);
    }
  };

  const handleTileDragEnd = () => {
    setDraggedTileIndex(null);
  };

  return (
    <OnboardingProvider steps={defaultOnboardingSteps}>
    <div className="webview-container">
  {(() => { try { console.log('[WebView] rendering webview with preload ->', wvPreload); } catch {} return null; })()}
      {/* Spinner overlay removed: progress now shown as a slim bar in the navigation area */}
      
  {!url || url === 'about:blank' ? (
        <div className="start-page" style={{
          backgroundImage: settings?.homeWallpaper ? `url('${settings.homeWallpaper}')` : 'none',
          backgroundSize: 'cover', backgroundPosition: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24
        }} onClick={() => {
          // Close context menu when clicking on the background
          if (tileContextMenu.open) {
            setTileContextMenu({ open: false, x: 0, y: 0, tileIndex: null });
          }
        }}>
          <h1 style={{
            backdropFilter: settings?.homeWallpaper ? 'blur(4px)' : 'none',
            padding: 8, borderRadius: 8,
            color: getComputedStyle(document.documentElement).getPropertyValue('--fg') || undefined
          }}>🌤️ NebulaBrowser</h1>
          <p style={{ marginBottom: 16 }}>Tip: Cmd/Ctrl+L to focus the address bar, Cmd/Ctrl+T to open a new tab.</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12, width:'min(900px, 90vw)' }}>
            {/* Add Tile card using SVG icon */}
            <button onClick={()=>{ setTileForm({ title:'', url:'' }); setShowAddTile(true); }} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:8,
              background:'var(--card-bg)', color:'var(--fg)', border:'1px dashed var(--border)', borderRadius:12, padding:'14px', cursor:'pointer'
            }} title="Add a site to Home">
              <IconAdd size={44} />
              <div style={{ fontWeight:600, fontSize:14, textAlign:'center' }}>Add Tile</div>
            </button>
            {(settings?.homeTiles || []).map((tile, i) => (
              <button 
                key={i} 
                draggable
                onClick={(e) => {
                  // Don't navigate if right-clicking or dragging
                  if (e.button !== 0 || draggedTileIndex !== null) return;
                  onNavigate && tile?.url && onNavigate(tile.url);
                }}
                onContextMenu={(e) => handleTileContextMenu(e, i)}
                onDragStart={(e) => handleTileDragStart(e, i)}
                onDragOver={handleTileDragOver}
                onDrop={(e) => handleTileDrop(e, i)}
                onDragEnd={handleTileDragEnd}
                aria-label={tile?.title || tile?.url} 
                style={{
                  display:'flex', 
                  flexDirection:'column', 
                  alignItems:'center', 
                  gap:8,
                  background:'var(--card-bg)', 
                  color:'var(--fg)', 
                  border:'1px solid var(--border)', 
                  borderRadius:12, 
                  padding:'14px', 
                  cursor: draggedTileIndex === i ? 'grabbing' : 'pointer',
                  opacity: draggedTileIndex === i ? 0.5 : 1,
                  transform: draggedTileIndex === i ? 'rotate(5deg)' : 'none',
                  transition: 'opacity 0.2s, transform 0.2s'
                }}
              >
                {/* Render site icons using web-fetched favicons */}
                <div style={{ width:36, height:36, position: 'relative' }}>
                  {tile?.icon ? (
                    <>
                      <img 
                        src={tile.icon} 
                        alt={`${tile.title || tile.url} icon`}
                        style={{ 
                          width: 36, 
                          height: 36, 
                          borderRadius: 6,
                          objectFit: 'contain',
                          display: 'block'
                        }}
                        onError={(e) => {
                          // If favicon fails to load, hide the img and show fallback
                          e.target.style.display = 'none';
                          e.target.nextElementSibling.style.display = 'flex';
                        }}
                      />
                      {/* Fallback that shows when favicon fails to load */}
                      <div style={{ 
                        width:36, 
                        height:36, 
                        borderRadius:6, 
                        background:'var(--muted)', 
                        display:'none', 
                        alignItems:'center', 
                        justifyContent:'center',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        fontSize: '18px'
                      }}>🌐</div>
                    </>
                  ) : (
                    // No favicon available, show default web icon
                    <div style={{ 
                      width:36, 
                      height:36, 
                      borderRadius:6, 
                      background:'var(--muted)', 
                      display:'flex', 
                      alignItems:'center', 
                      justifyContent:'center',
                      fontSize: '18px'
                    }}>🌐</div>
                  )}
                </div>
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
                    <button onClick={()=>setShowAddTile(false)} style={{ padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8, background:'transparent', color:'var(--fg)', cursor:'pointer' }}>Cancel</button>
          <button onClick={async ()=>{
                      try {
                        const ensureUrl = (u)=>{ let s=String(u||'').trim(); if(!s) return ''; if(!/^https?:\/\//i.test(s)){ s='https://'+s; } return s; };
                        const u = ensureUrl(tileForm.url);
                        if (!u) return;
                        let title = (tileForm.title||'').trim();
                        const host = (()=>{ try{ return new URL(u).hostname; }catch{return ''; }})();
                        if (!title) title = host || u;
                        const origin = (()=>{ try{ return new URL(u).origin; }catch{return ''; }})();
                        
                        // Try to find a working favicon, starting with most reliable sources
                        let icon = '';
                        if (origin && host) {
                          const possibleFavicons = [
                            `https://www.google.com/s2/favicons?domain=${host}&sz=32`,  // Google's favicon service (most reliable)
                            `https://icons.duckduckgo.com/ip3/${host}.ico`,  // DuckDuckGo's favicon service
                            `${origin}/favicon.svg`,
                            `${origin}/favicon.ico`,
                            `${origin}/apple-touch-icon.png`,
                            `${origin}/favicon-32x32.png`,
                            `${origin}/favicon-16x16.png`
                          ];
                          
                          // Test favicon by trying to load it as an image
                          for (const faviconUrl of possibleFavicons) {
                            try {
                              await new Promise((resolve, reject) => {
                                const img = new Image();
                                img.onload = () => resolve();
                                img.onerror = () => reject();
                                img.src = faviconUrl;
                                // Timeout after 2 seconds for faster loading
                                setTimeout(() => reject(), 2000);
                              });
                              icon = faviconUrl;
                              break;
                            } catch {
                              // Continue to next favicon option
                              continue;
                            }
                          }
                          
                          // If no favicons work, default to Google's service which should always return something
                          if (!icon) {
                            icon = `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
                          }
                        }
                        
                        const cur = (settings?.homeTiles || []);
                        const existingIdx = cur.findIndex(t => (t.url||'').trim() === u);
                        const next = [...cur];
                        if (existingIdx >= 0) next[existingIdx] = { ...next[existingIdx], title, url: u, icon };
                        else next.unshift({ title, url: u, icon });
                        await window.electronAPI?.updateSettings?.({ ...settings, homeTiles: next });
                        setShowAddTile(false);
            // Onboarding completion event for customize step
            try { window.dispatchEvent(new CustomEvent('nebula-onboarding-action', { detail:{ stepId:'customize' } })); } catch {}
                      } catch {}
                    }} style={{ padding:'8px 10px', border:'1px solid var(--accent)', borderRadius:8, background:'var(--accent)', color:'#fff', cursor:'pointer' }}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tile Context Menu */}
          {tileContextMenu.open && (
            <div 
              style={{ 
                position: 'fixed', 
                left: tileContextMenu.x, 
                top: tileContextMenu.y, 
                zIndex: 15000, 
                minWidth: 160,
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }} 
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => handleEditTile(tileContextMenu.tileIndex)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--fg)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 4
                }}
                onMouseEnter={(e) => e.target.style.background = 'var(--accent-muted)'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                ✏️ Edit Tile
              </button>
              <button 
                onClick={() => handleDeleteTile(tileContextMenu.tileIndex)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--fg)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 4
                }}
                onMouseEnter={(e) => e.target.style.background = '#ef4444'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                🗑️ Delete Tile
              </button>
            </div>
          )}

          {/* Edit Tile Modal */}
          {editingTile && (
            <div 
              style={{ 
                position:'fixed', 
                inset:0, 
                display:'flex', 
                alignItems:'center', 
                justifyContent:'center', 
                background:'color-mix(in srgb, var(--bg) 40%, transparent)' 
              }} 
              onClick={() => setEditingTile(null)}
            >
              <div 
                style={{ 
                  background:'var(--panel)', 
                  color:'var(--fg)', 
                  border:'1px solid var(--border)', 
                  borderRadius:12, 
                  padding:16, 
                  width:360 
                }} 
                onClick={(e)=>e.stopPropagation()}
              >
                <h3 style={{ marginBottom:8 }}>Edit Tile</h3>
                <div style={{ display:'grid', gap:8 }}>
                  <input 
                    placeholder="URL (https://...)" 
                    value={editingTile.url} 
                    onChange={(e)=> setEditingTile(prev => ({ ...prev, url: e.target.value }))} 
                    style={{ 
                      padding:'8px 10px', 
                      border:'1px solid var(--border)', 
                      borderRadius:8, 
                      background:'var(--bg)', 
                      color:'var(--fg)' 
                    }} 
                  />
                  <input 
                    placeholder="Title" 
                    value={editingTile.title} 
                    onChange={(e)=> setEditingTile(prev => ({ ...prev, title: e.target.value }))} 
                    style={{ 
                      padding:'8px 10px', 
                      border:'1px solid var(--border)', 
                      borderRadius:8, 
                      background:'var(--bg)', 
                      color:'var(--fg)' 
                    }} 
                  />
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                    <button 
                      onClick={() => setEditingTile(null)} 
                      style={{ 
                        padding:'8px 10px', 
                        border:'1px solid var(--border)', 
                        borderRadius:8, 
                        background:'transparent', 
                        color:'var(--fg)', 
                        cursor:'pointer' 
                      }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSaveEditTile} 
                      style={{ 
                        padding:'8px 10px', 
                        border:'1px solid var(--accent)', 
                        borderRadius:8, 
                        background:'var(--accent)', 
                        color:'#fff', 
                        cursor:'pointer' 
                      }}
                    >
                      Save
                    </button>
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
        // Map token directly: 'right' token => navigate back (show left/back arrow),
        // 'left' token => navigate forward (show right/forward arrow).
        <div className={`swipe-indicator ${swipeIndicator.dir === 'right' ? 'left' : 'right'} visible`} aria-hidden>
          <div className={`arrow ${swipeIndicator.ignored ? 'ghost' : ''}`}>{swipeIndicator.dir === 'right' ? '←' : '→'}</div>
        </div>
      )}
      <OnboardingOverlay />
    </div>
    </OnboardingProvider>
  );
};

export default WebView;
