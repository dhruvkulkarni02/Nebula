import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';

/*
  Nebula Onboarding
  - Self-contained React component that implements a 6-step guided onboarding
  - Anchors highlights to DOM nodes using query selectors (falling back gracefully)
  - Uses styled-components + framer-motion for animations
  - Provides keyboard accessibility and a small internal context for state
*/

// --- Onboarding context (simple)
const OnboardingContext = createContext(null);
export const useOnboarding = () => useContext(OnboardingContext);

// --- Styled UI primitives
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(6, 7, 10, 0.70);
  backdrop-filter: blur(6px) saturate(120%);
  z-index: 5000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 28px;
  /* allow clicks to pass through the dimming area; interactive onboarding content will opt-in */
  pointer-events: none;
`;

// Unified panel (replaces previous Card + separate Tooltip to ensure only ONE surface per step)
const Panel = styled(motion.div)`
  position: fixed;
  max-width: 420px;
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  backdrop-filter: blur(10px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  padding: 18px 18px 16px;
  color: #eaf6ff;
  box-shadow: 0 22px 60px -10px rgba(0,0,0,0.55), 0 4px 18px -2px rgba(3,105,161,0.25);
  z-index: 6100;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const StepTitle = styled.h3`margin:0;font-size:17px;letter-spacing:-0.01em;color:#fff;`;
const StepText = styled.p`margin:0;font-size:13px;line-height:1.45;color:#cfe8ff;`;

const ControlsRow = styled.div`display:flex;gap:8px;align-items:center;margin-top:4px;`;
const BtnPrimary = styled.button`background:linear-gradient(180deg,#0ea5e9,#0369a1);border:none;padding:9px 14px;border-radius:10px;color:#fff;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:6px;`;
const BtnGhost = styled.button`background:transparent;border:1px solid rgba(255,255,255,0.1);padding:7px 12px;border-radius:10px;color:#dbeafe;cursor:pointer;`;

// highlight outline animation
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(14,165,233,0.12); }
  70% { box-shadow: 0 0 0 18px rgba(14,165,233,0.00); }
  100% { box-shadow: 0 0 0 0 rgba(14,165,233,0.00); }
`;

const HighlightBox = styled.div`
  position: fixed;
  pointer-events: none;
  border-radius: 10px;
  border: 2px solid rgba(14,165,233,0.9);
  box-shadow: 0 6px 30px rgba(3,105,161,0.18);
  animation: ${pulse} 2000ms ease-out infinite;
  z-index: 6000;
  transition: transform 300ms ease, width 300ms ease, height 300ms ease, left 300ms ease, top 300ms ease;
`;
const MaskOverlay = styled.div`
  position: fixed;
  inset: 0;
  /* keep the mask behind the onboarding card content (Overlay z-index:5000) */
  z-index: 4900;
  pointer-events: none; /* allow interactions through the hole */
`;

// Arrow for panel if anchored to element
const Arrow = styled.div`
  position:absolute;width:0;height:0;left:24px;transform:translateY(100%);
  border-left:10px solid transparent;border-right:10px solid transparent;border-top:12px solid rgba(255,255,255,0.08);
`;

const CodeKey = styled.kbd`background: rgba(255,255,255,0.06); border-radius:6px; padding:4px 6px; font-size:12px; color:#dbeafe; border:1px solid rgba(255,255,255,0.03);`;

