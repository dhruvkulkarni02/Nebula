import React, { useState, useEffect } from 'react';
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

  const handleTabUrlChange = (tabId, newUrl, title = '') => {
    setTabs(prevTabs => 
      prevTabs.map(tab => 
        tab.id === tabId 
          ? { ...tab, url: newUrl, title: title || newUrl }
          : tab
      )
    );
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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTabId, openFindFunction]);

  return (
    <div className="browser-interface">
      {/* Tab Bar */}
      <div className="tab-bar" onDoubleClick={handleNewTab}>
        {tabs.map(tab => (
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
          >
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
        onShowBookmarks={() => setShowBookmarks(true)}
        onShowHistory={() => setShowHistory(true)}
        onShowDownloads={() => setShowDownloads(true)}
        onOpenFind={() => openFindFunction && openFindFunction()}
      />

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
