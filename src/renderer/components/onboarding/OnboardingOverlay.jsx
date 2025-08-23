import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboarding } from './OnboardingProvider';
import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`from{opacity:0}to{opacity:1}`;

// Backdrop uses pointer-events:none so underlying UI (e.g., tabs) remain fully interactive;
// the panel itself re-enables pointer events so only the dialog captures input.
const Backdrop = styled.div`
  position:fixed;inset:0;z-index:5000;pointer-events:none;display:${p=>p.active?'block':'none'};
`;

// Dim layer darkens background but no longer blurs to keep tab labels readable.
const Dim = styled.div`
  position:absolute;inset:0;animation:${fadeIn} 240ms ease;pointer-events:none; /* allow clicks/drags to pass through */
  background:${p=>p.variant==='tabs'?'rgba(6,7,10,0.25)':p.variant==='customize'?'rgba(6,7,10,0.45)':'rgba(6,7,10,0.60)'};
`;

const HoleSvg = styled.svg`position:absolute;inset:0;width:100%;height:100%;pointer-events:none;`;

const Panel = styled(motion.div)`
  position:fixed;max-width:400px;background:rgba(20,28,36,0.85);backdrop-filter:blur(14px) saturate(140%);
  border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px 18px 14px;color:#e8f4ff;box-shadow:0 18px 48px -8px rgba(0,0,0,0.55);
  font-size:13px;line-height:1.45;display:flex;flex-direction:column;gap:10px;pointer-events:auto;z-index:5100;
`;

const Title = styled.h3`margin:0;font-size:18px;color:#fff;letter-spacing:-0.01em;`;
const Controls = styled.div`display:flex;gap:8px;align-items:center;margin-top:4px;`;
const Btn = styled.button`
  background:#0ea5e9;border:none;color:#fff;padding:8px 14px;border-radius:10px;font-weight:600;cursor:pointer;position:relative;
  &[disabled]{opacity:0.4;cursor:not-allowed;filter:grayscale(20%);} 
`;
const Ghost = styled.button`background:transparent;border:1px solid rgba(255,255,255,0.15);color:#d2e9ff;padding:7px 12px;border-radius:10px;cursor:pointer;`;
const Counter = styled.span`margin-left:auto;font-size:11px;color:#9bc6ed;`;

const pulse = keyframes`0%{box-shadow:0 0 0 0 rgba(14,165,233,0.4);}70%{box-shadow:0 0 0 14px rgba(14,165,233,0);}100%{box-shadow:0 0 0 0 rgba(14,165,233,0);}`;
// Highlight remains visual, but we'll layer an invisible interaction proxy for draggable steps.
const Highlight = styled.div`
  position:fixed;border:3px solid #0ea5e9;border-radius:12px;pointer-events:none;z-index:4900;
  animation:${pulse} 2s ease-out infinite;transition:all 260ms ease;
  background:rgba(14,165,233,0.1);backdrop-filter:blur(2px);
  box-shadow:0 0 0 1px rgba(14,165,233,0.3), 0 4px 20px rgba(14,165,233,0.25);
`;

function getPaddedRect(el, pad=10){
  if(!el) return null; const r = el.getBoundingClientRect();
  // If element is a tab (heuristic), use larger padding for clearer highlight
  const isTab = el.classList && (el.classList.contains('tab') || el.closest('.tab-bar'));
  const extra = isTab ? 4 : 0;
  const p = pad + extra;
  return { left:r.left-p, top:r.top-p, width:r.width+p*2, height:r.height+p*2 };
}

