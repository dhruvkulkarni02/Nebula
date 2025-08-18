import React, { useEffect, useState } from 'react';
import '../styles/SettingsPanel.css';

const SettingsPanel = ({ isOpen, onClose, onApply }) => {
  const [loading, setLoading] = useState(true);
  const [defaultSearchEngine, setDefaultSearchEngine] = useState('google');
  const [enableOnlineSuggestions, setEnableOnlineSuggestions] = useState(true);
  const [showBookmarksBarDefault, setShowBookmarksBarDefault] = useState(false);

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
      } catch {}
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [isOpen]);

  const handleSave = async () => {
    const payload = { defaultSearchEngine, enableOnlineSuggestions, showBookmarksBarDefault };
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
                  checked={showBookmarksBarDefault}
                  onChange={(e) => setShowBookmarksBarDefault(e.target.checked)}
                />
                Show bookmarks bar by default
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
