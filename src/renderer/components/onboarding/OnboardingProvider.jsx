import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';

const OnboardingContext = createContext(null);
export const useOnboarding = () => useContext(OnboardingContext);

export function OnboardingProvider({ children, steps: externalSteps, storageKey = 'nebula:onboardingSeen', force = false }) {
  const [seen, setSeen] = useLocalStorage(storageKey, false);
  const [active, setActive] = useState(force || !seen);
  const [stepIndex, setStepIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false); // flag to prevent premature closure
  const steps = externalSteps || [];
  const total = steps.length;
  const current = steps[stepIndex];

  const start = useCallback(() => { 
    setActive(true); 
    setStepIndex(0); 
    setIsFinishing(false); 
  }, []);
  const [completedActions, setCompletedActions] = useState({}); // stepId -> true when user performed required action

  const markActionComplete = useCallback((stepId) => {
    setCompletedActions(prev => prev[stepId] ? prev : { ...prev, [stepId]: true });
  }, []);

  const canAdvance = useCallback((i) => {
    const step = steps[i];
    if (!step?.requireAction) return true;
    return !!completedActions[step.id];
  }, [steps, completedActions]);

  const next = useCallback(() => setStepIndex(i => {
    if (!canAdvance(i)) return i; // gate until action done
    return Math.min(total - 1, i + 1);
  }), [total, canAdvance]);
  const prev = useCallback(() => setStepIndex(i => Math.max(0, i - 1)), []);
  const skip = useCallback(() => {
    setIsFinishing(true);
    setActive(false);
    setSeen(true);
    try { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); } catch {}
  }, [setSeen]);
  const finish = useCallback(() => {
    setIsFinishing(true);
    setActive(false);
    setSeen(true);
    try { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); } catch {}
  }, [setSeen]);

  // Close on ESC
  useEffect(()=>{
    if (!active) return; const onKey = (e)=>{ if(e.key==='Escape'){ skip(); } }; window.addEventListener('keydown', onKey); return ()=> window.removeEventListener('keydown', onKey);
  }, [active, skip]);

  // Listen for external restart events so we can reactivate without remount
  useEffect(()=>{
    const onRestart = () => {
      try { setSeen(false); } catch {}
      setStepIndex(0);
      setActive(true);
      setIsFinishing(false);
    };
    window.addEventListener('nebula-onboarding-restart', onRestart);
  // Also listen for low-level browser data reset broadcast
  try { window.electronAPI?.onBrowserDataReset?.(() => onRestart()); } catch {}
    return () => window.removeEventListener('nebula-onboarding-restart', onRestart);
  }, [setSeen]);

  // Listen for action completion events from the app UI
  useEffect(()=>{
    const onAction = (e)=>{
      try {
        const id = e.detail?.stepId;
        if (!id) return;
        markActionComplete(id);
      } catch {}
    };
    window.addEventListener('nebula-onboarding-action', onAction);
    return ()=> window.removeEventListener('nebula-onboarding-action', onAction);
  }, [markActionComplete]);

  // Keyboard shortcut completion for search step (Cmd/Ctrl+L)
  useEffect(()=>{
    if(!active) return; const handler = (e)=>{
      if(!steps[stepIndex] || steps[stepIndex].id !== 'search') return;
      const key = e.key?.toLowerCase();
      if(key === 'l' && (e.metaKey || e.ctrlKey)){
        // Let default behavior focus the address bar, then mark complete next frame
        requestAnimationFrame(()=> markActionComplete('search'));
      }
    }; window.addEventListener('keydown', handler, true); return ()=> window.removeEventListener('keydown', handler, true);
  }, [active, stepIndex, steps, markActionComplete]);

  // Passive polling to auto-complete steps whose isComplete predicate returns true (e.g., vertical layout activated)
  useEffect(()=>{
    if(!active) return; let frame; let lastTs=0;
    const tick = (ts)=>{
      if (ts - lastTs > 500) { // every 500ms
        lastTs = ts;
        const step = steps[stepIndex];
        if (step?.requireAction && step?.isComplete && !completedActions[step.id]) {
          try { if (step.isComplete()) markActionComplete(step.id); } catch {}
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(frame);
  }, [active, steps, stepIndex, completedActions, markActionComplete]);

  // Sync with settings and react to runtime updates
  useEffect(()=>{
    let disposed = false;
    const reconcile = (s) => {
      if (disposed || isFinishing) return; // don't interfere if user is actively finishing
      const seenSettings = !!s?.onboardingSeen;
      if (!seenSettings) {
        // Start if not already active or flagged
        if (seen) { try { localStorage.removeItem(storageKey); } catch {} setSeen(false); }
        if (!active) start();
      } else if (seenSettings && !seen && !active) {
        // Only auto-close if onboarding is not currently active
        setSeen(true);
      }
    };
    (async () => { try { if (window.electronAPI?.getSettings) { const s = await window.electronAPI.getSettings(); reconcile(s); } } catch {} })();
    // Listen for push updates
    const handler = (_, updated) => reconcile(updated);
    try { window.electronAPI?.onSettingsUpdated?.(handler); } catch {}
    return () => { disposed = true; try { window.electronAPI?.offSettingsUpdated?.(handler); } catch {} };
  }, [active, seen, setSeen, start, storageKey, isFinishing]);

  const factoryReset = async () => {
    try {
      await window.electronAPI?.resetBrowserData?.();
    } catch {}
    try { localStorage.removeItem(storageKey); } catch {}
    setSeen(false);
    setStepIndex(0);
    setActive(true);
  };
  const value = { active, stepIndex, total, current, steps, start, next, prev, skip, finish, factoryReset, markActionComplete, canAdvance, completedActions };
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

// --- Sync with Electron settings and expose restart helper ---
// We place this AFTER definition so hooks above are resolved; executed when module imported.
if (typeof window !== 'undefined') {
  // Defer to next tick to avoid interfering with initial render commit timing
  setTimeout(() => {
    try {
      if (!window.__NEBULA_ONBOARDING_SYNCED__) {
        window.__NEBULA_ONBOARDING_SYNCED__ = true;
        // Attempt to reconcile localStorage flag with electron settings (one-time)
        (async () => {
          try {
            if (!window.electronAPI?.getSettings) return;
            const s = await window.electronAPI.getSettings();
            const lsRaw = localStorage.getItem('nebula:onboardingSeen');
            const lsSeen = lsRaw ? JSON.parse(lsRaw) : false;
            const settingsSeen = !!s?.onboardingSeen;
            if (settingsSeen && !lsSeen) {
              localStorage.setItem('nebula:onboardingSeen', 'true');
            } else if (!settingsSeen && lsSeen) {
              // User hasn't completed onboarding per settings, but LS says seen; clear so provider shows again
              localStorage.removeItem('nebula:onboardingSeen');
            }
          } catch {}
        })();
        // Expose a restart API for manual triggering (dev console or future menu)
        window.NebulaOnboarding = {
          restart(force = false) {
            try { localStorage.removeItem('nebula:onboardingSeen'); } catch {}
            // Dispatch a custom event; provider instances can listen if desired
            const ev = new CustomEvent('nebula-onboarding-restart', { detail: { force } });
            window.dispatchEvent(ev);
          }
        };
        // Auto-listener that forces a reload of the page context state so provider re-evaluates
        window.addEventListener('nebula-onboarding-restart', () => {
          // Soft refresh React tree by toggling a hash (avoids full Electron reload)
          try { const h = location.hash; location.hash = h.includes('onboarding-refresh') ? '#/' : '#/onboarding-refresh'; } catch {}
        });
      }
    } catch {}
  }, 0);
}