export function OnboardingOverlay(){
  const { active, current, stepIndex, total, next, prev, skip, finish, canAdvance, completedActions } = useOnboarding();
  const [rect,setRect]=useState(null);
  const [target,setTarget] = useState(null);
  const [dynamicDescription,setDynamicDescription] = useState('');
  const panelRef = useRef(null);
  const primaryRef = useRef(null);
  const prevFocusRef = useRef(null);

  // Determine target element for current step
  useEffect(()=>{
    if(!active) { setTarget(null); return; }
    if(!current?.selector && !current?.dynamicSelector) { setTarget(null); return; }
    try {
      // Use dynamic selector if available and returns a result
      if (current?.dynamicSelector) {
        try {
          const dynamicResult = current.dynamicSelector();
          if (dynamicResult && dynamicResult.nodeType === Node.ELEMENT_NODE) {
            setTarget(dynamicResult);
            return;
          }
        } catch (e) {
          console.warn('Dynamic selector failed:', e);
        }
      }
      
      // Fall back to static selector
      const selectorToUse = current.selector;
      if (!selectorToUse) { setTarget(null); return; }
      
      const parts = selectorToUse.split(',').map(s=>s.trim()).filter(Boolean);
      let best=null, bestScore=-1;
      for(const sel of parts){
        const nodes = Array.from(document.querySelectorAll(sel));
        for(const n of nodes){
          const r = n.getBoundingClientRect();
          if(r.width===0 || r.height===0) continue;
          let score = r.width * r.height;
          if(current.id==='tabs'){
            const tabChildren = n.querySelectorAll('[data-tab],[role="tab"],.tab');
            score += tabChildren.length * 5000;
          }
          if(score>bestScore){ bestScore=score; best=n; }
        }
      }
      // Explicit fallbacks for tabs step if heuristic fails
      if (current.id === 'tabs' && !best) {
        best = document.querySelector('.tab-bar .tab.active')
          || document.querySelector('.tab-bar .tab')
          || document.querySelector('.tab-bar');
      }
      setTarget(best||null);
    } catch (e) { 
      console.warn('Target selection failed:', e);
      setTarget(null); 
    }
  }, [active, current]);

  // Recalc highlight continuously for animations/resizes and dynamic target changes
  useEffect(()=>{
    if(!active) return; 
    let frame; 
    const update=()=>{ 
      setRect(getPaddedRect(target)); 
      // Re-check dynamic selectors to catch modal appearances
      if (current?.dynamicSelector) {
        try {
          const newTarget = current.dynamicSelector();
          if (newTarget && newTarget.nodeType === Node.ELEMENT_NODE && newTarget !== target) {
            setTarget(newTarget);
          }
        } catch (e) {
          console.warn('Dynamic selector update failed:', e);
        }
      }
      frame=requestAnimationFrame(update); 
    }; 
    update(); 
    return ()=> cancelAnimationFrame(frame);
  },[active,target,current]);

  // (Removed previous rect top shifting to keep highlight aligned precisely with element)

  // Focus primary button on step change
  useEffect(()=>{ if(!active) return; const t=setTimeout(()=>{ try{primaryRef.current?.focus();}catch{} },60); return ()=>clearTimeout(t);},[active, stepIndex]);

  // Focus management + basic focus trap
  useEffect(()=>{
    if(!active){
      // restore focus when onboarding closes
      try { prevFocusRef.current?.focus?.(); } catch {}
      return;
    }
    // store previously focused element
    try { prevFocusRef.current = document.activeElement; } catch {}
    // initial focus: if primary button not yet rendered, focus panel
    const fallbackTimer = setTimeout(()=>{
      try {
        if (document.activeElement === prevFocusRef.current) {
          (primaryRef.current || panelRef.current)?.focus?.();
        }
      } catch {}
    }, 80);
    const onKey = (e)=>{
      if(e.key !== 'Tab') return;
      const root = panelRef.current; if(!root) return;
      // gather focusable elements inside the panel
      const focusable = root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if(!focusable.length) return;
      const list = Array.from(focusable).filter(el=> !el.hasAttribute('disabled'));
      if(!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      else if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return ()=>{ clearTimeout(fallbackTimer); document.removeEventListener('keydown', onKey, true); };
  }, [active]);

  // Dynamic description that updates if layout changes
  useEffect(()=>{ setDynamicDescription(current?.description || ''); }, [current]);
  useEffect(()=>{
    if(!active || !current || current.id!=='tabs') return;
    const compute=()=>{
      const vertical = document.querySelector('.tab-sidebar, .vertical-tabs, [data-tab-layout="vertical"]');
      const base = current.description || '';
      if(vertical) {
        setDynamicDescription(base.replace(/Drag tabs left or right to reorder\./i,'Drag tabs up or down to reorder in the vertical sidebar.'));
      } else {
        setDynamicDescription(base);
      }
    };
    compute();
    const mo = new MutationObserver(()=>compute());
    mo.observe(document.body,{subtree:true,childList:true,attributes:true});
    window.addEventListener('resize', compute);
    return ()=>{ mo.disconnect(); window.removeEventListener('resize', compute); };
  }, [active, current]);

  // Scroll target into view if needed
  useEffect(()=>{
    if(!active || !target) return;
    const r = target.getBoundingClientRect();
    const margin=16;
    if(r.top < margin || r.bottom > window.innerHeight - margin){
      target.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }, [active, target, stepIndex]);

  // ARIA live region for extra keyboard guidance
  const liveRef = useRef(null);
  useEffect(()=>{
    if(!active || !current) return; if(!liveRef.current) return;
    let extra='';
    if(current.id==='tabs'){
      extra='Tip: Focus a tab and press Option+Shift+PageUp/PageDown (or use context menu) to reorder with keyboard.';
    }
    liveRef.current.textContent=extra;
  }, [active, current, stepIndex]);

  const panelPos = (()=>{
    // For first step (tabs) force center placement so user has clear space to drag tab outward.
    if(current?.id==='tabs'){
      return { left: Math.max(16, window.innerWidth/2 - 200), top: Math.max(80, window.innerHeight/2 - 160) };
    }
    if(!rect){ return { left: Math.max(16, window.innerWidth/2 - 200), top: Math.max(100, window.innerHeight/2 - 140) }; }
    const navbarBottom = 56; // estimated nav bar height
    const safeTop = Math.max(navbarBottom + 8, rect.top);
    const belowSpace = window.innerHeight - (safeTop+rect.height);
    const openBelow = belowSpace > 190;
    const left = Math.min(Math.max(16, rect.left + rect.width/2 - 200), window.innerWidth - 416);
    const top = openBelow ? safeTop + rect.height + 16 : Math.max(navbarBottom + 12, safeTop - 200);
    return { left, top };
  })();

  const isFinal = !!current?.final;

  // Auto navigate to Home for customize step if Add Tile button not present
  useEffect(()=>{
    if(!active || current?.id !== 'customize') return;
    const addBtn = document.querySelector('.start-page button[title="Add a site to Home"]');
    if(!addBtn){
      // Attempt to click Home button to surface start page
      try { document.querySelector('button[title="Home"]').click(); } catch {}
    }
  }, [active, current]);

  // Apply temporary glow to target for customize step
  useEffect(()=>{
    if(!active || current?.id!=='customize' || !target) return;
    const originalTransition = target.style.transition;
    const originalBoxShadow = target.style.boxShadow;
    const originalBorder = target.style.border;
    try {
      target.style.transition = 'box-shadow 300ms ease, border-color 300ms ease';
      target.style.boxShadow = '0 0 0 3px rgba(255,215,64,0.55), 0 0 18px 6px rgba(255,200,50,0.55)';
      target.style.border = '1px solid rgba(255,215,64,0.9)';
    } catch {}
    return ()=>{
      try { target.style.boxShadow = originalBoxShadow; target.style.border = originalBorder; target.style.transition = originalTransition; } catch {}
    };
  }, [active, current, target]);

  // Glow for New Tab button during tabs step to draw attention (without changing target used for dragging existing tab)
  useEffect(()=>{
    if(!active || current?.id!=='tabs') return; let btn = document.querySelector('.new-tab-button'); if(!btn) return;
    const prevShadow = btn.style.boxShadow; const prevBorder = btn.style.border; const prevTransition = btn.style.transition;
    try {
      btn.style.transition = 'box-shadow 300ms ease, border-color 300ms ease';
      btn.style.boxShadow = '0 0 0 3px rgba(80,180,255,0.55), 0 0 18px 6px rgba(80,180,255,0.55)';
      btn.style.border = '1px solid rgba(120,200,255,0.9)';
    } catch {}
    return ()=>{ try { btn.style.boxShadow = prevShadow; btn.style.border = prevBorder; btn.style.transition = prevTransition; } catch {} };
  }, [active, current]);

  // Portal setup to allow pointer interactions with panel while backdrop ignores events
  const [portalEl, setPortalEl] = useState(null);
  useEffect(()=>{
    if(!active) return; // create on demand
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.zIndex = 5100; // above highlight
    el.style.pointerEvents = 'none'; // portal itself should not block interactions
    document.body.appendChild(el);
    setPortalEl(el);
    return ()=>{ document.body.removeChild(el); setPortalEl(null); };
  }, [active]);

  const panelContent = active && (
    <Panel
      key={current?.id || stepIndex}
      ref={panelRef}
      initial={{ opacity:0, y:8, scale:0.98 }}
      animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0, y:4, scale:0.98 }}
      transition={{ duration:0.28 }}
      style={panelPos}
      role="dialog"
      aria-modal="true"
      aria-label={current?.title}
      tabIndex={-1}
    >
      <Title>{current?.title}</Title>
      <div>{dynamicDescription}</div>
      <Controls>
        <Ghost onClick={()=> stepIndex===0 ? skip() : prev()} aria-label={stepIndex===0?'Skip onboarding':'Previous step'}>{stepIndex===0?'Skip':'Back'}</Ghost>
        <Btn
          ref={primaryRef}
          disabled={!isFinal && !canAdvance(stepIndex)}
          onClick={()=> isFinal ? finish() : next()}
          aria-label={isFinal?'Finish onboarding':'Next step'}
          aria-disabled={!isFinal && !canAdvance(stepIndex)}
          data-complete={!isFinal && current?.requireAction && completedActions[current.id] ? 'true' : 'false'}
        >{isFinal?'Finish':'Next'}
          {!isFinal && current?.requireAction && completedActions[current.id] && (
            <span aria-hidden style={{position:'absolute',right:-10,top:-10,background:'#10b981',color:'#fff',fontSize:10,padding:'4px 6px',borderRadius:14,boxShadow:'0 4px 12px rgba(0,0,0,0.3)'}}>✓</span>
          )}
        </Btn>
        <Counter>{stepIndex+1}/{total}</Counter>
      </Controls>
      {!isFinal && current?.requireAction && !completedActions[current.id] && (
        <div style={{fontSize:11,color:'#74c7ff',marginTop:4}}>
          Complete the highlighted action to enable Next.
        </div>
      )}
    </Panel>
  );

  return (
    <>
      <Backdrop active={active} aria-hidden={!active}>
        <AnimatePresence>
          {active && (
            <>
              <Dim variant={current?.id==='tabs'?'tabs':current?.id==='customize'?'customize':undefined} />
              {rect && (
                <Highlight style={{
                  left:rect.left, top:rect.top, width:rect.width, height:rect.height,
                  borderColor: current?.id==='customize' ? '#ffd740' : undefined,
                  boxShadow: current?.id==='customize' ? '0 0 0 3px rgba(255,215,64,0.55), 0 0 22px 10px rgba(255,200,50,0.45)' : undefined,
                  pointerEvents:'none' // never intercept so native drag works
                }} />
              )}
              <div aria-live="polite" aria-atomic="true" style={{position:'fixed',width:1,height:1,overflow:'hidden',clip:'rect(0 0 0 0)'}} ref={liveRef} />
            </>
          )}
        </AnimatePresence>
      </Backdrop>
      {portalEl && ReactDOM.createPortal(panelContent, portalEl)}
    </>
  );
}
