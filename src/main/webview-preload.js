
// Securely expose APIs to the webview context using contextBridge
try {
  const { contextBridge, ipcRenderer } = require('electron');
  contextBridge.exposeInMainWorld('electronAPI', {
    disableAdblockFor: (hostname) => ipcRenderer.send('disable-adblock', hostname),
    // Add other safe APIs here
  });
} catch {}

// Runs inside the <webview> guest page context (isolated world)
// Detect robust horizontal swipe gestures and notify host via sendToHost

(function() {
  let ipcRenderer;
  try { ({ ipcRenderer } = require('electron')); } catch {}

  const state = { accum: 0, cooldownUntil: 0 };
  const THRESHOLD = 140; // slightly less sensitive to avoid accidental triggers
  const COOLDOWN = 600; // ms - longer cooldown to avoid duplicates/races

  function onWheel(e) {
    try {
      const dx = (typeof e.deltaX === 'number' ? e.deltaX : 0);
      const dy = (typeof e.deltaY === 'number' ? e.deltaY : 0);
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX <= absY) return; // only horizontal
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now < state.cooldownUntil) return;
      state.accum += dx;
      if (state.accum >= THRESHOLD) {
        state.accum = 0; state.cooldownUntil = now + COOLDOWN;
        // right -> signal host (do NOT call history.back from guest to avoid racing with embedder)
        try { console.log('[webview-preload] detected swipe right -> notify host'); } catch {}
        try { ipcRenderer && ipcRenderer.sendToHost('nebula-swipe', 'right'); } catch {}
        try { window.postMessage && window.postMessage({ __nebulaSwipe: 'right' }, '*'); } catch {}
      } else if (state.accum <= -THRESHOLD) {
        state.accum = 0; state.cooldownUntil = now + COOLDOWN;
        // left -> signal host (do NOT call history.forward from guest)
        try { console.log('[webview-preload] detected swipe left -> notify host'); } catch {}
        try { ipcRenderer && ipcRenderer.sendToHost('nebula-swipe', 'left'); } catch {}
        try { window.postMessage && window.postMessage({ __nebulaSwipe: 'left' }, '*'); } catch {}
      }
    } catch {}
  }

  try {
    window.addEventListener('wheel', onWheel, { passive: true, capture: true });
    document.addEventListener('wheel', onWheel, { passive: true, capture: true });
    // Legacy mousewheel event (some engines/sites)
    const onMouseWheel = (e) => {
      try {
        const dx = (typeof e.wheelDeltaX === 'number') ? -e.wheelDeltaX : 0; // invert to match wheel deltaX
        const dy = (typeof e.wheelDeltaY === 'number') ? -e.wheelDeltaY : 0;
        onWheel({ deltaX: dx, deltaY: dy });
      } catch {}
    };
    window.addEventListener('mousewheel', onMouseWheel, { passive: true, capture: true });
    document.addEventListener('mousewheel', onMouseWheel, { passive: true, capture: true });
  } catch {}
})();

