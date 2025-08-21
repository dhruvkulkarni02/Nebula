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
