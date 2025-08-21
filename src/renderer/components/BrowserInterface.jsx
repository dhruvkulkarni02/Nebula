import React, { useState, useEffect, useMemo, useRef } from 'react';
import NavigationBar from './NavigationBar';
import WebView from './WebView';
import BookmarksPanel from './BookmarksPanel';
import HistoryPanel from './HistoryPanel';
import DownloadsManager from './DownloadsManager';
import SettingsPanel from './SettingsPanel';
import '../styles/BrowserInterface.css';

const BrowserInterface = ({
  currentUrl,
  isLoading,
  canGoBack,
  canGoForward,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload
}) => {
  const [tabs, setTabs] = useState([
    { id: 1, url: currentUrl || 'about:blank', title: 'New Tab', active: true, pinned: false }
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [openFindFunction, setOpenFindFunction] = useState(null);
  const [showBookmarksBar, setShowBookmarksBar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({});
  const [bookmarksBar, setBookmarksBar] = useState([]);
  const [bookmarkQuery, setBookmarkQuery] = useState('');
  const [pageLoading, setPageLoading] = useState(false);
  const [pageProgress, setPageProgress] = useState(0);
  const [bookmarksSort, setBookmarksSort] = useState('custom'); // custom|alpha|recent|host
  const [editingBookmark, setEditingBookmark] = useState(null); // {url,title,tags,note,color,pinned}
  // overlay cleaner & session map removed per request
  const sessionGraphRef = useRef({}); // tabId -> { nodes: [{id,url,title}], edges: [{from,to}] }
  // Monotonic tab id generator to ensure unique React keys even under rapid creation
  const nextTabIdRef = useRef(Date.now());
  const newTabId = () => {
    nextTabIdRef.current += 1;
    return nextTabIdRef.current;
  };

  useEffect(() => {
    const load = async () => {
      try {
        if (window.electronAPI) {
          let list = await window.electronAPI.getBookmarks();
          const s = await window.electronAPI.getSettings();
          setSettings(s || {});
          setShowBookmarksBar(!!s?.showBookmarksBarDefault);
          try {
            document.documentElement.setAttribute('data-reduce-motion', s?.reduceMotion ? 'true' : 'false');
            // Apply theme on startup
            const applyTheme = (theme) => {
              if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
              else document.documentElement.setAttribute('data-theme', 'light');
            };
            if (s?.theme === 'system' || !s?.theme) {
              const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
              applyTheme(prefersDark && prefersDark.matches ? 'dark' : 'light');
            } else {
              applyTheme(s.theme);
            }
          } catch {}
          if (s && Array.isArray(s.bookmarksBarOrder)) {
            // reorder bookmarks by saved order (unknown URLs appended at end)
            const order = s.bookmarksBarOrder;
            const byUrl = new Map((list || []).map(b => [b.url, b]));
            const ordered = order.map(u => byUrl.get(u)).filter(Boolean);
            const extras = (list || []).filter(b => !order.includes(b.url));
            list = [...ordered, ...extras];
          }
          setBookmarksBar(list || []);
        }
      } catch {}
    };
    load();
    // live updates from other windows
    try {
      const handler = (_e, data) => {
        if (data) setSettings(data);
      };
      window.electronAPI?.onSettingsUpdated?.(handler);
      return () => window.electronAPI?.removeSettingsUpdatedListener?.(handler);
    } catch {}
  }, []);

  // React to theme changes at runtime (from Settings)
  useEffect(() => {
    if (!settings) return;
    try {
      const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
      };
      if (settings.theme === 'system' || !settings.theme) {
        const mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
        applyTheme(mql && mql.matches ? 'dark' : 'light');
        const handler = (e) => applyTheme(e.matches ? 'dark' : 'light');
        if (mql && mql.addEventListener) {
          mql.addEventListener('change', handler);
          return () => mql.removeEventListener('change', handler);
        }
      } else {
        applyTheme(settings.theme);
      }
      // Apply custom accent color if provided
      if (settings.accentColor) {
        document.documentElement.style.setProperty('--accent', settings.accentColor);
      }
    } catch {}
  }, [settings?.theme]);

  // React to accent color changes
  useEffect(() => {
    try {
      if (settings?.accentColor) {
        document.documentElement.style.setProperty('--accent', settings.accentColor);
      }
    } catch {}
  }, [settings?.accentColor]);

  // Reflect bookmarks bar visibility changes from settings live
  useEffect(() => {
    try {
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'showBookmarksBarDefault')) {
        setShowBookmarksBar(!!settings.showBookmarksBarDefault);
      }
    } catch {}
  }, [settings?.showBookmarksBarDefault]);

  const filteredBookmarks = useMemo(() => {
    const q = bookmarkQuery.trim().toLowerCase();
    let list = bookmarksBar;
    if (q) list = list.filter(b => (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q) || (Array.isArray(b.tags) && b.tags.join(' ').toLowerCase().includes(q)) || (b.note || '').toLowerCase().includes(q));
    switch (bookmarksSort) {
      case 'alpha':
        list = [...list].sort((a,b)=> (a.title||a.url||'').localeCompare(b.title||b.url||''));
        break;
      case 'recent':
        list = [...list].sort((a,b)=> new Date(b.dateAdded||0)-new Date(a.dateAdded||0));
        break;
      case 'host':
        list = [...list].sort((a,b)=> new URL(a.url).hostname.localeCompare(new URL(b.url).hostname));
        break;
      default:
        break;
    }
    return list;
  }, [bookmarksBar, bookmarkQuery, bookmarksSort]);
  const [stopLoadingFn, setStopLoadingFn] = useState(null);
  const [zoomFns, setZoomFns] = useState({ zoomIn: null, zoomOut: null, resetZoom: null });
  const [audioFns, setAudioFns] = useState({ toggleMute: null });
  const [closedTabs, setClosedTabs] = useState([]);
  const dragIndexRef = useRef(null);
  const draggingTabIdRef = useRef(null);
  const importInputRef = useRef(null);
  const [draggedTabId, setDraggedTabId] = useState(null);
  const [tabMenu, setTabMenu] = useState({ open: false, x: 0, y: 0, tabId: null });
  const [isDraggingTab, setIsDraggingTab] = useState(false);
  const bookmarksDragIndexRef = useRef(null);
  const navFnsRef = useRef({ goBack: null, goForward: null, reload: null });
  const [navState, setNavState] = useState({ canGoBack: false, canGoForward: false });

  // Restore last session tabs from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nebula.session.tabs');
  if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.tabs) && parsed.tabs.length) {
          setTabs(parsed.tabs.map(t => ({
            id: t.id || newTabId(),
            url: t.url || 'about:blank',
            title: t.title || 'New Tab',
    active: !!t.active,
    favicon: t.favicon || null,
    pinned: !!t.pinned
          })));
          const active = parsed.tabs.find(t => t.active) || parsed.tabs[0];
          if (active && active.url) {
            setActiveTabId(active.id);
            onNavigate(active.url);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to restore session tabs:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist session tabs to localStorage
  useEffect(() => {
    try {
      const payload = { tabs, activeTabId };
      localStorage.setItem('nebula.session.tabs', JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save session tabs:', e);
    }
  }, [tabs, activeTabId]);
  // Swipe back/forward gesture support (from main via preload)
  useEffect(() => {
    const handler = (_e, data) => {
      try {
        const dir = (data?.direction || '').toLowerCase();
        // If the guest preload already emitted a gesture recently, prefer it
        // and ignore main-sent gestures to avoid duplicates.
        const GUEST_SUPPRESS_MS = 2000;
        try {
          const last = window.__nebulaLastGuestGesture || 0;
          if (last && (Date.now() - last) < GUEST_SUPPRESS_MS) {
            // ignore main forwarded gesture
            return;
          }
        } catch {}
        if (dir === 'right') {
          // macOS: swipe right -> back
          navFnsRef.current?.goBack?.();
        } else if (dir === 'left') {
          // macOS: swipe left -> forward
          navFnsRef.current?.goForward?.();
        }
      } catch {}
    };
    try { window.electronAPI?.onSwipeGesture?.(handler); } catch {}
    return () => { try { window.electronAPI?.removeSwipeGestureListener?.(handler); } catch {} };
  }, []);

  // Renderer-level fallback: capture horizontal wheel gestures at top-level (capture phase)
  useEffect(() => {
    let accum = 0;
    let cooldownUntil = 0;
    const TH = 120; // threshold
    const COOLDOWN_MS = 400;
    const onWheel = (e) => {
      try {
        const dx = typeof e.deltaX === 'number' ? e.deltaX : 0;
        const dy = typeof e.deltaY === 'number' ? e.deltaY : 0;
        if (Math.abs(dx) <= Math.abs(dy)) return;
        const now = performance.now ? performance.now() : Date.now();
        if (now < cooldownUntil) return;
        accum += dx;
        if (accum >= TH) {
          accum = 0; cooldownUntil = now + COOLDOWN_MS;
          try { navFnsRef.current?.goBack?.(); } catch {}
        } else if (accum <= -TH) {
          accum = 0; cooldownUntil = now + COOLDOWN_MS;
          try { navFnsRef.current?.goForward?.(); } catch {}
        }
      } catch {}
    };
    window.addEventListener('wheel', onWheel, { passive: true, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);


  const handleNewTab = () => {
    const newTab = {
  id: newTabId(),
      url: 'about:blank',
      title: 'New Tab',
      active: false,
      pinned: false
    };
    
    setTabs(prevTabs => [
      ...prevTabs.map(tab => ({ ...tab, active: false })),
      { ...newTab, active: true }
    ]);
    setActiveTabId(newTab.id);
    // Always show home page in a new tab
    onNavigate('about:blank');
  };

  const handleCloseTab = (tabId) => {
    const closingTab = tabs.find(t => t.id === tabId);
    if (closingTab) {
      setClosedTabs(prev => [{ ...closingTab }, ...prev].slice(0, 20));
    }
    const updatedTabs = tabs.filter(tab => tab.id !== tabId);
    
    if (updatedTabs.length === 0) {
      // If no tabs left, keep the window open and create a fresh New Tab instead of closing the window
      const newTab = { id: newTabId(), url: 'about:blank', title: 'New Tab', active: true, pinned: false };
      setTabs([ newTab ]);
      setActiveTabId(newTab.id);
      onNavigate('about:blank');
      return;
    }
    
    setTabs(updatedTabs);
    
    // If we closed the active tab, switch to the first remaining tab
    if (tabId === activeTabId) {
      const newActiveTab = updatedTabs[0];
      setActiveTabId(newActiveTab.id);
      onNavigate(newActiveTab.url);
    }
  };

  const handleSwitchTab = (tabId) => {
    const updatedTabs = tabs.map(tab => ({
      ...tab,
      active: tab.id === tabId
    }));
    
    setTabs(updatedTabs);
    setActiveTabId(tabId);
    
    const selectedTab = tabs.find(tab => tab.id === tabId);
    if (selectedTab) {
      onNavigate(selectedTab.url);
    }
  };

  // Drag-and-drop tab reordering
  // Compute display order with pinned tabs first
  const displayTabs = useMemo(() => {
    const pinnedTabs = tabs.filter(t => t.pinned);
    const normalTabs = tabs.filter(t => !t.pinned);
    return [...pinnedTabs, ...normalTabs];
  }, [tabs]);

  const handleTabDragStart = (index) => (e) => {
  const tab = displayTabs[index];
  dragIndexRef.current = index;
  draggingTabIdRef.current = tab?.id || null;
  setIsDraggingTab(true);
  setDraggedTabId(tab?.id || null);
  e.dataTransfer.effectAllowed = 'move';
  };

  const handleTabDragOver = (index) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTabDrop = (index) => (e) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    const to = index;
    dragIndexRef.current = null;
  draggingTabIdRef.current = null;
  setIsDraggingTab(false);
  setDraggedTabId(null);
    if (from == null || from === to) return;
    // Reorder within pinned or within normal segment only
    const fromTab = displayTabs[from];
    const toTab = displayTabs[to];
    if (!fromTab || !toTab) return;
    if (fromTab.pinned !== toTab.pinned) return; // don't cross segments

    setTabs(prev => {
      const arr = [...prev];
      const segmentFlag = fromTab.pinned;
      const segmentIdxs = arr
        .map((t, i) => ({ t, i }))
        .filter(x => x.t.pinned === segmentFlag)
        .map(x => x.i);
      // Build segment order array
      const segment = segmentIdxs.map(i => arr[i]);
      const fromId = fromTab.id;
      const toId = toTab.id;
      const segFrom = segment.findIndex(t => t.id === fromId);
      const segTo = segment.findIndex(t => t.id === toId);
      if (segFrom === -1 || segTo === -1) return prev;
      const [moved] = segment.splice(segFrom, 1);
      segment.splice(segTo, 0, moved);
      // Write back segment into arr
      segmentIdxs.forEach((arrIdx, k) => {
        arr[arrIdx] = segment[k];
      });
      return arr;
    });
  };

  // Reset dragging state on dragend (when user stops dragging without dropping)
  const handleTabDragEnd = (e) => {
    dragIndexRef.current = null;
    draggingTabIdRef.current = null;
    setIsDraggingTab(false);
  setDraggedTabId(null);
  };

  const handleTabUrlChange = (tabId, newUrl, title = '') => {
    setTabs(prevTabs => 
      prevTabs.map(tab => tab.id === tabId ? { ...tab, url: newUrl, title: title || tab.title } : tab)
    );
    try { recordNav(tabId, newUrl, title); } catch {}
  };

  const handleTabFaviconChange = (tabId, favicons) => {
    const favicon = Array.isArray(favicons) && favicons.length ? favicons[0] : null;
    setTabs(prevTabs => prevTabs.map(tab => tab.id === tabId ? { ...tab, favicon } : tab));
  };

  // Tab context menu actions
  const handlePinToggle = (tabId) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, pinned: !t.pinned } : t));
  };

  const handleDuplicateTab = (tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      const src = prev[idx];
  const dup = { ...src, id: newTabId(), active: true };
      const next = prev.map(t => ({ ...t, active: false }));
      next.splice(idx + 1, 0, dup);
      setActiveTabId(dup.id);
      onNavigate(dup.url || 'about:blank');
      return next;
    });
  };

  const handleCloseOthers = (tabId) => {
    setTabs(prev => prev.filter(t => t.id === tabId));
    setActiveTabId(tabId);
  };

  const handleCloseToRight = (tabId) => {
    const idxInDisplay = displayTabs.findIndex(t => t.id === tabId);
    if (idxInDisplay === -1) return;
    const keepIds = new Set(displayTabs.slice(0, idxInDisplay + 1).map(t => t.id));
    setTabs(prev => prev.filter(t => keepIds.has(t.id)));
    setActiveTabId(tabId);
  };

  // Keyboard shortcuts are handled globally in main and forwarded via 'onShortcut'.
  // We intentionally avoid adding a local keydown listener to prevent double-triggering (e.g., Cmd+T opening two tabs).

  // Handle shortcuts forwarded from main (works when webview is focused)
  const lastShortcutRef = useRef({ action: null, ts: 0 });
  useEffect(() => {
    // Deduplicate identical shortcut actions arriving in a burst (host + webview, or key auto-repeat)
    const onShortcut = (_e, data) => {
      try {
        const a = data?.action;
        if (!a) return;
        // Ignore auto-repeats flagged by main
        if (data?.repeat) return;
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (lastShortcutRef.current.action === a && now - lastShortcutRef.current.ts < 250) {
          return; // drop duplicate within 250ms window
        }
        lastShortcutRef.current.action = a;
        lastShortcutRef.current.ts = now;
        switch (a) {
          case 'back':
            navFnsRef.current?.goBack?.();
            break;
          case 'forward':
            navFnsRef.current?.goForward?.();
            break;
          case 'reload':
            navFnsRef.current?.reload?.();
            break;
          case 'reloadHard':
            // Fallback to soft reload via webview
            navFnsRef.current?.reload?.();
            break;
          case 'newTab':
            handleNewTab();
            break;
          case 'closeTab':
            handleCloseTab(activeTabId);
            break;
          case 'focusOmnibox':
            window.dispatchEvent(new Event('focus-address-bar'));
            break;
          case 'find':
            openFindFunction && openFindFunction();
            break;
          case 'reopenClosedTab': {
            const reopened = closedTabs[0];
            if (reopened) {
              setClosedTabs(prev => prev.slice(1));
              const newId = newTabId();
              const tab = { ...reopened, id: newId, active: true };
              setTabs(prev => [...prev.map(t => ({ ...t, active: false })), tab]);
              setActiveTabId(newId);
              onNavigate(tab.url || 'about:blank');
            }
            break; }
          case 'nextTab':
          case 'prevTab': {
            const idx = tabs.findIndex(t => t.id === activeTabId);
            if (idx !== -1) {
              const delta = a === 'prevTab' ? -1 : 1;
              const nextIdx = (idx + delta + tabs.length) % tabs.length;
              const nextTab = tabs[nextIdx];
              handleSwitchTab(nextTab.id);
            }
            break; }
          case 'nthTab': {
            const index = Math.max(1, Math.min(9, Number(data?.index || 1)));
            const targetIdx = index === 9 ? tabs.length - 1 : index - 1;
            const target = tabs[targetIdx];
            if (target) handleSwitchTab(target.id);
            break; }
          case 'zoomIn':
            zoomFns.zoomIn && zoomFns.zoomIn();
            break;
          case 'zoomOut':
            zoomFns.zoomOut && zoomFns.zoomOut();
            break;
          case 'resetZoom':
            zoomFns.resetZoom && zoomFns.resetZoom();
            break;
          case 'toggleMute':
            audioFns.toggleMute && audioFns.toggleMute();
            break;
          default:
            break;
        }
      } catch {}
    };
  let unsubscribe;
  try { unsubscribe = window.electronAPI?.onShortcut?.(onShortcut); } catch {}
  return () => { try { (unsubscribe && typeof unsubscribe === 'function') ? unsubscribe() : window.electronAPI?.removeShortcutListener?.(onShortcut); } catch {} };
  }, [activeTabId, openFindFunction, tabs, zoomFns, audioFns, closedTabs]);

  const recordNav = (tabId, url, title) => {
    try {
      const g = sessionGraphRef.current;
      if (!g[tabId]) g[tabId] = { nodes: [], edges: [], lastNodeId: null };
      const graph = g[tabId];
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      graph.nodes.push({ id, url, title: title || '' });
      if (graph.lastNodeId) graph.edges.push({ from: graph.lastNodeId, to: id });
      graph.lastNodeId = id;
    } catch {}
  };

  return (
    <div className="browser-interface" onClick={() => tabMenu.open && setTabMenu({ open: false, x: 0, y: 0, tabId: null })}>
  {/* Left-edge drop zone: appear while dragging a tab to allow enabling vertical tabs */}
  {isDraggingTab && (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={async (e) => {
        e.preventDefault();
            try {
              const next = { ...(settings || {}), tabsLayout: 'vertical-left' };
              await window.electronAPI?.updateSettings?.(next);
              setSettings(next);

              // Move the dragged tab into the visible vertical list and activate it
              const draggedId = draggingTabIdRef.current;
              if (draggedId != null) {
                setTabs(prev => {
                  const idx = prev.findIndex(t => t.id === draggedId);
                  if (idx === -1) return prev;
                  const tab = prev[idx];
                  const nextArr = [...prev.filter((t) => t.id !== draggedId)];
                  // Insert the tab at the front of the normal (non-pinned) segment
                  const insertAt = nextArr.findIndex(t => !t.pinned);
                  if (insertAt === -1) {
                    nextArr.unshift({ ...tab, active: true });
                  } else {
                    nextArr.splice(insertAt, 0, { ...tab, active: true });
                  }
                  // Ensure only the moved tab is active
                  return nextArr.map(t => ({ ...t, active: t.id === draggedId }));
                });
                setActiveTabId(draggedId);
                // Navigate to the tab's URL so the content area reflects it
                try {
                  const t = tabs.find(x => x.id === draggedId) || null;
                  if (t && t.url) {
                    if (window.electronAPI) await window.electronAPI.navigateToUrl(t.url);
                    onNavigate(t.url);
                  }
                } catch (err) {}
              }
            } catch (err) {
              console.error('Failed to enable vertical tabs', err);
            } finally {
              dragIndexRef.current = null;
              draggingTabIdRef.current = null;
              setIsDraggingTab(false);
            }
      }}
      style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 44, zIndex: 1500, background: 'linear-gradient(90deg, rgba(59,130,246,0.06), transparent)', pointerEvents: 'auto' }}
    />
  )}
  {/* Tab Bar (hidden when vertical tabs are enabled) */}
  {(settings?.tabsLayout || 'top') !== 'vertical-left' && (
  <div className="tab-bar" onDoubleClick={handleNewTab}>
        {displayTabs.map((tab, idx) => (
          <div
            key={tab.id}
            className={`tab ${tab.active ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${draggedTabId === tab.id ? 'dragging' : ''}`}
            onClick={() => handleSwitchTab(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTabMenu({ open: true, x: e.clientX, y: e.clientY, tabId: tab.id });
            }}
            onMouseDown={(e) => {
              // Middle-click closes tab
              if (e.button === 1) {
                e.preventDefault();
                handleCloseTab(tab.id);
              }
            }}
            draggable
            onDragStart={handleTabDragStart(idx)}
            onDragEnd={handleTabDragEnd}
            onDragOver={handleTabDragOver(idx)}
            onDrop={handleTabDrop(idx)}
          >
            {tab.pinned && <span style={{ marginRight: 6 }}>📌</span>}
            {tab.favicon && <img src={tab.favicon} alt="" style={{ width: 14, height: 14, marginRight: 8, borderRadius: 3 }} />}
            <span className="tab-title">{tab.title}</span>
            {!tab.pinned && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button className="new-tab-button" onClick={handleNewTab}>
          +
        </button>
  </div>
  )}

  {/* Navigation Bar (position configurable) */}
  { (settings?.navBarPosition || 'top') === 'top' && (
  <NavigationBar
        currentUrl={currentUrl}
  isLoading={pageLoading}
  canGoBack={navState.canGoBack}
  canGoForward={navState.canGoForward}
  settings={settings}
        onNavigate={async (url) => {
          if (window.electronAPI) {
            await window.electronAPI.navigateToUrl(url);
          }
          onNavigate(url);
          handleTabUrlChange(activeTabId, url);
        }}
  onGoBack={() => navFnsRef.current?.goBack?.()}
  onGoForward={() => navFnsRef.current?.goForward?.()}
  onReload={() => navFnsRef.current?.reload?.()}
  onStop={() => stopLoadingFn && stopLoadingFn()}
        onShowBookmarks={() => setShowBookmarks(true)}
        onShowHistory={() => setShowHistory(true)}
    onShowDownloads={() => setShowDownloads(true)}
    onOpenFind={() => openFindFunction && openFindFunction()}
  onOpenSettings={() => { try { window.electronAPI?.openSettingsWindow?.(); } catch {} }}
  progress={pageProgress}
  />)}

      {pageLoading && (
        <div className="top-progress">
          <div className="top-progress-inner" style={{ width: `${Math.max(10, Math.min(100, pageProgress || 0))}%` }} />
        </div>
      )}

      {/* Bookmarks Bar */}
      {showBookmarksBar && (
  <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
          <span style={{ fontSize: 12, color: 'color-mix(in srgb, var(--fg) 60%, transparent)', marginRight: 8, alignSelf: 'center' }}>Bookmarks</span>
          <input
            value={bookmarkQuery}
            onChange={(e) => setBookmarkQuery(e.target.value)}
            placeholder="Search bookmarks (title, url, #tag)"
            style={{ flex: '0 0 240px', background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
          />
          <select value={bookmarksSort} onChange={(e)=>setBookmarksSort(e.target.value)} style={{ fontSize:12, border:'1px solid var(--border)', borderRadius:8, padding:'6px 8px', background:'var(--panel)', color: 'var(--fg)' }}>
            <option value="custom">Custom</option>
            <option value="alpha">A→Z</option>
            <option value="recent">Recent</option>
            <option value="host">Site</option>
          </select>
          {/* Compact vertical list */}
          <div style={{ display:'flex', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection:'column', gap: 2, maxHeight: 44, overflowX: 'auto', overflowY: 'hidden', flex: 1 }}>
              <div style={{ display:'flex', gap: 6 }}>
                {filteredBookmarks.slice(0, 50).map((b, i) => {
                  const host = (()=>{ try{ return new URL(b.url).hostname; }catch{return ''; }})();
                  const color = b.color || '#e2e8f0';
                  const pinned = !!b.pinned;
                  return (
                    <div key={`${b.url}-${i}`} title={b.title || b.url} draggable={bookmarkQuery.trim()==='' } onDragStart={(e)=>{ if (bookmarkQuery.trim()!=='') return; bookmarksDragIndexRef.current = i; e.dataTransfer.effectAllowed='move'; }} onDragOver={(e)=>{ if (bookmarkQuery.trim()!=='') return; e.preventDefault(); e.dataTransfer.dropEffect='move'; }} onDrop={(e)=>{ if (bookmarkQuery.trim()!=='') return; e.preventDefault(); const from = bookmarksDragIndexRef.current; const to = i; bookmarksDragIndexRef.current=null; if (from==null||from===to) return; setBookmarksBar(prev=>{ const arr=[...prev]; const [m]=arr.splice(from,1); arr.splice(to,0,m); try{ const order=arr.map(x=>x.url); window.electronAPI?.updateSettings({ bookmarksBarOrder: order }); }catch{} return arr; }); }} style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'4px 8px', border:'1px solid var(--border)', borderRadius: 8, background:'color-mix(in srgb, var(--panel) 90%, var(--bg))', maxWidth: 260 }}>
                      <span style={{ fontSize:12 }}>{pinned?'📌':'⭐'}</span>
                      <span style={{ width: 8, height:8, borderRadius: 4, background: color }} />
                      <button onClick={async ()=>{ if (window.electronAPI) await window.electronAPI.navigateToUrl(b.url); onNavigate(b.url); handleTabUrlChange(activeTabId, b.url, b.title); }} style={{ background:'transparent', border:'none', padding:0, cursor:'pointer', color:'var(--fg)', fontSize:12, textOverflow:'ellipsis', whiteSpace:'nowrap', overflow:'hidden', maxWidth: 160 }}>{b.title || host || b.url}</button>
                      <span style={{ color:'color-mix(in srgb, var(--fg) 50%, transparent)', fontSize:11, maxWidth: 120, overflow:'hidden', textOverflow:'ellipsis' }}>{host}</span>
                      <button title="Open in new tab" onClick={()=>{ const newTab={ id:newTabId(), url:b.url, title:b.title||b.url, active:false, pinned:false}; setTabs(prev=>[...prev.map(t=>({...t,active:false})),{...newTab,active:true}]); setActiveTabId(newTab.id); onNavigate(b.url); }} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:12 }}>🧭</button>
                      <button title="Edit" onClick={()=> setEditingBookmark(b)} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:12 }}>✏️</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button title="Export bookmarks" onClick={async () => { try { await window.electronAPI?.exportBookmarks(); } catch {} }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--fg)' }}>⬇️ Export</button>
            <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { const text = await f.text(); const data = JSON.parse(text); const res = await window.electronAPI?.importBookmarksData(data); if (res?.success) { const list = await window.electronAPI?.getBookmarks(); setBookmarksBar(list || []); } } catch {} e.target.value = ''; }} />
            <button title="Import bookmarks (JSON)" onClick={() => importInputRef.current?.click()} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--fg)' }}>⬆️ Import</button>
            <button title="Dedupe" onClick={async ()=>{ try{ const res = await window.electronAPI?.dedupeBookmarks(); if (res?.success){ const list = await window.electronAPI?.getBookmarks(); setBookmarksBar(list||[]);} }catch{} }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--fg)' }}>🧹 Dedupe</button>
            <button title="Toggle bookmarks bar" onClick={() => setShowBookmarksBar(v => !v)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--fg)' }}>🧰 Toggle</button>
          </div>
        </div>
      )}

      {/* Edit bookmark modal */}
      {editingBookmark && (
        <div className="bookmarks-overlay" onClick={()=>setEditingBookmark(null)}>
          <div className="bookmarks-panel" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="bookmarks-header"><h3>✏️ Edit Bookmark</h3></div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <label style={{ fontSize:12 }}>Title<input style={{ width:'100%', marginTop:4 }} value={editingBookmark.title||''} onChange={(e)=> setEditingBookmark(prev=>({...prev, title:e.target.value}))} /></label>
              <label style={{ fontSize:12 }}>Tags (comma separated)<input style={{ width:'100%', marginTop:4 }} value={(editingBookmark.tags||[]).join(', ')} onChange={(e)=> setEditingBookmark(prev=>({...prev, tags: e.target.value.split(',').map(t=>t.trim()).filter(Boolean)}))} /></label>
              <label style={{ fontSize:12 }}>Note<textarea rows={3} style={{ width:'100%', marginTop:4 }} value={editingBookmark.note||''} onChange={(e)=> setEditingBookmark(prev=>({...prev, note:e.target.value}))} /></label>
              <label style={{ fontSize:12 }}>Color<input type="color" value={editingBookmark.color||'#e2e8f0'} onChange={(e)=> setEditingBookmark(prev=>({...prev, color:e.target.value}))} style={{ marginLeft:8 }} /></label>
              <label style={{ fontSize:12 }}><input type="checkbox" checked={!!editingBookmark.pinned} onChange={(e)=> setEditingBookmark(prev=>({...prev, pinned:e.target.checked}))} /> Pinned</label>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={()=>setEditingBookmark(null)} style={{ border:'1px solid #e2e8f0', background:'transparent', borderRadius:8, padding:'6px 10px', fontSize:12 }}>Cancel</button>
                <button onClick={async ()=>{ try{ await window.electronAPI?.updateBookmarkMeta(editingBookmark.url, { title: editingBookmark.title, tags: editingBookmark.tags, note: editingBookmark.note, color: editingBookmark.color, pinned: !!editingBookmark.pinned }); const list = await window.electronAPI?.getBookmarks(); setBookmarksBar(list||[]); setEditingBookmark(null);} catch{} }} style={{ border:'1px solid #0ea5e9', background:'#0ea5e9', color:'#fff', borderRadius:8, padding:'6px 10px', fontSize:12 }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

    {/* Web Content Area + optional vertical tabs */}
      <div className="content-area" style={{ display: 'flex' }}>
        {(settings?.tabsLayout || 'top') === 'vertical-left' && (
          <div style={{ width: 220, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Tabs</div>
              <button className="new-tab-button" onClick={handleNewTab}>+</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto' }}>
              {displayTabs.map((tab, idx) => (
                <div
                  key={tab.id}
                  className={`tab ${tab.active ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${draggedTabId === tab.id ? 'dragging' : ''}`}
                  onClick={() => handleSwitchTab(tab.id)}
                  onContextMenu={(e) => { e.preventDefault(); setTabMenu({ open: true, x: e.clientX, y: e.clientY, tabId: tab.id }); }}
                  draggable
                  onDragStart={handleTabDragStart(idx)}
                  onDragEnd={handleTabDragEnd}
                  onDragOver={handleTabDragOver(idx)}
                  onDrop={handleTabDrop(idx)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', border: tab.active ? '1px solid var(--border)' : '1px solid transparent', background: tab.active ? 'color-mix(in srgb, var(--panel) 94%, var(--bg))' : 'transparent' }}
                >
                  {tab.favicon && <img src={tab.favicon} alt="" style={{ width: 14, height: 14, borderRadius: 3 }} />}
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{tab.title}</span>
                  {!tab.pinned && (
                    <button className="tab-close" onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}>×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <WebView
          url={currentUrl}
          isLoading={isLoading}
      settings={settings}
          onUrlChange={(url, title) => handleTabUrlChange(activeTabId, url, title)}
          onNavigate={async (url) => {
            if (window.electronAPI) {
              await window.electronAPI.navigateToUrl(url);
            }
            onNavigate(url);
            handleTabUrlChange(activeTabId, url);
          }}
          onOpenFind={setOpenFindFunction}
          onStopAvailable={(fn) => setStopLoadingFn(() => fn)}
          onZoomAvailable={(fns) => setZoomFns(fns)}
          onFaviconChange={(icons) => handleTabFaviconChange(activeTabId, icons)}
          onAudioAvailable={(fns) => setAudioFns(fns)}
          onLoadingChange={(loading) => setPageLoading(!!loading)}
          onProgressChange={(p) => setPageProgress(p || 0)}
          onNavAvailable={(fns) => { navFnsRef.current = fns || {}; }}
          onNavStateChange={(st) => setNavState({ canGoBack: !!st?.canGoBack, canGoForward: !!st?.canGoForward })}
        />
      </div>

      { (settings?.navBarPosition || 'top') === 'bottom' && (
        <NavigationBar
          currentUrl={currentUrl}
          isLoading={pageLoading}
          canGoBack={navState.canGoBack}
          canGoForward={navState.canGoForward}
          settings={settings}
          onNavigate={async (url) => {
            if (window.electronAPI) { await window.electronAPI.navigateToUrl(url); }
            onNavigate(url);
            handleTabUrlChange(activeTabId, url);
          }}
          onGoBack={() => navFnsRef.current?.goBack?.()}
          onGoForward={() => navFnsRef.current?.goForward?.()}
          onReload={() => navFnsRef.current?.reload?.()}
          onStop={() => stopLoadingFn && stopLoadingFn()}
          onShowBookmarks={() => setShowBookmarks(true)}
          onShowHistory={() => setShowHistory(true)}
          onShowDownloads={() => setShowDownloads(true)}
          onOpenFind={() => openFindFunction && openFindFunction()}
          onOpenSettings={() => { try { window.electronAPI?.openSettingsWindow?.(); } catch {} }}
          progress={pageProgress}
        />
      )}

      {/* Bookmarks Panel */}
      <BookmarksPanel
        isOpen={showBookmarks}
        onClose={() => setShowBookmarks(false)}
        onNavigate={async (url) => {
          if (window.electronAPI) {
            await window.electronAPI.navigateToUrl(url);
          }
          onNavigate(url);
          handleTabUrlChange(activeTabId, url);
        }}
      />

      {/* History Panel */}
      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onNavigate={async (url) => {
          if (window.electronAPI) {
            await window.electronAPI.navigateToUrl(url);
          }
          onNavigate(url);
          handleTabUrlChange(activeTabId, url);
        }}
      />

      {/* Downloads Manager */}
      <DownloadsManager
        isOpen={showDownloads}
        onClose={() => setShowDownloads(false)}
      />

  {/* Settings now opens in a separate window */}

      {/* Tab Context Menu */}
      {tabMenu.open && (
        <div className="context-menu" style={{ position: 'fixed', left: tabMenu.x, top: tabMenu.y, zIndex: 1000, minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
          <MenuItem label={(() => {
            const t = tabs.find(t => t.id === tabMenu.tabId);
            return t?.pinned ? 'Unpin tab' : 'Pin tab';
          })()} onClick={() => { handlePinToggle(tabMenu.tabId); setTabMenu({ open: false, x: 0, y: 0, tabId: null }); }} />
          <MenuItem label="Duplicate tab" onClick={() => { handleDuplicateTab(tabMenu.tabId); setTabMenu({ open: false, x: 0, y: 0, tabId: null }); }} />
          <MenuItem label={(settings?.tabsLayout || 'top') === 'vertical-left' ? 'Disable vertical tabs' : 'Enable vertical tabs'} onClick={async () => {
            try {
              const next = { ...(settings || {}), tabsLayout: (settings?.tabsLayout || 'top') === 'vertical-left' ? 'top' : 'vertical-left' };
              await window.electronAPI?.updateSettings?.(next);
              setSettings(next);
            } catch (err) {}
            setTabMenu({ open: false, x: 0, y: 0, tabId: null });
          }} />
          <MenuItem label="Mute tab" onClick={() => {
            handleSwitchTab(tabMenu.tabId);
            setTimeout(() => { audioFns.toggleMute && audioFns.toggleMute(); }, 0);
            setTabMenu({ open: false, x: 0, y: 0, tabId: null });
          }} />
          <hr style={{ border: 'none', height: 1, background: 'var(--border)', margin: '6px 0' }} />
          <MenuItem label="Close tab" onClick={() => { handleCloseTab(tabMenu.tabId); setTabMenu({ open: false, x: 0, y: 0, tabId: null }); }} />
          <MenuItem label="Close others" onClick={() => { handleCloseOthers(tabMenu.tabId); setTabMenu({ open: false, x: 0, y: 0, tabId: null }); }} />
          <MenuItem label="Close tabs to the right" onClick={() => { handleCloseToRight(tabMenu.tabId); setTabMenu({ open: false, x: 0, y: 0, tabId: null }); }} />
        </div>
      )}
    </div>
  );
};

// Lightweight menu item component
const MenuItem = ({ label, onClick }) => (
  <div
    className="menu-item"
    onClick={onClick}
    onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
  >
    {label}
  </div>
);

export default BrowserInterface;
