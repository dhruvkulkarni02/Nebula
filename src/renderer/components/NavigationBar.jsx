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
  onShowDownloads
}) => {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const suggestBoxRef = useRef(null);
  const inputRef = useRef(null);
  const [dataCache, setDataCache] = useState({ bookmarks: [], history: [] });
  const [querySuggestions, setQuerySuggestions] = useState([]);
  const abortRef = useRef(null);

  // Update URL input when currentUrl changes
  useEffect(() => {
    if (currentUrl && currentUrl !== 'about:blank') {
      setUrlInput(currentUrl);
      checkIfBookmarked(currentUrl);
    } else {
      setUrlInput('');
      setIsBookmarked(false);
    }
  }, [currentUrl]);

  // Focus address bar when receiving a global event (Cmd/Ctrl+L)
  useEffect(() => {
    const focusHandler = () => {
      const input = inputRef.current || document.querySelector('.url-input');
      if (input) {
        input.focus();
        input.select();
      }
    };
    window.addEventListener('focus-address-bar', focusHandler);
    return () => window.removeEventListener('focus-address-bar', focusHandler);
  }, []);

  // Preload bookmarks/history for suggestions
  useEffect(() => {
    const load = async () => {
      try {
        const [bookmarks, history] = await Promise.all([
          window.electronAPI?.getBookmarks?.() || [],
          window.electronAPI?.getHistory?.() || []
        ]);
        setDataCache({ bookmarks: bookmarks || [], history: history || [] });
      } catch {}
    };
    load();
  }, []);

  const allSources = useMemo(() => {
    const b = (dataCache.bookmarks || []).map(x => ({
      url: x.url,
      title: x.title || x.url,
      source: 'bookmark',
      score: 2
    }));
    const h = (dataCache.history || []).map(x => ({
      url: x.url,
        const computeLocalSuggestions = useMemo(() => {
      source: 'history',
      score: 1,
      time: x.visitTime ? new Date(x.visitTime).getTime() : 0
    }));
    return [...b, ...h];
  }, [dataCache]);

  const computeSuggestions = useMemo(() => {
    return (q) => {
      const query = (q || '').trim().toLowerCase();
      if (!query) return [];
      // Simple fuzzy: startsWith gets higher boost
      const results = allSources
        .map(item => {
          const t = (item.title || '').toLowerCase();
          const u = (item.url || '').toLowerCase();
          let s = item.score;
          if (t.startsWith(query) || u.startsWith(query)) s += 10;
          else if (t.includes(query) || u.includes(query)) s += 5;
          return { ...item, _s: s };
        })
        .filter(x => x._s > 1)
        .sort((a, b) => (b._s - a._s) || (b.time || 0) - (a.time || 0));
      // Unique by URL, limit 8
      const seen = new Set();
      const uniq = [];
        }, [allSources]);

        // Build a search URL consistent with submit behavior (Google by default)
        const buildSearchUrl = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

        // Debounced online query suggestions (DuckDuckGo AC API)
        useEffect(() => {
          const q = (urlInput || '').trim();
          setHighlightIndex(-1);
          // Heuristic: skip network if looks like a URL (has spaces? dot? protocol?)
          const looksLikeUrl = /^(https?:\/\/)/i.test(q) || (q.includes('.') && !q.includes(' '));
          if (!q || looksLikeUrl) {
            // Clear query suggestions when empty or URL-like
            if (abortRef.current) abortRef.current.abort();
            setQuerySuggestions([]);
            return;
          }
          // Debounce
          const controller = new AbortController();
          abortRef.current = controller;
          const handle = setTimeout(async () => {
            try {
              const resp = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
              });
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              const data = await resp.json();
              // data can be array of {phrase: string}
              const phrases = Array.isArray(data) ? data.map(x => x.phrase || x) : [];
              const items = [];
              const seen = new Set();
              for (const p of phrases) {
                const phrase = String(p || '').trim();
                if (!phrase || seen.has(phrase)) continue;
                seen.add(phrase);
                items.push({
                  title: phrase,
                  url: buildSearchUrl(phrase),
                  source: 'query',
                  score: 100 + (phrase.toLowerCase().startsWith(q.toLowerCase()) ? 5 : 0)
                });
                if (items.length >= 8) break;
              }
              setQuerySuggestions(items);
            } catch (e) {
              if (e.name !== 'AbortError') {
                setQuerySuggestions([]);
              }
            }
          }, 150);
          return () => {
            clearTimeout(handle);
            controller.abort();
          };
        }, [urlInput]);
        if (seen.has(r.url)) continue;
        seen.add(r.url);
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
          setSuggestions(out.slice(0, 8));
        if (uniq.length >= 8) break;
      }
      return uniq;
    };
  }, [allSources]);

  useEffect(() => {
    const id = setTimeout(() => {
      setSuggestions(computeSuggestions(urlInput));
      setHighlightIndex(-1);
    }, 60);
    return () => clearTimeout(id);
  }, [urlInput, computeSuggestions]);

  // Close suggestions on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      const box = suggestBoxRef.current;
      const input = inputRef.current;
      if (!box && !input) return;
      if (box && box.contains(e.target)) return; // clicks inside box ok
      if (input && input.contains && input.contains(e.target)) return; // input itself
      setSuggestions([]);
      setHighlightIndex(-1);
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, []);

  // Listen for swipe gestures sent from main (macOS trackpad two-finger swipe)
  useEffect(() => {
    const swipeHandler = (_e, data) => {
      if (!data || !data.direction) return;
      if (data.direction === 'left') {
        // Swipe left = go forward (like Safari)
        onGoForward && onGoForward();
      } else if (data.direction === 'right') {
        // Swipe right = go back
        onGoBack && onGoBack();
      }
    };
    window.electronAPI?.onSwipeGesture(swipeHandler);
    return () => {
      window.electronAPI?.removeSwipeGestureListener(swipeHandler);
    };
  }, [onGoBack, onGoForward]);

  const checkIfBookmarked = async (url) => {
    try {
      if (window.electronAPI && url && url !== 'about:blank') {
        const bookmarks = await window.electronAPI.getBookmarks();
        const isBookmarked = bookmarks.some(bookmark => bookmark.url === url);
        setIsBookmarked(isBookmarked);
      }
    } catch (error) {
      console.error('Failed to check bookmark status:', error);
    }
  };

  const handleBookmarkToggle = async () => {
    try {
      if (window.electronAPI && currentUrl && currentUrl !== 'about:blank') {
        if (isBookmarked) {
          await window.electronAPI.removeBookmark(currentUrl);
          setIsBookmarked(false);
        } else {
          // Get page title from webview if available
          const title = document.title || new URL(currentUrl).hostname;
          await window.electronAPI.addBookmark(currentUrl, title);
          setIsBookmarked(true);
        }
      }
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    }
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    let url = urlInput.trim();
    
    // Simple URL validation and formatting
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
                    onNavigate(chosen.source === 'query' ? buildSearchUrl(chosen.title) : chosen.url);
                    setUrlInput(chosen.source === 'query' ? chosen.title : chosen.url);
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }
                } else if (e.key === 'Tab' || (e.key === 'ArrowRight' && highlightIndex === -1)) {
                  // Autocomplete to the first query suggestion when caret is at end
                  const input = e.target;
                  const caretAtEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
                  if (caretAtEnd && querySuggestions.length > 0) {
                    e.preventDefault();
                    const first = querySuggestions[0];
                    setUrlInput(first.title);
                  }
    
    onNavigate(url);
    setUrlInput(url);
  setSuggestions([]);
  setHighlightIndex(-1);
  };

  const handleHomeClick = () => {
    // Navigate to our start page instead of example.com
    const homeUrl = 'about:blank';
    onNavigate(homeUrl);
    setUrlInput('');
  };

  return (
    <div className="navigation-bar">
    <div className="nav-buttons">
        <button
          className="nav-button"
          onClick={onGoBack}
          disabled={!canGoBack}
          title="Go back"
        >
      ⬅️
        </button>
        
        <button
          className="nav-button"
          onClick={onGoForward}
          disabled={!canGoForward}
          title="Go forward"
        >
      ➡️
        </button>
        
        {isLoading ? (
          <button
            className="stop-button"
            onClick={onStop}
            title="Stop loading"
          >
            ⛔
          </button>
        ) : (
          <button
            className="reload-button"
            onClick={onReload}
            title="Reload"
          >
            🔄
          </button>
        )}
        
        <button
          className="nav-button"
          onClick={handleHomeClick}
                      <span className="s-url">{s.source === 'query' ? buildSearchUrl(s.title) : s.url}</span>
                      <span className="s-src">{s.source === 'bookmark' ? '⭐' : s.source === 'history' ? '🕘' : '🔎'}</span>
          🏠
        </button>
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
              onNavigate(chosen.url);
              setUrlInput(chosen.url);
              setSuggestions([]);
              setHighlightIndex(-1);
            }
          } else if (e.key === 'Escape') {
            setSuggestions([]);
            setHighlightIndex(-1);
          }
        }}
      >
        {currentUrl && currentUrl !== 'about:blank' && (
          <div className="security-indicator secure">
            🔒
          </div>
        )}
        <input
          type="text"
          className="url-input"
          ref={inputRef}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onFocus={() => setSuggestions(computeSuggestions(urlInput))}
          onBlur={(e) => {
            // keep suggestions if moving focus into the suggestions box
            setTimeout(() => {
              const box = suggestBoxRef.current;
              if (!box) {
                setSuggestions([]);
                setHighlightIndex(-1);
                return;
              }
              const ae = document.activeElement;
              if (!box.contains(ae)) {
                setSuggestions([]);
                setHighlightIndex(-1);
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
                key={s.url + i}
                className={`suggestion ${i === highlightIndex ? 'active' : ''}`}
                onMouseDown={(e) => {
                  // prevent input blur until we handle click
                  e.preventDefault();
                  onNavigate(s.url);
                  setUrlInput(s.url);
                  setSuggestions([]);
                  setHighlightIndex(-1);
                }}
        onMouseEnter={() => setHighlightIndex(i)}
                title={s.title}
              >
                <span className="s-title">{s.title}</span>
                <span className="s-url">{s.url}</span>
                <span className="s-src">{s.source === 'bookmark' ? '⭐' : '🕘'}</span>
              </div>
            ))}
          </div>
        )}
      </form>

    <div className="menu-buttons">
        <button
      className={`menu-button ${isBookmarked ? 'bookmarked' : ''}`}
          title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
          onClick={handleBookmarkToggle}
          disabled={!currentUrl || currentUrl === 'about:blank'}
        >
          {isBookmarked ? '⭐' : '☆'}
        </button>
        
        <button
      className="menu-button"
          title="View bookmarks"
          onClick={onShowBookmarks}
        >
          📚
        </button>
        
        <button
      className="menu-button"
          title="View history"
          onClick={onShowHistory}
        >
          📖
        </button>
        
        <button
      className="menu-button"
          title="New private window (Coming Soon)"
          disabled
        >
      🕶️
        </button>
        
        <button
      className="menu-button"
          title="Find in page (Ctrl+F)"
          onClick={onOpenFind}
          disabled={!currentUrl || currentUrl === 'about:blank'}
        >
          🔍
        </button>
        
        <button
      className="menu-button"
          title="Downloads"
          onClick={onShowDownloads}
        >
          📥
        </button>
      </div>
    </div>
  );
};

export default NavigationBar;
