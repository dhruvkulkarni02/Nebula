import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';

const SUGGESTED_SITES = [
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'BBC', url: 'https://www.bbc.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Stack Overflow', url: 'https://stackoverflow.com' }
];

// --- Styled components & animations ---
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;
const floaty = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
  100% { transform: translateY(0px); }
`;

const Backdrop = styled.div`
  position: fixed; inset: 0; display:flex; align-items:stretch; justify-content:stretch; z-index:10000;
  background: linear-gradient(180deg, rgba(6,8,12,1), rgba(10,12,18,1));
  color: #e8eef8;
  animation: ${fadeIn} 280ms ease;
`;

const Card = styled.section`
  width: 100vw; height: 100vh; padding:36px; position:relative; border-radius:0;
  background: linear-gradient(180deg, rgba(18,20,26,1), rgba(12,14,20,1));
  box-shadow: none; color: #e8eef8; overflow:auto; display:flex; flex-direction:column; gap:18px;
`;

const Left = styled.div`
  padding: 6px 8px; display:flex; flex-direction:column; gap:12px; width:100%;
`;

const Right = styled.div`
  display:none; /* kept for future use */
`;

const Title = styled.h1`
  font-size:28px; margin:0; letter-spacing:-0.02em; font-weight:700; color:linear-gradient(90deg,#fff,#dcecff);
`;

const Sub = styled.p`
  margin:0; color: rgba(220,230,255,0.86); font-size:14px; line-height:1.45;
`;

const Steps = styled.div`
  display:flex; gap:8px; align-items:center;
`;

const StepDot = styled.button`
  width:10px; height:10px; border-radius:6px; border: none; background: rgba(255,255,255,0.08);
  ${p => p.active && css` background: linear-gradient(90deg,#7ee7ff,#b39bff); transform:scale(1.25); `}
  ${p => p.done && css` background: rgba(255,255,255,0.12); `}
`;

const Hero = styled.div`
  height:140px; border-radius:12px; background: linear-gradient(135deg, rgba(122,102,255,0.18), rgba(72,198,255,0.06));
  display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;
`;

const HeroSVG = styled.svg`
  width:240px; height:120px; opacity:0.98; animation: ${floaty} 4.2s ease-in-out infinite;
`;

const Controls = styled.div`
  display:flex; gap:10px; align-items:center; margin-top:auto;
`;

const PrimaryButton = styled.button`
  appearance:none; border-radius:10px; border: none; padding:10px 14px; font-weight:600;
  background: linear-gradient(90deg,#6ae0ff,#8a6bff); color:#081024; cursor:pointer; box-shadow: 0 6px 20px rgba(80,100,140,0.16);
`;

const Ghost = styled.button`
  appearance:none; border-radius:10px; padding:9px 12px; border:1px solid rgba(255,255,255,0.06); color:rgba(220,230,255,0.9); background:transparent; cursor:pointer;
`;

const TileGrid = styled.div`
  display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-top:8px; overflow:auto; max-height:300px; padding-right:6px;
`;

const Tile = styled.div`
  display:flex; align-items:center; gap:10px; padding:10px; background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005)); border-radius:12px; cursor:pointer; border:1px solid rgba(255,255,255,0.02);
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease; user-select:none;
  &:hover { transform: translateY(-6px); box-shadow: 0 8px 24px rgba(20,30,60,0.48); }
`;

const TileFavicon = styled.div`
  width:36px; height:36px; border-radius:8px; background:linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02)); display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff;
`;

const TileInfo = styled.div`
  display:flex; flex-direction:column; overflow:hidden;
`;

const Small = styled.span`
  font-size:12px; color:rgba(220,230,255,0.75);
`;

// Drag handle visual
const DragHandle = styled.div`
  width:8px; height:24px; border-radius:6px; background: linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01)); margin-left:auto;
