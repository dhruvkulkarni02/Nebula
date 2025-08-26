import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';

const Overlay = styled.div`
  position: fixed;
        <Left style={{ position: 'relative', minHeight: 340 }}>
          {/* Step indicator at top right */}
          <div style={{ position: 'absolute', top: 0, right: 0, fontSize: 13, color: '#a6c8ee', fontWeight: 500 }}>
            {step + 1} / 6
          </div>
          <StepTitle>{steps[step].title}</StepTitle>
          <StepDesc>{steps[step].desc}</StepDesc>

          {/* Example settings section with Save button */}
          {step === 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: '#95bde8', marginBottom: 8 }}>Privacy</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <BrowserButton onClick={() => { setAdblock(true); try { window.electronAPI?.updateSettings?.({ adBlockEnabled: true }); } catch {} }}>Enable ad blocking</BrowserButton>
                <Ghost onClick={() => { setAdblock(false); try { window.electronAPI?.updateSettings?.({ adBlockEnabled: false }); } catch {} }}>Turn off</Ghost>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#9fbfe9' }}>Ad blocking is on: {adblock ? 'Yes' : 'No'}</div>
              <div style={{ marginTop: 16 }}>
                <Btn onClick={() => { window.electronAPI?.updateSettings?.({ adBlockEnabled: adblock }); }}>Save</Btn>
              </div>
            </div>
          )}

          {/* Layout selection step (replace dropdown with two buttons) */}
          {step === 3 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: '#95bde8', marginBottom: 8 }}>Layout</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => {/* set layout to option 1 */}}>Option 1</Btn>
                <Btn onClick={() => {/* set layout to option 2 */}}>Option 2</Btn>
              </div>
            </div>
          )}

          {/* Navigation controls at bottom */}
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 8px 8px' }}>
            <Ghost onClick={() => { try { const s = { onboardingSeen: true }; window.electronAPI?.updateSettings?.(s); } catch {}; onClose(); }}>Skip</Ghost>
            <div style={{ display: 'flex', gap: 8 }}>
              <Ghost onClick={() => { if (step === 0) { try { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); } catch {} onClose(); } else back(); }}>{step === 0 ? 'Close' : 'Back'}</Ghost>
              <Btn onClick={() => { if (step === steps.length - 1) { try { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); } catch {} onClose(); } else next(); }}>{step === steps.length - 1 ? 'Done' : 'Next'}</Btn>
            </div>
          </div>
        </Left>
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Right = styled.div`
  flex: 1;
  min-height: 320px;
  display: flex;
  flex-direction: column;
`;

const StepTitle = styled.h2`
  margin: 0 0 6px 0;
  font-size: 20px;
  color: #fff;
`;

const StepDesc = styled.p`
  margin: 0 0 14px 0;
  color: #bcd3ee;
  font-size: 13px;
`;

const Btn = styled.button`
  border: none;
  padding: 10px 12px;
  border-radius: 10px;
  background: #0ea5e9;
  color: white;
  cursor: pointer;
  font-weight: 600;
`;

const Ghost = styled.button`
  border: 1px solid rgba(255,255,255,0.08);
  background: transparent;
  color: #dbeafe;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
`;

const BrowserRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const BrowserButton = styled.button`
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  color: #e6eef8;
  cursor: pointer;
`;

const SuggestionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
`;

const Suggestion = styled.button`
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04);
  padding: 12px;
  border-radius: 10px;
  color: #e6eef8;
  text-align: left;
  cursor: pointer;
`;

const steps = [
  { id: 0, title: 'Welcome to Nebula', desc: 'A fast, private browser. A few setup steps and you’ll be ready.' },
  { id: 1, title: 'Import bookmarks', desc: 'Bring your bookmarks from another browser or a file.' },
  { id: 2, title: 'Suggested tiles', desc: 'Add quick tiles to your homepage for instant access.' }
];

