import React, { useEffect, useState } from 'react';
import '../styles/SettingsPanel.css';

const Section = ({ title, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <h4 style={{ margin: '16px 0 8px 0' }}>{title}</h4>
    {children}
  </div>
);

export default function SettingsWindow() {
  const [tab, setTab] = useState('appearance');
  const [settings, setSettings] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const s = await window.electronAPI?.getSettings?.();
        setSettings(s || {});
      } catch {}
    })();
  }, []);

  // reflect theme locally too
  useEffect(() => {
    try {
      const theme = settings?.theme;
      const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
      if (!theme || theme === 'system') {
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        applyTheme(mql && mql.matches ? 'dark' : 'light');
      } else {
        applyTheme(theme);
      }
      if (settings?.accentColor) document.documentElement.style.setProperty('--accent', settings.accentColor);
    } catch {}
  }, [settings?.theme, settings?.accentColor]);

  // live updates from other windows
  useEffect(() => {
    const handler = (_e, data) => setSettings(data || {});
    window.electronAPI?.onSettingsUpdated?.(handler);
    return () => window.electronAPI?.removeSettingsUpdatedListener?.(handler);
  }, []);

  const apply = async (patch) => {
    const next = { ...(settings || {}), ...(patch || {}) };
    setSettings(next);
    try { await window.electronAPI?.updateSettings?.(next); } catch {}
  };

  return (
    <div className="settings-overlay" style={{ position: 'relative', inset: 'auto', background: 'transparent', alignItems: 'stretch' }}>
      <div className="settings-modal" style={{ width: 740, height: 520, display: 'grid', gridTemplateColumns: '200px 1fr' }}>
        <div className="settings-header" style={{ gridColumn: '1 / -1', display: 'none' }}>
          <h2>Settings</h2>
        </div>
        <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--panel)', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { id: 'appearance', label: 'Appearance' },
            { id: 'homepage', label: 'Home' },
            { id: 'layout', label: 'Layout' },
            { id: 'privacy', label: 'Privacy' },
            { id: 'downloads', label: 'Downloads' },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: tab === t.id ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                color: 'var(--fg)',
                cursor: 'pointer'
              }}>{t.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => window.close?.()} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Close</button>
        </aside>
        <main style={{ padding: 16, overflow: 'auto', background: 'var(--bg)' }}>
          {tab === 'appearance' && (
            <div>
              <Section title="Theme">
                <div style={{ display: 'flex', gap: 8 }}>
                  {['light','dark','system'].map((t) => (
                    <label key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
                      <input type="radio" name="theme" checked={(settings.theme||'system')===t} onChange={() => apply({ theme: t })} />
                      <span style={{ textTransform: 'capitalize' }}>{t}</span>
                    </label>
                  ))}
                </div>
              </Section>
              <Section title="Accent Color (preview-only)">
                <input type="color" value={settings.accentColor || '#60a5fa'} onChange={(e) => apply({ accentColor: e.target.value })} />
              </Section>
            </div>
          )}

          {tab === 'homepage' && (
            <div>
              <Section title="Wallpaper URL">
                <input style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel)', color: 'var(--fg)' }}
                       placeholder="https://…" value={settings.homeWallpaper || ''}
                       onChange={(e)=>apply({ homeWallpaper: e.target.value })} />
              </Section>
              <Section title="Home Tiles">
                <button onClick={() => apply({ homeTiles: [...(settings.homeTiles||[]), { title: 'New', url: 'https://', icon: '' }] })}>Add Tile</button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  {(settings.homeTiles||[]).map((tile, i) => (
                    <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--panel)', display: 'grid', gap: 6 }}>
                      <input placeholder="Title" value={tile.title||''} onChange={(e)=>{
                        const arr=[...(settings.homeTiles||[])]; arr[i]={...arr[i], title:e.target.value}; apply({ homeTiles: arr });
                      }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color:'var(--fg)' }} />
                      <input placeholder="URL" value={tile.url||''} onChange={(e)=>{
                        const arr=[...(settings.homeTiles||[])]; arr[i]={...arr[i], url:e.target.value}; apply({ homeTiles: arr });
                      }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color:'var(--fg)' }} />
                      <input placeholder="Icon URL (optional)" value={tile.icon||''} onChange={(e)=>{
                        const arr=[...(settings.homeTiles||[])]; arr[i]={...arr[i], icon:e.target.value}; apply({ homeTiles: arr });
                      }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color:'var(--fg)' }} />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={()=>{
                          const arr=[...(settings.homeTiles||[])]; arr.splice(i,1); apply({ homeTiles: arr });
                        }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {tab === 'layout' && (
            <div>
              <Section title="Navigation Bar Position">
                <select value={settings.navBarPosition || 'top'} onChange={(e)=>apply({ navBarPosition: e.target.value })}
                        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel)', color: 'var(--fg)' }}>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </Section>
              <Section title="Tabs Layout">
                <select value={settings.tabsLayout || 'top'} onChange={(e)=>apply({ tabsLayout: e.target.value })}
                        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel)', color: 'var(--fg)' }}>
                  <option value="top">Top</option>
                  <option value="vertical-left">Vertical Left</option>
                </select>
              </Section>
              <Section title="Toolbar Buttons">
                {['bookmarks','history','downloads','find','private'].map((k) => (
                  <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 10 }}>
                    <input type="checkbox" checked={(settings.toolbarButtons||{})[k] !== false}
                      onChange={(e)=>apply({ toolbarButtons: { ...(settings.toolbarButtons||{}), [k]: e.target.checked } })} />
                    <span style={{ textTransform: 'capitalize' }}>{k}</span>
                  </label>
                ))}
              </Section>
            </div>
          )}

          {tab === 'privacy' && (
            <div>
              <Section title="Ad/Tracker Blocking">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={!!settings.enableAdBlocker} onChange={(e)=>apply({ enableAdBlocker: e.target.checked })} />
                  Enabled
                </label>
              </Section>
              <Section title="Allowlist (comma-separated hosts)">
                <textarea rows={3} value={(settings.adBlockAllowlist||[]).join(', ')} onChange={(e)=>{
                  const list=(e.target.value||'').split(',').map(s=>s.trim()).filter(Boolean); apply({ adBlockAllowlist: list });
                }} style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius: 8, background:'var(--panel)', color:'var(--fg)' }} />
              </Section>
            </div>
          )}

          {tab === 'downloads' && (
            <div>
              <Section title="Clear Downloads">
                <button onClick={()=>window.electronAPI?.clearDownloads?.()}>Clear List</button>
              </Section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
