import React, { useEffect, useState } from 'react';
import '../styles/SettingsPanel.css';

const SettingsPanel = ({ isOpen, onClose, onApply }) => {
  const [loading, setLoading] = useState(true);
  const [defaultSearchEngine, setDefaultSearchEngine] = useState('google');
  const [enableOnlineSuggestions, setEnableOnlineSuggestions] = useState(true);
  const [showBookmarksBarDefault, setShowBookmarksBarDefault] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [enableAdBlocker, setEnableAdBlocker] = useState(false);

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
      } catch {}
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [isOpen]);

  const handleSave = async () => {
  const payload = { defaultSearchEngine, enableOnlineSuggestions, showBookmarksBarDefault, reduceMotion, enableAdBlocker };
    try {
      const res = await window.electronAPI?.updateSettings?.(payload);
      if (res?.success) {
        onApply?.(res.settings || payload);
      }
    } catch {}
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {loading ? (
          <div className="settings-body">Loading…</div>
        ) : (
          <div className="settings-body">
            <div className="setting-item">
              <label className="setting-label">Default search engine</label>
              <select
                className="setting-input"
                value={defaultSearchEngine}
                onChange={(e) => setDefaultSearchEngine(e.target.value)}
              >
                <option value="google">Google</option>
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="brave">Brave</option>
              </select>
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
          </div>
        )}

        <div className="settings-footer">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
