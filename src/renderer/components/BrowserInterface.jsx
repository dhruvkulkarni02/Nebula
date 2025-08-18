import React, { useState, useEffect, useMemo, useRef } from 'react';
import NavigationBar from './NavigationBar';
import WebView from './WebView';
import BookmarksPanel from './BookmarksPanel';
import HistoryPanel from './HistoryPanel';
import DownloadsManager from './DownloadsManager';
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
    { id: 1, url: currentUrl || 'about:blank', title: 'New Tab', active: true }
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [openFindFunction, setOpenFindFunction] = useState(null);
  const [showBookmarksBar, setShowBookmarksBar] = useState(true);
  const [bookmarksBar, setBookmarksBar] = useState([]);
  const [bookmarkQuery, setBookmarkQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        if (window.electronAPI) {
          const list = await window.electronAPI.getBookmarks();
          setBookmarksBar(list || []);
        }
      } catch {}
    };
    load();
  }, []);

  const filteredBookmarks = useMemo(() => {
    const q = bookmarkQuery.trim().toLowerCase();
    if (!q) return bookmarksBar;
    return bookmarksBar.filter(b => (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q));
  }, [bookmarksBar, bookmarkQuery]);
  const [stopLoadingFn, setStopLoadingFn] = useState(null);
  const [zoomFns, setZoomFns] = useState({ zoomIn: null, zoomOut: null, resetZoom: null });
  const [audioFns, setAudioFns] = useState({ toggleMute: null });
  const [closedTabs, setClosedTabs] = useState([]);
  const dragIndexRef = useRef(null);
  const importInputRef = useRef(null);

  // Restore last session tabs from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nebula.session.tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.tabs) && parsed.tabs.length) {
          setTabs(parsed.tabs.map(t => ({
            id: t.id || Date.now(),
            url: t.url || 'about:blank',
            title: t.title || 'New Tab',
            active: !!t.active,
            favicon: t.favicon || null
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

  const handleNewTab = () => {
    const newTab = {
      id: Date.now(),
      url: 'about:blank',
      title: 'New Tab',
      active: false
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
      // If no tabs left, close the browser window
      if (typeof window !== 'undefined' && window.close) {
        window.close();
      }
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
  const handleTabDragStart = (index) => (e) => {
    dragIndexRef.current = index;
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
    if (from == null || from === to) return;
    setTabs(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  };

  const handleTabUrlChange = (tabId, newUrl, title = '') => {
    setTabs(prevTabs => 
      prevTabs.map(tab => 
        tab.id === tabId 
          ? { ...tab, url: newUrl, title: title || newUrl }
          : tab
      )
    );
  };

  const handleTabFaviconChange = (tabId, favicons) => {
    const favicon = Array.isArray(favicons) && favicons.length ? favicons[0] : null;
    setTabs(prevTabs => prevTabs.map(tab => tab.id === tabId ? { ...tab, favicon } : tab));
  };

  // Quality of life keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const meta = e.metaKey || e.ctrlKey; // support mac and windows
      // New Tab: Cmd/Ctrl+T
      if (meta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleNewTab();
        return;
      }
      // Close Tab: Cmd/Ctrl+W
      if (meta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleCloseTab(activeTabId);
        return;
      }
      // Focus Address Bar: Cmd/Ctrl+L
      if (meta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        window.dispatchEvent(new Event('focus-address-bar'));
        return;
      }
      // Find in Page: Cmd/Ctrl+F
      if (meta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (openFindFunction) openFindFunction();
        return;
      }

      // Reopen closed tab: Cmd/Ctrl+Shift+T
      if (meta && e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const reopened = closedTabs[0];
        if (reopened) {
          setClosedTabs(prev => prev.slice(1));
          const newId = Date.now();
          const tab = { ...reopened, id: newId, active: true };
          setTabs(prev => [...prev.map(t => ({ ...t, active: false })), tab]);
          setActiveTabId(newId);
          onNavigate(tab.url || 'about:blank');
        }
        return;
      }

      // Cycle tabs: Ctrl/Cmd+Tab (next) and Ctrl/Cmd+Shift+Tab (prev)
      if (meta && e.key === 'Tab') {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx === -1) return;
        const delta = e.shiftKey ? -1 : 1;
        const nextIdx = (idx + delta + tabs.length) % tabs.length;
        const nextTab = tabs[nextIdx];
        handleSwitchTab(nextTab.id);
        return;
      }

      // Switch to tab by number: Cmd/Ctrl+1..8 (nth), 9 (last)
      if (meta && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (!Number.isNaN(num)) {
          e.preventDefault();
          const targetIdx = num === 9 ? tabs.length - 1 : Math.max(0, Math.min(num - 1, tabs.length - 1));
          const target = tabs[targetIdx];
          if (target) handleSwitchTab(target.id);
          return;
        }
      }

      // Zoom controls: Cmd/Ctrl + '+', '-', '0'
      if (meta && !e.shiftKey && !e.altKey) {
        if (e.key === '=' || e.key === '+') { // zoom in
          e.preventDefault();
          zoomFns.zoomIn && zoomFns.zoomIn();
          return;
        }
        if (e.key === '-') { // zoom out
          e.preventDefault();
          zoomFns.zoomOut && zoomFns.zoomOut();
          return;
        }
        if (e.key === '0') { // reset zoom
          e.preventDefault();
          zoomFns.resetZoom && zoomFns.resetZoom();
          return;
        }
        if (e.key.toLowerCase() === 'm') { // mute/unmute
          e.preventDefault();
          audioFns.toggleMute && audioFns.toggleMute();
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTabId, openFindFunction, tabs, zoomFns, audioFns, closedTabs]);

  return (
    <div className="browser-interface">
      {/* Tab Bar */}
      <div className="tab-bar" onDoubleClick={handleNewTab}>
        {tabs.map((tab, idx) => (
          <div
            key={tab.id}
            className={`tab ${tab.active ? 'active' : ''}`}
            onClick={() => handleSwitchTab(tab.id)}
            onMouseDown={(e) => {
              // Middle-click closes tab
              if (e.button === 1) {
                e.preventDefault();
                handleCloseTab(tab.id);
              }
            }}
            draggable
            onDragStart={handleTabDragStart(idx)}
            onDragOver={handleTabDragOver(idx)}
            onDrop={handleTabDrop(idx)}
          >
            {tab.favicon && <img src={tab.favicon} alt="" style={{ width: 14, height: 14, marginRight: 8, borderRadius: 3 }} />}
            <span className="tab-title">{tab.title}</span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="new-tab-button" onClick={handleNewTab}>
          +
        </button>
      </div>

      {/* Navigation Bar */}
      <NavigationBar
        currentUrl={currentUrl}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onNavigate={async (url) => {
          if (window.electronAPI) {
            await window.electronAPI.navigateToUrl(url);
          }
          onNavigate(url);
          handleTabUrlChange(activeTabId, url);
        }}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
  onReload={onReload}
  onStop={() => stopLoadingFn && stopLoadingFn()}
        onShowBookmarks={() => setShowBookmarks(true)}
        onShowHistory={() => setShowHistory(true)}
        onShowDownloads={() => setShowDownloads(true)}
        onOpenFind={() => openFindFunction && openFindFunction()}
      />

      {/* Bookmarks Bar */}
      {showBookmarksBar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
          <span style={{ fontSize: 12, color: '#64748b', marginRight: 8 }}>Bookmarks</span>
          <input
            value={bookmarkQuery}
            onChange={(e) => setBookmarkQuery(e.target.value)}
            placeholder="Search bookmarks"
            style={{ flex: '0 0 220px', background: '#f9fafb', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {filteredBookmarks.slice(0, 50).map((b, i) => (
              <button
                key={`${b.url}-${i}`}
                onClick={async () => {
                  if (window.electronAPI) await window.electronAPI.navigateToUrl(b.url);
                  onNavigate(b.url);
                  handleTabUrlChange(activeTabId, b.url, b.title);
                }}
                title={b.title || b.url}
                style={{
                  background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#334155',
                  borderRadius: 10, padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap'
                }}
              >
                ⭐ {b.title || b.url}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              title="Export bookmarks"
              onClick={async () => { try { await window.electronAPI?.exportBookmarks(); } catch {} }}
              style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
            >
              ⬇️ Export
            </button>
            <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                  const text = await f.text();
                  const data = JSON.parse(text);
                  const res = await window.electronAPI?.importBookmarksData(data);
                  if (res?.success) {
                    const list = await window.electronAPI?.getBookmarks();
                    setBookmarksBar(list || []);
                  }
                } catch {}
                e.target.value = '';
              }}
            />
            <button
              title="Import bookmarks (JSON)"
              onClick={() => importInputRef.current?.click()}
              style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
            >
              ⬆️ Import
            </button>
            <button
              title="Toggle bookmarks bar"
              onClick={() => setShowBookmarksBar(v => !v)}
              style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
            >
              🧰 Toggle
            </button>
          </div>
        </div>
      )}

      {/* Web Content Area */}
      <div className="content-area">
        <WebView
          url={currentUrl}
          isLoading={isLoading}
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
        />
      </div>

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
    </div>
  );
};

export default BrowserInterface;
