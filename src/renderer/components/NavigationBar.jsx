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

  const inputRef = useRef(null);
  const suggestBoxRef = useRef(null);
  const queryAbortRef = useRef(null);
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

  // Online query suggestions (DuckDuckGo) with debounce
  useEffect(() => {
    const q = (urlInput || '').trim();
    setHighlightIndex(-1);

    const looksLikeUrl = /^(https?:\/\/)/i.test(q) || (q.includes('.') && !q.includes(' '));
    const onlineEnabled = settings.enableOnlineSuggestions !== false; // default true
    if (!q || looksLikeUrl || !isInputFocused || !onlineEnabled) {
      if (queryAbortRef.current) queryAbortRef.current.abort();
      setQuerySuggestions([]);
      return;
    }

    const controller = new AbortController();
    queryAbortRef.current = controller;
    const handle = setTimeout(async () => {
      try {
        const resp = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const phrases = Array.isArray(data) ? data.map((x) => x.phrase || x) : [];
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
        setQuerySuggestions(out);
      } catch (e) {
        if (e.name !== 'AbortError') setQuerySuggestions([]);
      }
    }, 150);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [urlInput, isInputFocused, settings]);

  // Compose final suggestions (query first, then local deduped)
  useEffect(() => {
    const q = (urlInput || '').trim();
    const local = computeLocalSuggestions(q);
    const out = [];
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
  }, [urlInput, computeLocalSuggestions, querySuggestions, isInputFocused]);

  // Close suggestions on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      const box = suggestBoxRef.current;
      const input = inputRef.current;
      if (!box && !input) return;
      if (box && box.contains(e.target)) return;
      if (input && input.contains && input.contains(e.target)) return;
      setSuggestions([]);
      setHighlightIndex(-1);
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, []);

  // Swipe gestures from main
  useEffect(() => {
    const swipeHandler = (_e, data) => {
      if (!data || !data.direction) return;
      if (data.direction === 'left') onGoForward && onGoForward();
      else if (data.direction === 'right') onGoBack && onGoBack();
    };
    window.electronAPI?.onSwipeGesture(swipeHandler);
    return () => window.electronAPI?.removeSwipeGestureListener(swipeHandler);
  }, [onGoBack, onGoForward]);

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
        {currentUrl && currentUrl !== 'about:blank' && (
          <div className="security-indicator secure">🔒</div>
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
        {isLoading && <div className="loading-indicator">⏳</div>}
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
                <span className="s-src">{s.source === 'bookmark' ? '⭐' : s.source === 'history' ? '🕘' : '🔎'}</span>
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
        <button className="menu-button" title="New private window (Coming Soon)" disabled>🕶️</button>
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