`;

export default function OnboardingModal({ onClose, onToggleAdblock, initialAdblockEnabled }) {
  const [step, setStep] = useState(0);
  const total = 3;
  const [enableAdblock, setEnableAdblock] = useState(!!initialAdblockEnabled);
  const [theme, setTheme] = useState('system');
  const [selected, setSelected] = useState([]);
  const [importStatus, setImportStatus] = useState('');
  const fileRef = useRef(null);
  const containerRef = useRef(null);
  const primaryRef = useRef(null);

  useEffect(() => {
    (async function seed() {
      try {
        if (window.electronAPI && typeof window.electronAPI.getSettings === 'function') {
          const s = await window.electronAPI.getSettings();
          if (s && s.theme) setTheme(s.theme);
        }
      } catch {}
    })();
  // Focus management: trap focus inside modal and handle keyboard navigation
    try {
      const prevActive = document.activeElement;
      setTimeout(() => {
        try { (primaryRef.current || containerRef.current)?.focus?.(); } catch {}
      }, 120);
      // Hash-based routing for separate pages: set initial hash and listen for changes
      const mapHashToStep = (h) => {
        try {
          if (!h) return 0;
          const m = h.match(/step\/(\d+)/);
          if (m && m[1]) return Math.max(0, Math.min(total - 1, parseInt(m[1], 10)));
        } catch (e) {}
        return 0;
      };
      const initHash = () => {
        const cur = (window.location.hash || '').replace(/^#/, '');
        const sIdx = mapHashToStep(cur);
        setStep(sIdx);
        if (!cur || !cur.includes('onboarding')) {
          try { window.location.hash = `#/onboarding/step/${sIdx}`; } catch (e) {}
        }
      };
      const onHash = () => {
        const cur = (window.location.hash || '').replace(/^#/, '');
        const sIdx = mapHashToStep(cur);
        setStep(sIdx);
      };
      initHash();
      window.addEventListener('hashchange', onHash, false);
      const onKey = (e) => {
        try {
          if (e.key === 'Escape') {
            // Skip onboarding
            e.stopPropagation();
            onClose && onClose();
          } else if (e.key === 'ArrowRight') {
            goNext();
          } else if (e.key === 'ArrowLeft') {
            goBack();
          } else if (e.key === 'Tab') {
            // focus trap behaviour: keep focus inside the modal
            const root = containerRef.current;
            if (!root) return;
            const focusable = root.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
            if (!focusable || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault(); first.focus();
            }
          }
        } catch {}
      };
      document.addEventListener('keydown', onKey, true);
      return () => {
        try { document.removeEventListener('keydown', onKey, true); window.removeEventListener('hashchange', onHash, false); if (prevActive && prevActive.focus) prevActive.focus(); } catch {}
      };
    } catch {}
  }, []);

  const goNext = useCallback(() => {
    setStep(s => {
      const next = Math.min(total - 1, s + 1);
      try { window.location.hash = `#/onboarding/step/${next}`; } catch (e) {}
      return next;
    });
  }, []);
  const goBack = useCallback(() => {
    setStep(s => {
      const next = Math.max(0, s - 1);
      try { window.location.hash = `#/onboarding/step/${next}`; } catch (e) {}
      return next;
    });
  }, []);

  const toggle = (site) => {
    setSelected(prev => {
      const exists = prev.find(p => p.url === site.url);
      if (exists) return prev.filter(p => p.url !== site.url);
      return [{ ...site }, ...prev];
    });
  };

  const handleImport = async (e) => {
    try {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const text = await f.text(); const data = JSON.parse(text);
      setImportStatus('Importing...');
      if (window.electronAPI && typeof window.electronAPI.importBookmarksData === 'function') {
        const res = await window.electronAPI.importBookmarksData(data);
        setImportStatus(res && res.success ? 'Imported' : 'Failed');
      } else setImportStatus('Not available');
    } catch (err) { setImportStatus('Failed'); }
    finally { try { if (fileRef.current) fileRef.current.value = ''; } catch {} }
  };

  const finish = async () => {
    try {
      if (window.electronAPI) {
        const s = (typeof window.electronAPI.getSettings === 'function') ? await window.electronAPI.getSettings() : {};
        const next = { ...(s || {}), onboardingSeen: true, adBlockEnabled: enableAdblock, theme };
        if (selected.length) {
          const merged = [...selected, ...(Array.isArray(s?.homeTiles) ? s.homeTiles : [])];
          // dedupe
          const seen = new Set(); const out = [];
          for (const t of merged) { const u = (t.url||'').trim(); if (!u) continue; if (seen.has(u)) continue; seen.add(u); out.push(t); }
          next.homeTiles = out;
        }
        await window.electronAPI.updateSettings(next);
      }
    } catch (e) {}
    onClose && onClose();
  };

  return (
    <Backdrop role="dialog" aria-modal="true" aria-label="Welcome to Nebula">
        <Card ref={containerRef} tabIndex={-1}>
        <Left>
          <Title>Welcome to Nebula</Title>
          <Sub>Fast. Private. Delightful.</Sub>

          <Hero aria-hidden>
            <HeroSVG viewBox="0 0 200 100">
              <defs>
                <linearGradient id="g1" x1="0" x2="1"><stop offset="0" stopColor="#7ee7ff" /><stop offset="1" stopColor="#b39bff" /></linearGradient>
              </defs>
              <g transform="translate(0,10)">
                <rect x="6" y="18" width="188" height="64" rx="12" fill="url(#g1)" opacity="0.12" />
                <circle cx="48" cy="50" r="12" fill="#8a6bff" opacity="0.95" />
                <circle cx="96" cy="40" r="20" fill="#6ae0ff" opacity="0.95" />
                <circle cx="150" cy="50" r="10" fill="#b39bff" opacity="0.95" />
              </g>
            </HeroSVG>
          </Hero>

          <Steps aria-hidden>
            {[0,1,2].map(i => <StepDot key={i} active={i === step} done={i < step} aria-hidden />)}
          </Steps>

          {step === 0 && (
            <div>
              <h3 style={{margin:'8px 0 4px'}}>Privacy-first blocking</h3>
              <Sub>Block intrusive ads and popups across the web while preserving search suggestions and essential site features.</Sub>
              <div style={{marginTop:12}}>
                <label style={{display:'flex', alignItems:'center', gap:10}}>
                  <input aria-label="Enable ad blocking" type="checkbox" checked={enableAdblock} onChange={e => setEnableAdblock(e.target.checked)} />
                  <Small>Enable ad & popup blocking</Small>
                </label>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h3 style={{margin:'8px 0 4px'}}>Choose your look</h3>
              <Sub>Pick a comfortable theme and optionally import your bookmarks.</Sub>
              <div style={{display:'flex', gap:8, marginTop:10}}>
                <Ghost onClick={() => setTheme('light')} aria-pressed={theme==='light'}>Light</Ghost>
                <Ghost onClick={() => setTheme('system')} aria-pressed={theme==='system'}>System</Ghost>
                <Ghost onClick={() => setTheme('dark')} aria-pressed={theme==='dark'}>Dark</Ghost>
              </div>

                      <div style={{marginTop:12}}>
                        <div style={{fontSize:13, marginBottom:6}}>Import bookmarks</div>
                        <div style={{display:'flex', gap:10, alignItems:'center'}}>
                          <input ref={fileRef} type="file" accept="application/json" onChange={handleImport} style={{display:'none'}} />
                          <div style={{display:'flex', gap:8}}>
                            <button aria-label="Auto import" title="Auto detect and import" onClick={async ()=>{ try { if (window.electronAPI?.importBookmarksFromBrowser) { setImportStatus('Detecting browser and importing...'); const res = await window.electronAPI.importBookmarksFromBrowser('auto'); setImportStatus(res?.success ? `Imported (${res.count || 'n'})` : `Failed: ${res?.error||'unknown'}`); } else { if (fileRef.current) fileRef.current.click(); } } catch(e){ setImportStatus('Failed'); } }} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px', borderRadius:10, background:'linear-gradient(90deg,#ffffff08,#ffffff06)', border:'1px solid rgba(255,255,255,0.06)'}}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#7ee7ff" opacity="0.14"/><path d="M12 6v6l4 2" stroke="#b39bff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Auto
                            </button>
                            <button aria-label="Import from Chrome" title="Import from Chrome" onClick={async ()=>{ try { if (window.electronAPI?.importBookmarksFromBrowser) { setImportStatus('Importing from Chrome...'); const res = await window.electronAPI.importBookmarksFromBrowser('chrome'); setImportStatus(res?.success ? `Imported (${res.count||'n'})` : `Failed: ${res?.error||'unknown'}`); } else { if (fileRef.current) fileRef.current.click(); } } catch(e){ setImportStatus('Failed'); } }} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px', borderRadius:10, background:'linear-gradient(90deg,#ffffff08,#ffffff06)', border:'1px solid rgba(255,255,255,0.06)'}}>
                              {/* Chrome icon */}
                              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 12v0" fill="none"/><circle cx="12" cy="12" r="10" fill="#fff" opacity="0.02"/><path d="M21.6 12.6a9.9 9.9 0 0 0-.6-1.8H12v4.2h5.9c-.3 1-1 1.9-1.8 2.6L21.6 12.6z" fill="#fbbc05"/><path d="M6.5 18.3a9.9 9.9 0 0 0 5.6 1.7c2 0 3.9-.6 5.6-1.7l-3.9-3.1H6.5z" fill="#34a853"/><path d="M4.4 6.9A9.9 9.9 0 0 0 6.5 5.7l3.9 3.1H12V6.1A9.9 9.9 0 0 0 4.4 6.9z" fill="#ea4335"/></svg>
                              Chrome
                            </button>
                            <button aria-label="Import from Firefox" title="Import from Firefox" onClick={async ()=>{ try { if (window.electronAPI?.importBookmarksFromBrowser) { setImportStatus('Importing from Firefox...'); const res = await window.electronAPI.importBookmarksFromBrowser('firefox'); setImportStatus(res?.success ? `Imported (${res.count||'n'})` : `Failed: ${res?.error||'unknown'}`); } else { if (fileRef.current) fileRef.current.click(); } } catch(e){ setImportStatus('Failed'); } }} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px', borderRadius:10, background:'linear-gradient(90deg,#ffffff08,#ffffff06)', border:'1px solid rgba(255,255,255,0.06)'}}>
                              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.1 2 4.6 4.1 3 7.5c2.4-.6 4.8-.3 6.8.8 2 1.1 3.6 3 4.4 5.7 1.9-.5 3.6-1.8 4.2-3.6C19.9 6.3 16.2 2 12 2z" fill="#ff7139"/><path d="M5 14c1.1 2.4 3.4 4 6 4 2.6 0 4.9-1.6 6-4H5z" fill="#ffb86b"/></svg>
                              Firefox
                            </button>
                            <button aria-label="Import from Edge" title="Import from Edge" onClick={async ()=>{ try { if (window.electronAPI?.importBookmarksFromBrowser) { setImportStatus('Importing from Edge...'); const res = await window.electronAPI.importBookmarksFromBrowser('edge'); setImportStatus(res?.success ? `Imported (${res.count||'n'})` : `Failed: ${res?.error||'unknown'}`); } else { if (fileRef.current) fileRef.current.click(); } } catch(e){ setImportStatus('Failed'); } }} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px', borderRadius:10, background:'linear-gradient(90deg,#ffffff08,#ffffff06)', border:'1px solid rgba(255,255,255,0.06)'}}>
                              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8 2 4.7 4 3.4 7.7 6 7 8.3 7.9 10 10c1.6 2 2.3 4.8 2.3 7.5 1.9 0 3.8-.6 5.3-1.6-1-2.9-3.4-5.2-5.6-7.1-1.8-1.6-3.5-3.1-5-4.5C7.2 3.3 9.5 2 12 2z" fill="#0078d7"/></svg>
                              Edge
                            </button>
                            <button aria-label="Import from Safari" title="Import from Safari" onClick={async ()=>{ try { if (window.electronAPI?.importBookmarksFromBrowser) { setImportStatus('Importing from Safari...'); const res = await window.electronAPI.importBookmarksFromBrowser('safari'); setImportStatus(res?.success ? `Imported (${res.count||'n'})` : `Failed: ${res?.error||'unknown'}`); } else { if (fileRef.current) fileRef.current.click(); } } catch(e){ setImportStatus('Failed'); } }} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px', borderRadius:10, background:'linear-gradient(90deg,#ffffff08,#ffffff06)', border:'1px solid rgba(255,255,255,0.06)'}}>
                              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C7.6 2 4 5.6 4 10s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8z" fill="#6dd0ff"/><path d="M12 6c.9 0 1.7.7 1.7 1.6S12.9 9.2 12 9.2 10.3 8.5 10.3 7.6 11.1 6 12 6z" fill="#fff" opacity="0.9"/></svg>
                              Safari
                            </button>
                          </div>
                        </div>
                        <div style={{marginTop:6, fontSize:13}}>{importStatus}</div>
                      </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 style={{margin:'8px 0 4px'}}>Add suggested sites</h3>
              <Sub>Pick a few tiles to pin to your home page — you can always edit them later.</Sub>
              <TileGrid role="list">
                {SUGGESTED_SITES.map(s => (
                  <Tile role="listitem" key={s.url} onClick={() => toggle(s)} aria-pressed={!!selected.find(x=>x.url===s.url)}>
                    <TileFavicon aria-hidden>{(new URL(s.url)).hostname[0].toUpperCase()}</TileFavicon>
                    <TileInfo>
                      <div style={{fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{s.title}</div>
                      <Small>{s.url.replace(/^https?:\/\//,'')}</Small>
                    </TileInfo>
                    <DragHandle aria-hidden />
                  </Tile>
                ))}
              </TileGrid>
            </div>
          )}

          <Controls>
            {step > 0 ? <Ghost onClick={goBack}>Back</Ghost> : <div style={{width:86}} />}
            {step < total - 1 ? <PrimaryButton ref={primaryRef} onClick={goNext}>Next</PrimaryButton> : <PrimaryButton ref={primaryRef} onClick={finish}>Get started</PrimaryButton>}
            <Ghost onClick={() => { onClose && onClose(); }}>Skip</Ghost>
          </Controls>
        </Left>

        <Right aria-hidden>
          <div style={{fontSize:13, opacity:0.9, fontWeight:600}}>Tips for a great start</div>
          <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:8}}>
            <div style={{padding:10, borderRadius:10, background:'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005))'}}>Use the address bar to search or navigate quickly.</div>
            <div style={{padding:10, borderRadius:10, background:'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005))'}}>Right-click a tile to edit or remove it later.</div>
            <div style={{padding:10, borderRadius:10, background:'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005))'}}>Visit Settings to fine-tune privacy and appearance.</div>
          </div>
        </Right>
      </Card>
    </Backdrop>
  );
}