// simple confetti canvas
function ConfettiCanvas({ fire }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!fire) return;
    const el = ref.current; if (!el) return;
    const ctx = el.getContext('2d');
    const w = el.width = window.innerWidth; const h = el.height = window.innerHeight;
    const pieces = [];
    for (let i = 0; i < 80; i++) {
      pieces.push({ x: Math.random()*w, y: Math.random()*-h, vx:(Math.random()-0.5)*4, vy:2+Math.random()*6, r:2+Math.random()*6, color: `hsl(${Math.random()*360} 80% 60%)`, rot: Math.random()*360, vrot:(Math.random()-0.5)*8 });
    }
    let raf = null; const start = Date.now();
    const loop = () => {
      ctx.clearRect(0,0,w,h);
      for (const p of pieces) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.rot += p.vrot;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
        ctx.fillStyle = p.color; ctx.fillRect(-p.r, -p.r, p.r*2, p.r*1.2);
        ctx.restore();
      }
      if (Date.now() - start < 4500) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { if (raf) cancelAnimationFrame(raf); ctx.clearRect(0,0,w,h); };
  }, [fire]);
  return <canvas ref={ref} style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:7000}} />;
}

// helper: find bounding rect for a selector, falling back to center of viewport
function getAnchorRect(selector, fallbackPad = 12) {
  try {
    if (!selector) return null;
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Return padded rect
    return { left: r.left - fallbackPad, top: r.top - fallbackPad, width: r.width + fallbackPad*2, height: r.height + fallbackPad*2, el };
  } catch {
    return null;
  }
}

// The steps configuration.
const STEP_CONFIG = [
  { id: 'tabs', title: 'Tab Navigation', selector: '.new-tab-button, .tab-bar .tab', desc: 'Manage all your tabs here. Create, close, and reorganize browsing sessions with ease.', showDemo: 'tabs' },
  { id: 'search', title: 'Search & Shortcuts', selector: '.address-bar .url-input, .url-input', desc: 'Type URLs or searches here. Use shortcuts like', showHintKey: 'Cmd/Ctrl+L', showDemo: 'typing' },
  { id: 'actions', title: 'Actions & Settings', selector: 'button[title="Settings"], .menu-buttons', desc: 'Access settings, extensions, and notifications from here.' , showDemo: 'settings' },
  { id: 'tiles', title: 'Tiles & Customization', selector: '.start-page > div[style*="grid"], .start-page button[title="Add a site to Home"]', desc: 'Your favorite sites are one click away. Drag to rearrange or hit Add Tile.' , showDemo: 'tiles' },
  { id: 'widgets', title: 'Widgets & Extras', selector: '.sidebar-widgets, .widgets-panel', desc: 'Personalize your dashboard with widgets like weather and calendar.' , optional: true },
  { id: 'pro', title: 'Pro Tips', selector: null, desc: 'Keyboard shortcuts and power tips to speed up your day.' , final: true }
];

