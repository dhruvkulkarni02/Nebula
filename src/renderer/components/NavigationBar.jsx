import React, { useState, useEffect } from 'react';
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
  onShowBookmarks,
  onShowHistory,
  onOpenFind,
  onShowDownloads
}) => {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isBookmarked, setIsBookmarked] = useState(false);

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
      const input = document.querySelector('.url-input');
      if (input) {
        input.focus();
        input.select();
      }
    };
    window.addEventListener('focus-address-bar', focusHandler);
    return () => window.removeEventListener('focus-address-bar', focusHandler);
  }, []);

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
      } else {
        // Treat as search query
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }
    
    onNavigate(url);
    setUrlInput(url);
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
        
        <button
      className="reload-button"
          onClick={onReload}
          disabled={isLoading}
          title="Reload"
        >
      {isLoading ? '⏳' : '🔄'}
        </button>
        
        <button
          className="nav-button"
          onClick={handleHomeClick}
          title="Home"
        >
          🏠
        </button>
      </div>

      <form className="address-bar" onSubmit={handleUrlSubmit}>
        {currentUrl && currentUrl !== 'about:blank' && (
          <div className="security-indicator secure">
            🔒
          </div>
        )}
        <input
          type="text"
          className="url-input"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter URL or search term"
        />
        {isLoading && <div className="loading-indicator">⏳</div>}
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
