import React, { useState, useEffect, useMemo, useRef } from 'react';
import '../styles/NavigationBar.css';

const NavigationBar = ({
  currentUrl,
  isLoading,
  canGoBack,
  canGoForward,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
  onShowBookmarks,
  onShowHistory,
  onOpenFind,
  onShowDownloads,
  onOpenSettings,
  settings: settingsProp,
}) => {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dataCache, setDataCache] = useState({ bookmarks: [], history: [] });
  const [querySuggestions, setQuerySuggestions] = useState([]);
  const [blockedCount, setBlockedCount] = useState(0);
  const [siteProtection, setSiteProtection] = useState(true);
  const [showShieldMenu, setShowShieldMenu] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showPageInfo, setShowPageInfo] = useState(false);
  const [sitePerms, setSitePerms] = useState({});

  const inputRef = useRef(null);
  const suggestBoxRef = useRef(null);
  const shieldMenuRef = useRef(null);
  const pageInfoRef = useRef(null);
  const requestSeqRef = useRef(0);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Sync input with currentUrl and check bookmark status
  useEffect(() => {
    if (currentUrl && currentUrl !== 'about:blank') {
      setUrlInput(currentUrl);
      checkIfBookmarked(currentUrl);
    } else {
      setUrlInput('');
      setIsBookmarked(false);
    }
    // Reset adblock stats display on navigation
    try { window.electronAPI?.resetAdblockStats?.().then((s) => setBlockedCount(s?.blocked || 0)); } catch {}
    // Clear any open suggestion popups on navigation change
    setSuggestions([]);
    setHighlightIndex(-1);
    setIsInputFocused(false);
    // If user is focused in the address bar, keep caret at end when URL updates
    setTimeout(() => {
      const el = inputRef.current;
      if (el && document.activeElement === el) {
        try {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        } catch {}
      }
    }, 0);
  }, [currentUrl]);

  // Poll adblock stats while focused/typing to keep badge fresh
  useEffect(() => {
    let mount = true;
    const tick = async () => {
      try {
        const s = await window.electronAPI?.getAdblockStats?.();
        if (mount && s) setBlockedCount(s.blocked || 0);
      } catch {}
    };
    const id = setInterval(tick, 1500);
    tick();
    return () => { mount = false; clearInterval(id); };
  }, []);

  // Global focus (Cmd/Ctrl+L)
  useEffect(() => {
    const handler = () => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    };
    window.addEventListener('focus-address-bar', handler);
    return () => window.removeEventListener('focus-address-bar', handler);
  }, []);

  // Preload bookmarks + history
  useEffect(() => {
    // Determine private window once at mount
    try { setIsPrivate(!!window.electronAPI?.isPrivateWindow?.()); } catch {}
    const load = async () => {
      try {
        const [bookmarks, history] = await Promise.all([
          window.electronAPI?.getBookmarks?.() || [],
          window.electronAPI?.getHistory?.() || [],
        ]);
        setDataCache({ bookmarks: bookmarks || [], history: history || [] });
      } catch {
        // ignore
      }
    };
    load();
  }, []);

  // Build search URL (align with submit behavior and settings)
  const [settings, setSettings] = useState(settingsProp || {});
  useEffect(() => { setSettings(settingsProp || {}); }, [settingsProp]);
  const buildSearchUrl = (q) => {
    const engine = (settings.defaultSearchEngine || 'google').toLowerCase();
    if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
    if (engine === 'brave') return `https://search.brave.com/search?q=${encodeURIComponent(q)}`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  };

  const currentEngine = (settings.defaultSearchEngine || 'google').toLowerCase();
  const engineBadge = currentEngine === 'duckduckgo' ? '🦆' : currentEngine === 'brave' ? '🦁' : 'G';

  // Flatten local sources
  const allSources = useMemo(() => {
    const b = (dataCache.bookmarks || []).map((x) => ({
      url: x.url,
      title: x.title || x.url,
      source: 'bookmark',
      score: 2,
    }));
    const h = (dataCache.history || []).map((x) => ({
      url: x.url,
      title: x.title || x.url,
      source: 'history',
      score: 1,
      time: x.visitTime ? new Date(x.visitTime).getTime() : 0,
    }));
    return [...b, ...h];
  }, [dataCache]);

  // Local suggestion computer
  const computeLocalSuggestions = useMemo(() => {
    return (qRaw) => {
      const q = (qRaw || '').trim().toLowerCase();
      if (!q) return [];
      const results = allSources
        .map((item) => {
          const t = (item.title || '').toLowerCase();
          const u = (item.url || '').toLowerCase();
          let s = item.score;
          if (t.startsWith(q) || u.startsWith(q)) s += 10;
          else if (t.includes(q) || u.includes(q)) s += 5;
          return { ...item, _s: s };
        })
        .filter((x) => x._s > 1)
        .sort((a, b) => (b._s - a._s) || (b.time || 0) - (a.time || 0));
      const seen = new Set();
      const uniq = [];
      for (const r of results) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        uniq.push(r);
        if (uniq.length >= 8) break;
      }
      return uniq;
    };
  }, [allSources]);

  // Online query suggestions (engine-specific) via IPC (CORS-safe) with debounce
  useEffect(() => {
    const q = (urlInput || '').trim();
    setHighlightIndex(-1);

    const looksLikeUrl = /^(https?:\/\/)/i.test(q) || (q.includes('.') && !q.includes(' '));
    const onlineEnabled = settings.enableOnlineSuggestions !== false; // default true
    if (!q || looksLikeUrl || !isInputFocused || !onlineEnabled) {
      setQuerySuggestions([]);
      return;
    }
    const seq = ++requestSeqRef.current;
    const handle = setTimeout(async () => {
      try {
        const engine = (settings.defaultSearchEngine || 'google').toLowerCase();
        const phrases = (await window.electronAPI?.getSuggestions?.(q, engine)) || [];
        if (seq !== requestSeqRef.current) return; // stale
        const out = [];
        const seen = new Set();
        for (const p of phrases) {
          const phrase = String(p || '').trim();
          if (!phrase || seen.has(phrase)) continue;
          seen.add(phrase);
          out.push({
            title: phrase,
            url: buildSearchUrl(phrase),
            source: 'query',
            score: 100 + (phrase.toLowerCase().startsWith(q.toLowerCase()) ? 5 : 0),
          });
          if (out.length >= 8) break;
        }
        if (seq === requestSeqRef.current) setQuerySuggestions(out);
      } catch (e) {
        setQuerySuggestions([]);
      }
    }, 150);

    return () => {
      clearTimeout(handle);
    };
  }, [urlInput, isInputFocused, settings]);

  // Compose final suggestions (Chrome-like): primary "Search <engine> for ...", then query suggestions, then local
  useEffect(() => {
    const q = (urlInput || '').trim();
    const local = computeLocalSuggestions(q);
    const out = [];
    if (q) {
      out.push({
        title: `Search ${currentEngine === 'duckduckgo' ? 'DuckDuckGo' : currentEngine === 'brave' ? 'Brave' : 'Google'} for “${q}”`,
        url: buildSearchUrl(q),
        source: 'engine-search',
        query: q,
        score: 200,
      });
    }
    const seenKey = new Set();
    const pushUnique = (item) => {
      const key = `${item.source}:${item.title || item.url}`;
      if (seenKey.has(key)) return;
      seenKey.add(key);
      out.push(item);
    };
    querySuggestions.forEach(pushUnique);
    local.forEach(pushUnique);
    // Only show suggestions when the input is focused or user is typing
    setSuggestions(isInputFocused ? out.slice(0, 8) : []);
  }, [urlInput, computeLocalSuggestions, querySuggestions, isInputFocused, currentEngine]);

  // Keep siteProtection in sync with settings allowlist for current host
  useEffect(() => {
    (async () => {
      try {
        const host = (() => { try { return new URL(currentUrl).hostname; } catch { return ''; } })();
        if (!host) { setSiteProtection(true); return; }
        const s = await window.electronAPI?.getSettings?.();
        const list = (s?.adBlockAllowlist || []).map(x => String(x || '').toLowerCase());
        setSiteProtection(!list.includes(host.toLowerCase()));
      } catch {
        setSiteProtection(true);
      }
    })();
  }, [currentUrl]);

  // Load site permissions for current origin (when opening page info or URL changes)
  useEffect(() => {
    (async () => {
      try {
        const origin = (() => { try { return new URL(currentUrl).origin; } catch { return ''; } })();
        if (!origin) { setSitePerms({}); return; }
        const res = await window.electronAPI?.getSitePermissions?.(origin);
        setSitePerms(res?.permissions || {});
      } catch { setSitePerms({}); }
    })();
  }, [currentUrl, showPageInfo]);

  // Close popovers on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      const box = suggestBoxRef.current;
      const input = inputRef.current;
      const menu = shieldMenuRef.current;
      const info = pageInfoRef.current;
      if (box && box.contains(e.target)) return;
      if (menu && menu.contains(e.target)) return;
      if (info && info.contains(e.target)) return;
      if (input && input.contains && input.contains(e.target)) return;
      setSuggestions([]);
      setHighlightIndex(-1);
      setShowShieldMenu(false);
      setShowPageInfo(false);
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, []);

  const togglePermission = async (perm) => {
    try {
      const origin = (() => { try { return new URL(currentUrl).origin; } catch { return ''; } })();
      if (!origin) return;
      const next = !sitePerms?.[perm];
      await window.electronAPI?.setSitePermission?.(origin, perm, next);
      setSitePerms(p => ({ ...(p || {}), [perm]: next }));
    } catch {}
  };

  const checkIfBookmarked = async (url) => {
    try {
      if (window.electronAPI && url && url !== 'about:blank') {
        const bookmarks = await window.electronAPI.getBookmarks();
        const found = (bookmarks || []).some((b) => b.url === url);
        setIsBookmarked(found);
      }
    } catch (err) {
      console.error('Failed to check bookmark status:', err);
    }
  };

  const handleBookmarkToggle = async () => {
    try {
      if (window.electronAPI && currentUrl && currentUrl !== 'about:blank') {
        if (isBookmarked) {
          await window.electronAPI.removeBookmark(currentUrl);
          setIsBookmarked(false);
        } else {
          const title = document.title || new URL(currentUrl).hostname;
          await window.electronAPI.addBookmark(currentUrl, title);
          setIsBookmarked(true);
        }
      }
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    let text = (urlInput || '').trim();
    if (!text) return;
    // If a suggestion is highlighted, prefer it
    if (highlightIndex >= 0 && suggestions[highlightIndex]) {
      const chosen = suggestions[highlightIndex];
      const target = chosen.source === 'query' ? buildSearchUrl(chosen.title) : chosen.url;
      onNavigate(target);
      setUrlInput(chosen.source === 'query' ? chosen.title : chosen.url);
    } else {
      // Format as URL or search
      if (!/^https?:\/\//i.test(text)) {
        if (text.includes('.') && !text.includes(' ')) text = 'https://' + text;
        else text = buildSearchUrl(text);
      }
      onNavigate(text);
      setUrlInput(text);
    }
    setSuggestions([]);
    setHighlightIndex(-1);
  };

  const handleHomeClick = () => {
    const homeUrl = 'about:blank';
    onNavigate(homeUrl);
    setUrlInput('');
    setSuggestions([]);
    setHighlightIndex(-1);
  };

  return (
    <div className="navigation-bar">
      <div className="nav-buttons">
        <button className="nav-button" onClick={onGoBack} disabled={!canGoBack} title="Go back">⬅️</button>
        <button className="nav-button" onClick={onGoForward} disabled={!canGoForward} title="Go forward">➡️</button>
        {isLoading ? (
          <button className="stop-button" onClick={onStop} title="Stop loading">⛔</button>
        ) : (
          <button className="reload-button" onClick={onReload} title="Reload">🔄</button>
        )}
        <button className="nav-button" onClick={handleHomeClick} title="Home">🏠</button>
      </div>

      <form
        className="address-bar"
        onSubmit={handleUrlSubmit}
        onKeyDown={(e) => {
          if (suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex((i) => (i + 1) % suggestions.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === 'Enter' && highlightIndex >= 0) {
            e.preventDefault();
            const chosen = suggestions[highlightIndex];
            if (chosen) {
              const targetUrl = chosen.source === 'query' ? buildSearchUrl(chosen.title) : chosen.url;
              onNavigate(targetUrl);
              setUrlInput(chosen.source === 'query' ? chosen.title : chosen.url);
              setSuggestions([]);
              setHighlightIndex(-1);
            }
          } else if (e.key === 'Tab' || (e.key === 'ArrowRight' && highlightIndex === -1)) {
            const input = e.target;
            const caretAtEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
            if (caretAtEnd && querySuggestions.length > 0) {
              e.preventDefault();
              const first = querySuggestions[0];
              setUrlInput(first.title);
            }
          } else if (e.key === 'Escape') {
            setSuggestions([]);
            setHighlightIndex(-1);
          }
        }}
      >
        {/* Shield / blocked count */}
        {currentUrl && currentUrl !== 'about:blank' && (
          <button
            type="button"
            className="nav-button"
            title={siteProtection ? `Protection on — Blocked ${blockedCount}` : 'Protection off for this site'}
            onClick={() => { setShowShieldMenu(v => !v); setShowPageInfo(false); }}
            style={{ width: 36, height: 36 }}
          >
            {siteProtection ? '🛡️' : '⚪'} {blockedCount > 0 ? blockedCount : ''}
          </button>
        )}
        {showShieldMenu && (
          <div ref={shieldMenuRef} style={{ position: 'absolute', top: 44, left: 12, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 1000, padding: 6, minWidth: 220 }}>
            <div
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#0f172a' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={async () => {
                try {
                  const host = (() => { try { return new URL(currentUrl).hostname; } catch { return ''; } })();
                  if (!host) return;
                  const next = !siteProtection;
                  await window.electronAPI?.toggleAdblockForSite?.(host, next);
                  setSiteProtection(next);
                  const s = await window.electronAPI?.resetAdblockStats?.();
                  setBlockedCount(s?.blocked || 0);
                } catch {}
                setShowShieldMenu(false);
              }}
            >
              {siteProtection ? 'Disable protection for this site' : 'Enable protection for this site'}
            </div>
            <div
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#0f172a' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={async () => {
                try {
                  const s = await window.electronAPI?.resetAdblockStats?.();
                  setBlockedCount(s?.blocked || 0);
                } catch {}
                setShowShieldMenu(false);
              }}
            >
              Reset blocked count
            </div>
          </div>
        )}
        {currentUrl && currentUrl !== 'about:blank' && (
          <button
            type="button"
            className="nav-button"
            title="Page info and site permissions"
            onClick={() => { setShowPageInfo(v => !v); setShowShieldMenu(false); }}
            style={{ width: 36, height: 36 }}
          >
            🔒
          </button>
        )}
        {showPageInfo && (
          <div ref={pageInfoRef} style={{ position: 'absolute', top: 44, left: 56, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 1000, padding: 8, minWidth: 260 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Page Info</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {[
                { key: 'geolocation', label: 'Location' },
                { key: 'notifications', label: 'Notifications' },
                { key: 'media', label: 'Camera/Microphone' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#0f172a' }}>
                  <span>{label}</span>
                  <input type="checkbox" checked={!!sitePerms?.[key]} onChange={() => togglePermission(key)} />
                </label>
              ))}
            </div>
          </div>
        )}

        {currentUrl && currentUrl !== 'about:blank' && (
          <div className="security-indicator secure">🔒</div>
        )}
        {isPrivate && (
          <div style={{ fontSize: 12, color: '#4f46e5', background: '#eef2ff', border: '1px solid #e0e7ff', padding: '4px 8px', borderRadius: 8, marginRight: 6 }} title="You are in a private window">Private</div>
        )}
        <input
          type="text"
          className="url-input"
          ref={inputRef}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onFocus={() => {
            setIsInputFocused(true);
            const local = computeLocalSuggestions(urlInput);
            setSuggestions([...querySuggestions, ...local].slice(0, 8));
          }}
          onBlur={() => {
            setTimeout(() => {
              const box = suggestBoxRef.current;
              const ae = document.activeElement;
              if (!box || !ae || !box.contains(ae)) {
                setSuggestions([]);
                setHighlightIndex(-1);
                setIsInputFocused(false);
              }
            }, 100);
          }}
          placeholder="Enter URL or search term"
        />
        {/* progress is rendered by parent just under the nav bar */}
        {!!suggestions.length && (
          <div className="suggestions" ref={suggestBoxRef} tabIndex={-1}>
            {suggestions.map((s, i) => (
              <div
                key={(s.url || s.title) + i}
                className={`suggestion ${i === highlightIndex ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const targetUrl = s.source === 'query' ? buildSearchUrl(s.title) : s.url;
                  onNavigate(targetUrl);
                  setUrlInput(s.source === 'query' ? s.title : s.url);
                  setSuggestions([]);
                  setHighlightIndex(-1);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                title={s.title}
              >
                <span className="s-title">{s.title}</span>
                <span className="s-url">{s.source === 'query' ? buildSearchUrl(s.title) : s.url}</span>
                <span className="s-src">
                  {s.source === 'bookmark' ? '⭐' :
                   s.source === 'history' ? '🕘' :
                   s.source === 'engine-search' || s.source === 'query' ? engineBadge : '🔎'}
                </span>
              </div>
            ))}
          </div>
        )}
      </form>

      <div className="menu-buttons">
        <button
          className={`menu-button ${isBookmarked ? 'bookmarked' : ''}`}
          title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          onClick={handleBookmarkToggle}
          disabled={!currentUrl || currentUrl === 'about:blank'}
        >
          {isBookmarked ? '⭐' : '☆'}
        </button>
        <button className="menu-button" title="View bookmarks" onClick={onShowBookmarks}>📚</button>
        <button className="menu-button" title="View history" onClick={onShowHistory}>📖</button>
        <button className="menu-button" title="New private window" onClick={() => window.electronAPI?.openPrivateWindow?.()}>🕶️</button>
        <button className="menu-button" title="Find in page (Ctrl+F)" onClick={onOpenFind} disabled={!currentUrl || currentUrl === 'about:blank'}>🔍</button>
        <button className="menu-button" title="Downloads" onClick={onShowDownloads}>📥</button>
      </div>
      <button
        className="menu-button"
        title="Settings"
        onClick={onOpenSettings}
      >
        ⚙️
      </button>
    </div>
  );
};

export default NavigationBar;
