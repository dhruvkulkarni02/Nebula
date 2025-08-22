import React, { useState, useEffect, useRef } from 'react';

const SUGGESTED_SITES = [
  {
    category: 'Search',
    sites: [
      { title: 'Google', url: 'https://www.google.com' },
      { title: 'Bing', url: 'https://www.bing.com' },
      { title: 'DuckDuckGo', url: 'https://duckduckgo.com' }
    ]
  },
  {
    category: 'News',
    sites: [
      { title: 'BBC', url: 'https://www.bbc.com' },
      { title: 'CNN', url: 'https://www.cnn.com' },
      { title: 'NYTimes', url: 'https://www.nytimes.com' }
    ]
  },
  {
    category: 'Sports',
    sites: [
      { title: 'ESPN', url: 'https://www.espn.com' },
      { title: 'Sky Sports', url: 'https://www.skysports.com' }
    ]
  },
  {
    category: 'Developer',
    sites: [
      { title: 'GitHub', url: 'https://github.com' },
      { title: 'Stack Overflow', url: 'https://stackoverflow.com' }
    ]
  }
];

export default function OnboardingModal({ onClose, onToggleAdblock, initialAdblockEnabled }) {
  const [enableAdblock, setEnableAdblock] = useState(!!initialAdblockEnabled);
  const [theme, setTheme] = useState('system');
  const [selectedTiles, setSelectedTiles] = useState([]);
  const [importStatus, setImportStatus] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    setEnableAdblock(!!initialAdblockEnabled);
    // Seed existing settings where available
    (async () => {
      try {
        if (window.electronAPI && typeof window.electronAPI.getSettings === 'function') {
          const s = await window.electronAPI.getSettings();
          if (s && s.theme) setTheme(s.theme);
        }
      } catch {}
    })();
  }, [initialAdblockEnabled]);

  const toggleTile = (url, title) => {
    const exists = selectedTiles.find(t => t.url === url);
    if (exists) setSelectedTiles(prev => prev.filter(t => t.url !== url));
    else setSelectedTiles(prev => [{ url, title, icon: (new URL(url)).origin + '/favicon.ico' }, ...prev]);
  };

  const handleImportFile = async (e) => {
    try {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const text = await f.text();
      const data = JSON.parse(text);
      setImportStatus('Importing...');
      if (window.electronAPI && typeof window.electronAPI.importBookmarksData === 'function') {
        const res = await window.electronAPI.importBookmarksData(data);
        if (res && res.success) setImportStatus('Bookmarks imported');
        else setImportStatus('Import failed');
      } else {
        setImportStatus('Import not available');
      }
    } catch (err) {
      setImportStatus('Import failed');
    } finally {
      // reset input so same file can be picked again if needed
      try { if (fileRef.current) fileRef.current.value = ''; } catch {}
    }
  };

  const handleFinish = async () => {
    try {
      if (window.electronAPI) {
        const s = (typeof window.electronAPI.getSettings === 'function') ? await window.electronAPI.getSettings() : {};
        const next = { ...(s || {}), onboardingSeen: true, adBlockEnabled: enableAdblock, theme };
        // Merge selected tiles into homeTiles (prepend)
        const existing = Array.isArray(s?.homeTiles) ? s.homeTiles : [];
        const dedup = (arr) => {
          const seen = new Set();
          const out = [];
          for (const t of arr) {
            const u = (t.url||'').trim(); if (!u) continue; if (seen.has(u)) continue; seen.add(u); out.push(t);
          }
          return out;
        };
        if (selectedTiles.length) {
          const merged = dedup([...selectedTiles, ...existing]);
          next.homeTiles = merged;
        }
        await window.electronAPI.updateSettings(next);
      }
    } catch (e) {}
    onClose && onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ width: 820, maxWidth: '96%', background: 'var(--panel)', borderRadius: 8, padding: 18, boxShadow: '0 8px 40px rgba(0,0,0,0.4)', color: 'var(--fg)' }}>
        <div style={{ display: 'flex', gap: 18 }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <h2 style={{ marginTop: 2 }}>Welcome to Nebula</h2>
            <p style={{ marginTop: 6 }}>We help block annoying ads and popups while keeping search suggestions working.</p>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={enableAdblock} onChange={(e) => setEnableAdblock(e.target.checked)} />
                Enable ad & popup blocking (recommended)
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Choose theme</div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 12 }}><input type="radio" name="nebula-theme" value="system" checked={theme==='system'} onChange={()=>setTheme('system')} /> System</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 12 }}><input type="radio" name="nebula-theme" value="light" checked={theme==='light'} onChange={()=>setTheme('light')} /> Light</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><input type="radio" name="nebula-theme" value="dark" checked={theme==='dark'} onChange={()=>setTheme('dark')} /> Dark</label>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Import bookmarks</div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input ref={fileRef} type="file" accept="application/json" onChange={handleImportFile} />
                <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--fg) 70%, transparent)' }}>{importStatus}</div>
              </div>
              <div style={{ marginTop:8, fontSize:12, color:'color-mix(in srgb, var(--fg) 60%, transparent)' }}>You can import exported bookmarks JSON from other browsers.</div>
            </div>
          </div>

          <div style={{ width: 360 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:600 }}>Suggested sites</div>
              <div style={{ fontSize:12, color:'color-mix(in srgb, var(--fg) 60%, transparent)' }}>Pick tiles to add to your home</div>
            </div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 420, overflow: 'auto' }}>
              {SUGGESTED_SITES.map(group => (
                <div key={group.category} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{group.category}</div>
                  {group.sites.map(s => {
                    const selected = !!selectedTiles.find(t => t.url === s.url);
                    return (
                      <div key={s.url} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleTile(s.url, s.title)} />
                        <div style={{ display:'flex', flexDirection:'column' }}>
                          <div style={{ fontSize:13 }}>{s.title}</div>
                          <div style={{ fontSize:11, color:'color-mix(in srgb, var(--fg) 60%, transparent)' }}>{s.url.replace(/^https?:\/\//,'')}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={() => { setEnableAdblock(false); onClose && onClose(); }} style={{ padding: '8px 12px' }}>Skip</button>
          <button onClick={handleFinish} style={{ padding: '8px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6 }}>Get started</button>
        </div>
      </div>
    </div>
  );
}
