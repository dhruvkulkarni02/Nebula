import React, { useEffect, useState } from 'react';
import '../styles/SettingsPanel.css';

const SettingsPanel = ({ isOpen, onClose, onApply }) => {
  const [loading, setLoading] = useState(true);
  const [defaultSearchEngine, setDefaultSearchEngine] = useState('google');
  const [enableOnlineSuggestions, setEnableOnlineSuggestions] = useState(true);
  const [showBookmarksBarDefault, setShowBookmarksBarDefault] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [enableAdBlocker, setEnableAdBlocker] = useState(false);
  // Customization
  const [homeWallpaper, setHomeWallpaper] = useState('');
  const [navBarPosition, setNavBarPosition] = useState('top'); // top|bottom
  const [tabsLayout, setTabsLayout] = useState('top'); // top|vertical-left
  const [showButtons, setShowButtons] = useState({ bookmarks: true, history: true, downloads: true, find: true, private: true });
  const [theme, setTheme] = useState('system'); // light | dark | system
  const [homeTiles, setHomeTiles] = useState([]); // [{title,url,icon}]
  const [originalSettings, setOriginalSettings] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    (async () => {
      try {
        const s = (await window.electronAPI?.getSettings?.()) || {};
        if (!mounted) return;
        setDefaultSearchEngine(s.defaultSearchEngine || 'google');
        setEnableOnlineSuggestions(s.enableOnlineSuggestions !== false); // default true
        setShowBookmarksBarDefault(!!s.showBookmarksBarDefault);
        setReduceMotion(!!s.reduceMotion);
        setEnableAdBlocker(!!s.enableAdBlocker);
        setHomeWallpaper(s.homeWallpaper || '');
        setNavBarPosition(s.navBarPosition || 'top');
        setTabsLayout(s.tabsLayout || 'top');
        setTheme(s.theme || 'system');
        setHomeTiles(Array.isArray(s.homeTiles) ? s.homeTiles : []);
        setShowButtons({
          bookmarks: s?.toolbarButtons?.bookmarks !== false,
          history: s?.toolbarButtons?.history !== false,
          downloads: s?.toolbarButtons?.downloads !== false,
          find: s?.toolbarButtons?.find !== false,
          private: s?.toolbarButtons?.private !== false,
        });
        setOriginalSettings({
          defaultSearchEngine: s.defaultSearchEngine || 'google',
          enableOnlineSuggestions: s.enableOnlineSuggestions !== false,
          showBookmarksBarDefault: !!s.showBookmarksBarDefault,
          reduceMotion: !!s.reduceMotion,
          enableAdBlocker: !!s.enableAdBlocker,
          homeWallpaper: s.homeWallpaper || '',
          navBarPosition: s.navBarPosition || 'top',
          tabsLayout: s.tabsLayout || 'top',
          toolbarButtons: {
            bookmarks: s?.toolbarButtons?.bookmarks !== false,
            history: s?.toolbarButtons?.history !== false,
            downloads: s?.toolbarButtons?.downloads !== false,
            find: s?.toolbarButtons?.find !== false,
            private: s?.toolbarButtons?.private !== false,
          },
          theme: s.theme || 'system',
          homeTiles: Array.isArray(s.homeTiles) ? JSON.parse(JSON.stringify(s.homeTiles)) : [],
        });
      } catch {}
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [isOpen]);

  const handleSave = async () => {
    const payload = { defaultSearchEngine, enableOnlineSuggestions, showBookmarksBarDefault, reduceMotion, enableAdBlocker, homeWallpaper, navBarPosition, tabsLayout, toolbarButtons: showButtons, theme, homeTiles };
    try {
      const res = await window.electronAPI?.updateSettings?.(payload);
      if (res?.success) {
        onApply?.(res.settings || payload);
        setOriginalSettings({ ...payload, homeTiles: JSON.parse(JSON.stringify(homeTiles)) });
      }
    } catch {}
    onClose?.();
  };

  // Compare current state to originalSettings
  const hasUnsavedChanges = () => {
    if (!originalSettings) return false;
    const curr = { defaultSearchEngine, enableOnlineSuggestions, showBookmarksBarDefault, reduceMotion, enableAdBlocker, homeWallpaper, navBarPosition, tabsLayout, toolbarButtons: showButtons, theme, homeTiles };
    // Deep compare
    return JSON.stringify(curr) !== JSON.stringify(originalSettings);
  };

  const handleRequestClose = (e) => {
    if (hasUnsavedChanges()) {
      setShowConfirm(true);
    } else {
      onClose?.();
    }
    if (e) e.stopPropagation();
  };


  if (!isOpen) return null;

  return (
  <div className="settings-overlay" onMouseDown={handleRequestClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={handleRequestClose}>✕</button>
        </div>
        {loading ? (
          <div className="settings-body">Loading…</div>
        ) : (
          <div className="settings-body">
            <div className="setting-item">
              <label className="setting-label">Default search engine</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label className={`engine-option ${defaultSearchEngine === 'google' ? 'active' : ''}`} onClick={() => setDefaultSearchEngine('google')}>
                  <div className="engine-icon">G</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Google</div>
                    <div className="hint">Fast, relevant results</div>
                  </div>
                </label>
                <label className={`engine-option ${defaultSearchEngine === 'duckduckgo' ? 'active' : ''}`} onClick={() => setDefaultSearchEngine('duckduckgo')}>
                  <div className="engine-icon">🦆</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>DuckDuckGo</div>
                    <div className="hint">Privacy-first suggestions</div>
                  </div>
                </label>
                <label className={`engine-option ${defaultSearchEngine === 'brave' ? 'active' : ''}`} onClick={() => setDefaultSearchEngine('brave')}>
                  <div className="engine-icon">🦁</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Brave</div>
                    <div className="hint">Private &amp; independent</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="setting-item">
              <label className="setting-check">
                <input
                  type="checkbox"
                  checked={enableOnlineSuggestions}
                  onChange={(e) => setEnableOnlineSuggestions(e.target.checked)}
                />
                Enable online query suggestions
              </label>
            </div>

              <div className="setting-item">
                <label className="setting-check">
                  <input
                    type="checkbox"
                    checked={enableAdBlocker}
                    onChange={(e) => setEnableAdBlocker(e.target.checked)}
                  />
                  Enable ad & tracker blocking (beta)
                </label>
              </div>

            <div className="setting-item">
              <label className="setting-check">
                <input
                  type="checkbox"
                  checked={showBookmarksBarDefault}
                  onChange={(e) => setShowBookmarksBarDefault(e.target.checked)}
                />
                Show bookmarks bar by default
              </label>
            </div>

            <div className="setting-item">
              <label className="setting-check">
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setReduceMotion(next);
                    try { document.documentElement.setAttribute('data-reduce-motion', next ? 'true' : 'false'); } catch {}
                  }}
                />
                Reduce motion (fewer animations)
              </label>
            </div>

            <hr />
            <div className="setting-item">
              <label className="setting-label">Theme</label>
              <select className="setting-input" value={theme} onChange={(e)=>setTheme(e.target.value)}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="setting-item">
              <label className="setting-label">Home wallpaper URL</label>
              <input className="setting-input" placeholder="https://example.com/wallpaper.jpg" value={homeWallpaper} onChange={(e)=>setHomeWallpaper(e.target.value)} />
              <div className="hint">Leave empty for plain background</div>
            </div>

            <div className="setting-item">
              <label className="setting-label">Navigation bar position</label>
              <select className="setting-input" value={navBarPosition} onChange={(e)=>setNavBarPosition(e.target.value)}>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>

            <div className="setting-item">
              <label className="setting-label">Tabs layout</label>
              <select className="setting-input" value={tabsLayout} onChange={(e)=>setTabsLayout(e.target.value)}>
                <option value="top">Top (horizontal)</option>
                <option value="vertical-left">Left (vertical)</option>
              </select>
            </div>

            <div className="setting-item">
              <div className="setting-label">Toolbar buttons</div>
              {['bookmarks','history','downloads','find','private'].map(key => (
                <label key={key} className="setting-check">
                  <input type="checkbox" checked={!!showButtons[key]} onChange={(e)=> setShowButtons(prev=>({ ...prev, [key]: e.target.checked }))} /> Show {key}
                </label>
              ))}
            </div>

            <hr />
            <div className="setting-item">
              <div className="setting-label">Home page tiles</div>
              <div className="hint">Add quick links to show on the home page.</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {homeTiles.map((t, idx) => (
                  <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 2fr 1fr auto', gap:6, alignItems:'center' }}>
                    <input className="setting-input" placeholder="Title" value={t.title||''} onChange={(e)=> setHomeTiles(prev=> prev.map((x,i)=> i===idx?{...x,title:e.target.value}:x))} />
                    <input className="setting-input" placeholder="https://site.com" value={t.url||''} onChange={(e)=> setHomeTiles(prev=> prev.map((x,i)=> i===idx?{...x,url:e.target.value}:x))} />
                    <input className="setting-input" placeholder="Icon URL (optional)" value={t.icon||''} onChange={(e)=> setHomeTiles(prev=> prev.map((x,i)=> i===idx?{...x,icon:e.target.value}:x))} />
                    <button className="btn secondary" onClick={()=> setHomeTiles(prev=> prev.filter((_,i)=> i!==idx))}>Remove</button>
                  </div>
                ))}
                <div>
                  <button className="btn" onClick={()=> setHomeTiles(prev=> [...prev, { title:'', url:'', icon:'' }])}>Add tile</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="settings-footer">
          <button className="btn secondary" onClick={handleRequestClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Save</button>
        </div>
        {showConfirm && (
          <div className="settings-confirm-overlay">
            <div className="settings-confirm-modal">
              <div style={{marginBottom:12}}>You have unsaved changes. Exit without saving?</div>
              <div style={{display:'flex',gap:12,justifyContent:'flex-end'}}>
                <button className="btn secondary" onClick={()=>setShowConfirm(false)}>Stay</button>
                <button className="btn danger" onClick={()=>{ setShowConfirm(false); onClose?.(); }}>Exit without saving</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPanel;