export default function NebulaOnboarding({ initialAdblockEnabled = true, onClose = () => {} }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [highlightRect, setHighlightRect] = useState(null);
  const [highlightRadius, setHighlightRadius] = useState(10);
  const [confetti, setConfetti] = useState(false);
  const [widgetsPresent, setWidgetsPresent] = useState(false);
  const panelRef = useRef(null);
  const prevExemptRef = useRef(null);
  const retryRef = useRef({ attempts: 0 });
  const retryTimerRef = useRef(null);
  const primaryBtnRef = useRef(null);
  const prevFocusRef = useRef(null);
  // legacy cardRef removed (single panel now)
  const [svgSize, setSvgSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  // remember previous focus and restore when leaving
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    return () => {
      try { prevFocusRef.current?.focus?.(); } catch {}
    };
  }, []);

  // Minimal focus-trap: keep Tab focus inside the onboarding Card when visible
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
  const card = panelRef.current;
  if (!card) return; // panel used for focus trap
  const focusable = Array.from(card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  // keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (!visible) return;
      if (e.key === 'Escape') return finish(true);
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
      if (e.key === 'Tab') {
        // allow tab to move focus inside tooltip when applicable
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, stepIndex]);

  // detect presence of widgets panel (step 5)
  useEffect(() => {
    const found = !!document.querySelector('.sidebar-widgets, .widgets-panel');
    setWidgetsPresent(found);
  }, []);

  // update highlight rect when step changes
  useEffect(() => {
    updateHighlightForStep(stepIndex);
    // also re-evaluate on resize/scroll
    const onResize = () => {
      setSvgSize({ w: window.innerWidth, h: window.innerHeight });
      updateHighlightForStep(stepIndex);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  }, [stepIndex]);

  // cleanup global onboarding classes when this component unmounts
  useEffect(() => {
    return () => {
      try { document.documentElement.classList.remove('nebula-onboard-active'); } catch {}
      try { if (prevExemptRef.current && prevExemptRef.current.classList) prevExemptRef.current.classList.remove('nebula-onboard-exempt'); } catch {}
    };
  }, []);

  const updateHighlightForStep = (index) => {
    // Robust anchor detection with retries for elements that render after mount
    const conf = STEP_CONFIG[index];
    try {
      // skip optional widgets step if not present
      if (conf && conf.optional && !widgetsPresent) {
        setTimeout(() => setStepIndex((s) => Math.min(STEP_CONFIG.length - 1, s + 1)), 80);
        return;
      }
      if (!conf) { setHighlightRect(null); return; }

      // clear any previous retry timer
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      retryRef.current.attempts = 0;

      const tryFind = () => {
        const rect = getAnchorRect(conf.selector) || null;
        if (rect) {
          // clamp rect to viewport so highlight doesn't render off-screen
          const maxW = Math.max(0, window.innerWidth - 24);
          const maxH = Math.max(0, window.innerHeight - 24);
          const clampedLeft = Math.max(12, Math.min(rect.left, Math.max(12, maxW - rect.width)));
          const clampedTop = Math.max(12, Math.min(rect.top, Math.max(12, maxH - rect.height)));
          const clampedWidth = Math.min(rect.width, maxW - clampedLeft + 12);
          const clampedHeight = Math.min(rect.height, maxH - clampedTop + 12);
          const useRect = { ...rect, left: clampedLeft, top: clampedTop, width: Math.max(24, clampedWidth), height: Math.max(24, clampedHeight) };
          // apply exempt class to keep target crisp
          try { if (prevExemptRef.current && prevExemptRef.current.classList) prevExemptRef.current.classList.remove('nebula-onboard-exempt'); } catch {}
          if (rect && rect.el) {
            try { rect.el.classList.add('nebula-onboard-exempt'); prevExemptRef.current = rect.el; } catch {}
            try {
              const cs = window.getComputedStyle(rect.el);
              const br = cs.borderRadius || cs.borderTopLeftRadius || '10px';
              const parsed = parseFloat(br) || 10;
              setHighlightRadius(parsed);
            } catch { setHighlightRadius(10); }
          }
          setHighlightRect(useRect);
          return;
        }

        // not found: center the card as fallback after a few attempts
        retryRef.current.attempts += 1;
        if (retryRef.current.attempts <= 5) {
          // exponential backoff to wait for dynamic UI
          const delay = 120 * retryRef.current.attempts;
          retryTimerRef.current = setTimeout(tryFind, delay);
          return;
        }

  // fallback placement (center card, clamped)
  const w = Math.min(880, window.innerWidth - 120);
  const h = 220;
  const left = Math.max(12, Math.min((window.innerWidth - w) / 2, window.innerWidth - w - 12));
  const top = Math.max(12, Math.min((window.innerHeight - h) / 2 - 40, window.innerHeight - h - 12));
  setHighlightRect({ left, top, width: w, height: h, el: null });
        setHighlightRadius(10);
      };

      tryFind();
    } catch (e) { setHighlightRect(null); }
  };

  const nextStep = useCallback(() => {
    setStepIndex((s) => {
      const next = Math.min(STEP_CONFIG.length - 1, s + 1);
      if (next === STEP_CONFIG.length - 1) {
        // final step pre-celebration
      }
      return next;
    });
  }, []);
  const prevStep = useCallback(() => setStepIndex((s) => Math.max(0, s - 1)), []);

  const finish = useCallback((skipped = false) => {
    // mark onboardingSeen in settings and hide
    try { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); } catch {}
    setConfetti(true);
    setTimeout(() => {
      setVisible(false); onClose && onClose();
    }, 1400);
  }, [onClose]);

  // compute panel position anchored to highlighted rect (single surface per step)
  const panelPos = (() => {
    const r = highlightRect;
    if (!r) {
      // center fallback
      return { left: Math.max(16, (window.innerWidth / 2) - 210), top: Math.max(60, (window.innerHeight / 2) - 140), arrow: false };
    }
    const idealBelowTop = r.top + r.height + 14; // below highlight
    const idealAboveTop = r.top - 10; // we'll translate with panel height after measure
    // We'll attempt below unless too close to bottom
    const spaceBelow = window.innerHeight - (r.top + r.height);
    const openBelow = spaceBelow > 180; // heuristic
    const left = Math.min(Math.max(16, r.left + r.width/2 - 210), window.innerWidth - 16 - 420);
    if (openBelow) return { left, top: idealBelowTop, arrow: 'top' };
    // place above: need panel height; use estimate 160
    const estH = 180;
    const top = Math.max(16, idealAboveTop - estH);
    return { left, top, arrow: 'bottom' };
  })();

  const currentStep = STEP_CONFIG[stepIndex];

  // announce current step for screen-readers
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    setAnnounce(currentStep?.title || '');
    // focus primary action for keyboard users
    setTimeout(() => { try { primaryBtnRef.current?.focus?.(); } catch {} }, 80);
  }, [stepIndex]);

  return (
    <OnboardingContext.Provider value={{ stepIndex, nextStep, prevStep, finish }}>
      <AnimatePresence>
        {visible && (
          <Overlay className="nebula-onboard-overlay" role="dialog" aria-modal="true" aria-label="Nebula onboarding">
            {/* Masked dim background with cut-out */}
            <MaskOverlay aria-hidden>
              <svg width="100%" height="100%" viewBox={`0 0 ${svgSize.w} ${svgSize.h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                <defs>
                  <mask id="nebula-hole-mask">
                    <rect x="0" y="0" width="100%" height="100%" fill="white" />
                    {highlightRect && (<rect x={highlightRect.left} y={highlightRect.top} width={highlightRect.width} height={highlightRect.height} rx={highlightRadius} ry={highlightRadius} fill="black" />)}
                  </mask>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" fill="rgba(6,7,10,0.72)" mask="url(#nebula-hole-mask)" />
                {highlightRect && (
                  <g>
                    <rect x={highlightRect.left - 8} y={highlightRect.top - 8} width={highlightRect.width + 16} height={highlightRect.height + 16} rx={highlightRadius + 6} fill="none" stroke="rgba(14,165,233,0.12)" strokeWidth="14" filter="url(#nebula-blur)" />
                    <defs>
                      <filter id="nebula-blur" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="12" />
                      </filter>
                    </defs>
                  </g>
                )}
              </svg>
            </MaskOverlay>
            {/* SR announcer */}
            <div aria-live="polite" style={{position:'absolute',left:-9999,top:'auto',width:1,height:1,overflow:'hidden'}}>{announce}</div>

            {/* Highlight outline */}
            {highlightRect && (
              <div style={{ position:'fixed', left:highlightRect.left, top:highlightRect.top, width:highlightRect.width, height:highlightRect.height, pointerEvents:'none', zIndex:6005 }}>
                <HighlightBox style={{ width:'100%', height:'100%', borderRadius:highlightRadius }} />
              </div>
            )}

            {/* Single unified panel */}
            <Panel
              ref={panelRef}
              initial={{ opacity:0, y:6, scale:0.98 }}
              animate={{ opacity:1, y:0, scale:1 }}
              exit={{ opacity:0, y:4, scale:0.98 }}
              transition={{ duration:0.28 }}
              style={{ left: panelPos.left, top: panelPos.top }}
            >
              <StepTitle>{currentStep?.title || 'Welcome to Nebula'}</StepTitle>
              <StepText>{currentStep?.desc} {currentStep?.showHintKey && <CodeKey>{currentStep.showHintKey}</CodeKey>}</StepText>

              {/* Inline demo area (optional) */}
              <div style={{marginTop:4}}>
                {currentStep?.showDemo === 'tabs' && (
                  <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} style={{ display:'flex', gap:10 }}>
                    <div style={{ width:90, height:42, borderRadius:8, background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>Tab 1</div>
                    <motion.div animate={{ x:[0,10,0] }} transition={{ repeat:Infinity, duration:1.4 }} style={{ width:90, height:42, borderRadius:8, background:'linear-gradient(180deg,rgba(14,165,233,0.4),rgba(14,165,233,0.15))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600 }}>Drag</motion.div>
                  </motion.div>
                )}
                {currentStep?.showDemo === 'typing' && (
                  <div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)', padding:'6px 10px', borderRadius:8, marginTop:2}}>
                    <div style={{flex:1,fontFamily:'monospace',fontSize:12,color:'#9fd8ff'}}><TypingDemo text={'search nebula privacy tips'} /></div>
                    <CodeKey>{navigator.platform?.includes('Mac') ? '⌘ L' : 'Ctrl L'}</CodeKey>
                  </div>
                )}
                {currentStep?.showDemo === 'settings' && (
                  <div style={{display:'flex',justifyContent:'center',marginTop:2}}>
                    <div style={{width:130,height:60,borderRadius:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12}}>⚙ Settings</div>
                  </div>
                )}
                {currentStep?.showDemo === 'tiles' && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginTop:4}}>
                    {[0,1,2,3].map(i => <div key={i} style={{height:46,borderRadius:8,background:'rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#dbeafe'}}>{i===0?'★':'site '+(i+1)}</div>)}
                  </div>
                )}
                {currentStep?.final && (
                  <div style={{marginTop:6,fontSize:13,color:'#bfe3ff'}}>You are ready to explore Nebula. Enjoy fast & private browsing! 🚀</div>
                )}
              </div>

              <ControlsRow>
                <BtnGhost onClick={() => { if (stepIndex === 0) finish(true); else prevStep(); }} aria-label={stepIndex === 0 ? 'Skip onboarding' : 'Go back'}>{stepIndex === 0 ? 'Skip' : 'Back'}</BtnGhost>
                <BtnPrimary ref={primaryBtnRef} onClick={() => { if (currentStep?.final) finish(false); else nextStep(); }} aria-label={currentStep?.final ? 'Finish onboarding' : 'Next step'}>{currentStep?.final ? 'Finish' : 'Next'}
                </BtnPrimary>
                <div style={{marginLeft:'auto',fontSize:11,color:'#9fcaf5'}}>{stepIndex+1}/{STEP_CONFIG.length}</div>
              </ControlsRow>
              {panelPos.arrow && <Arrow style={panelPos.arrow==='top'?{top:'100%'}:{bottom:'100%', transform:'translateY(-100%) rotate(180deg)'}} />}
            </Panel>

            <ConfettiCanvas fire={confetti} />
          </Overlay>
        )}
      </AnimatePresence>
    </OnboardingContext.Provider>
  );
}

// small typing demo used in the search demo
function TypingDemo({ text = '', speed = 42 }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    let mounted = true;
    const tick = () => setIdx((i) => Math.min(text.length, i + 1));
    const id = setInterval(() => { if (!mounted) return; setIdx((i) => (i >= text.length ? 0 : i + 1)); }, Math.max(80, speed));
    return () => { mounted = false; clearInterval(id); };
  }, [text, speed]);
  return <span style={{ fontFamily:'monospace', fontSize:13 }}>{text.slice(0, idx)}<span style={{ opacity: idx % 2 ? 1 : 0 }}>▍</span></span>;
}