// -----------------------------
// Ad-hiding injection (fallback)
// -----------------------------
(function() {
  // Run after DOM ready and keep watching for injected ad nodes
  function injectAdHiding() {
    try {
      // Avoid injecting aggressive ad-hiding on critical media sites (they can break playback/UI)
      try {
        const skipHosts = ['youtube.com','www.youtube.com','ytimg.com','googlevideo.com','youtube-nocookie.com','youtu.be'];
        const curHost = (location && location.hostname) ? String(location.hostname).toLowerCase() : '';
        if (curHost) {
          for (const sh of skipHosts) {
            if (curHost === sh || curHost.endsWith('.' + sh)) {
              try { console.log('[webview-preload] skipping ad-hiding injection for host:', curHost); } catch {}
              return;
            }
          }
        }
      } catch (e) {}
      // Selectors tuned to be aggressive but avoid common content collisions
      const selectors = [
        '[id*=\"ad\"]',
        '[class*=\"ad\"]',
        '[class*=\"ads\"]',
        '[class*=\"advert\"]',
        '.adsbygoogle',
        '.ad-slot',
        '.ad-container',
        '.ad-banner',
        '.banner-ad',
        '.adunit',
        'iframe[src*="ads"]',
        'iframe[id*=\"ad\"]',
        '[data-ad]',
        '.overlay-ad',
        '.ad-overlay',
        '.cookie-consent',
        '.newsletter-prompt',
        '.subscribe-overlay'
      ];

      // CSS to hide matched elements and common overlay styles
  const css = `
${selectors.join(',')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
/* Also hide full-screen fixed overlays that look like ads */
body > div[style*="position:fixed"]:not([role="dialog"]):not([aria-hidden]) { display: none !important; }
`;

      const style = document.createElement('style');
      style.setAttribute('data-nebula-adhide', '1');
      style.textContent = css;
      document.documentElement && document.documentElement.appendChild(style);

      // Helper to hide nodes matching selector list
    const hideNodeIfAdLike = (node) => {
        try {
          if (!node || node.nodeType !== 1) return;
      const el = node;
      // Never modify or remove <script> elements — Trusted Types / CSP will break if scripts are altered.
      // Only inspect non-script elements.
      if (el.tagName && el.tagName.toLowerCase() === 'script') return;
          // direct checks
          for (const sel of selectors) {
            try { if (el.matches && el.matches(sel)) { el.style.setProperty('display', 'none', 'important'); el.style.setProperty('visibility', 'hidden', 'important'); el.style.setProperty('opacity', '0', 'important'); el.style.setProperty('pointer-events', 'none', 'important'); return; } } catch {}
          }
          // also check descendants
          for (const sel of selectors) {
            try {
              const found = el.querySelector && el.querySelector(sel);
              // avoid touching <script> descendants
              if (found && found.tagName && found.tagName.toLowerCase() === 'script') continue;
              if (found) { found.style.setProperty('display', 'none', 'important'); found.style.setProperty('visibility', 'hidden', 'important'); found.style.setProperty('opacity', '0', 'important'); found.style.setProperty('pointer-events', 'none', 'important'); }
            } catch {}
          }
        } catch {}
      };

      // Observe mutations and hide inserted ad nodes quickly
  const mo = new MutationObserver((mutations) => {
        try {
          for (const m of mutations) {
            if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
              for (const n of Array.from(m.addedNodes)) hideNodeIfAdLike(n);
            } else if (m.type === 'attributes' && m.target) {
      // For attribute changes, avoid touching <script> targets
      try { if (!(m.target && m.target.tagName && m.target.tagName.toLowerCase() === 'script')) hideNodeIfAdLike(m.target); } catch {}
            }
          }
        } catch (e) {}
      });

      try { mo.observe(document.documentElement || document.body || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','id','style','data-ad'] }); } catch (e) {}

      // Initial pass to clean existing nodes
      try {
        const nodes = document.querySelectorAll && document.querySelectorAll(selectors.join(','));
        if (nodes && nodes.length) for (const n of Array.from(nodes)) try { n.style.setProperty('display', 'none', 'important'); n.style.setProperty('visibility', 'hidden', 'important'); n.style.setProperty('opacity', '0', 'important'); n.style.setProperty('pointer-events', 'none', 'important'); } catch (e) {}
      } catch (e) {}

      // One-time grace: remove extremely obtrusive overlays by heuristic
      try {
        const overlays = Array.from(document.querySelectorAll('body > *')).filter(el => {
          try {
            const s = window.getComputedStyle(el);
            if (!s) return false;
            const pos = s.position;
            const z = parseInt(s.zIndex) || 0;
            const w = el.clientWidth || 0;
            const h = el.clientHeight || 0;
            if ((pos === 'fixed' || pos === 'sticky') && z >= 1000 && (w > 100 || h > 100)) return true;
          } catch {}
          return false;
        });
        for (const o of overlays) try { o.style.setProperty('display', 'none', 'important'); } catch {}
      } catch (e) {}
    } catch (e) {}
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    try { injectAdHiding(); } catch (e) {}
  } else {
    try { document.addEventListener('DOMContentLoaded', injectAdHiding, { passive: true }); } catch (e) {}
  }
})();

// -----------------------------
// Popup blocking (webview-level)
// -----------------------------
(function() {
  try {
    let ipcRenderer;
    try { ({ ipcRenderer } = require('electron')); } catch {}

    // Override window.open to block popups and notify host
    try {
      const origOpen = window.open;
      window.open = function(url, target, features) {
        try {
          console.log('[webview-preload] blocked window.open ->', url, target);
          ipcRenderer && ipcRenderer.sendToHost && ipcRenderer.sendToHost('nebula-popup-blocked', String(url || ''));
        } catch (e) {}
        return null;
      };
    } catch (e) {}

    // Prevent anchor clicks that would open new windows (target=_blank)
    try {
      document.addEventListener('click', (ev) => {
        try {
          const a = ev.composedPath && ev.composedPath().find(n => n && n.tagName === 'A') || ev.target && (ev.target.closest ? ev.target.closest('a') : null);
          if (!a) return;
          const t = a.getAttribute && a.getAttribute('target');
          if (t && t.toLowerCase() === '_blank') {
            // Block the popup
            try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
            const href = a.href || a.getAttribute('href') || '';
            try { ipcRenderer && ipcRenderer.sendToHost && ipcRenderer.sendToHost('nebula-popup-blocked', String(href)); } catch (e) {}
            console.log('[webview-preload] blocked anchor target=_blank ->', href);
          }
        } catch (e) {}
      }, { capture: true, passive: false });
    } catch (e) {}
  } catch (e) {}
})();