export default function OnboardingFlow({ initialAdblockEnabled = true, onClose = () => {} }) {
  const [step, setStep] = useState(() => {
    try { const h = (location.hash || '').replace('#/onboarding/step/', ''); const n = Number(h); return isNaN(n) ? 0 : n; } catch { return 0; }
  });
  const [adblock, setAdblock] = useState(!!initialAdblockEnabled);
  const [importStatus, setImportStatus] = useState(null);

  useEffect(() => { try { location.hash = `#/onboarding/step/${step}`; } catch {} }, [step]);

  const next = () => setStep(s => Math.min(steps.length - 1, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  const autoImport = async () => {
    setImportStatus('scanning');
    try {
      const res = await window.electronAPI?.importBookmarksFromBrowser?.('auto');
      setImportStatus(res?.success ? `imported:${res.count||0}` : 'failed');
    } catch (err) { setImportStatus('failed'); }
  };

  const addSuggestion = async (url) => {
    try {
      await window.electronAPI?.addBookmark?.({ url, title: '', note: '', tags: [] });
    } catch {}
  };

  return (
    <Overlay role="dialog" aria-modal="true" aria-label="Nebula first run onboarding">
      <Card
        initial={{ opacity: 0, y: 12, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.35 }}
      >
        <Left>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: '#a6c8ee' }}>Step {step + 1} of {steps.length}</div>
              <StepTitle>{steps[step].title}</StepTitle>
            </div>
            <div>
              <Ghost onClick={() => { try { const s = { onboardingSeen: true }; window.electronAPI?.updateSettings?.(s); } catch {}; onClose(); }}>Skip</Ghost>
            </div>
          </div>
          <StepDesc>{steps[step].desc}</StepDesc>

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <Btn onClick={() => { if (step === steps.length - 1) { try { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); } catch {} onClose(); } else next(); }}>{step === steps.length - 1 ? 'Done' : 'Next'}</Btn>
            <Ghost onClick={() => { if (step === 0) { try { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); } catch {} onClose(); } else back(); }}>{step === 0 ? 'Close' : 'Back'}</Ghost>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#95bde8', marginBottom: 8 }}>Privacy</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <BrowserButton onClick={() => { setAdblock(true); try { window.electronAPI?.updateSettings?.({ adBlockEnabled: true }); } catch {} }}>Enable ad blocking</BrowserButton>
              <Ghost onClick={() => { setAdblock(false); try { window.electronAPI?.updateSettings?.({ adBlockEnabled: false }); } catch {} }}>Turn off</Ghost>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#9fbfe9' }}>Ad blocking is on: {adblock ? 'Yes' : 'No'}</div>
          </div>
        </Left>

        <Right>
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ flex: 1 }}>
            {step === 0 && (
              <div>
                <h3 style={{ marginTop: 0, color: '#fff' }}>Quick tour</h3>
                <p style={{ color: '#cfe6ff' }}>Nebula blocks unwanted ads and popups while preserving useful features like search suggestions. You can change these later in Settings.</p>
                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <Ghost onClick={() => { window.electronAPI?.openSettingsWindow?.(); }}>Open Settings</Ghost>
                  <Btn onClick={() => next()}>Get started</Btn>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h3 style={{ marginTop: 0, color: '#fff' }}>Import bookmarks</h3>
                <p style={{ color: '#cfe6ff' }}>Automatically import bookmarks from installed browsers or choose a JSON file.</p>
                <BrowserRow style={{ marginTop: 10 }}>
                  <BrowserButton onClick={() => window.electronAPI?.importBookmarksFromBrowser?.('chrome')}>📘 Chrome</BrowserButton>
                  <BrowserButton onClick={() => window.electronAPI?.importBookmarksFromBrowser?.('edge')}>🧭 Edge</BrowserButton>
                  <BrowserButton onClick={() => window.electronAPI?.importBookmarksFromBrowser?.('firefox')}>🦊 Firefox</BrowserButton>
                  <BrowserButton onClick={() => window.electronAPI?.importBookmarksFromBrowser?.('safari')}>🍎 Safari</BrowserButton>
                  <BrowserButton onClick={autoImport}>🪄 Auto detect</BrowserButton>
                </BrowserRow>
                <div style={{ marginTop: 12 }}>
                  <input id="onboard-import-file" type="file" accept="application/json" style={{ display: 'none' }} onChange={async (e) => {
                    const f = e.target.files && e.target.files[0]; if (!f) return; try { const text = await f.text(); const data = JSON.parse(text); await window.electronAPI?.importBookmarksData?.(data); setImportStatus('file-imported'); } catch { setImportStatus('failed'); } e.target.value='';
                  }} />
                  <Ghost onClick={() => document.getElementById('onboard-import-file')?.click()}>Choose file…</Ghost>
                  <div style={{ marginTop: 10, color: '#b7d5f6' }}>Status: {importStatus || 'idle'}</div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h3 style={{ marginTop: 0, color: '#fff' }}>Suggested tiles</h3>
                <p style={{ color: '#cfe6ff' }}>Add quick links to your home screen for faster access.</p>
                <SuggestionsGrid style={{ marginTop: 12 }}>
                  {['https://news.ycombinator.com', 'https://github.com', 'https://mozilla.org', 'https://duckduckgo.com'].map((u) => (
                    <Suggestion key={u} onClick={() => addSuggestion(u)}>{u}</Suggestion>
                  ))}
                </SuggestionsGrid>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <Btn onClick={() => { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); onClose(); }}>Finish setup</Btn>
                  <Ghost onClick={() => { window.electronAPI?.updateSettings?.({ onboardingSeen: true }); onClose(); }}>Skip</Ghost>
                </div>
              </div>
            )}
          </motion.div>
        </Right>
      </Card>
    </Overlay>
  );
}
