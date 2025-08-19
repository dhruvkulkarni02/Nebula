import React, { useState, useEffect, useMemo } from 'react';
import '../styles/BookmarksPanel.css';

const BookmarksPanel = ({ isOpen, onClose, onNavigate }) => {
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadBookmarks();
    }
  }, [isOpen]);

  const loadBookmarks = async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const bookmarkList = await window.electronAPI.getBookmarks();
        setBookmarks(bookmarkList || []);
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBookmarkClick = (url) => {
    onNavigate(url);
    onClose();
  };

  const handleRemoveBookmark = async (url, event) => {
    event.stopPropagation();
    try {
      if (window.electronAPI) {
        await window.electronAPI.removeBookmark(url);
        await loadBookmarks(); // Refresh the list
      }
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter(b => (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q));
  }, [bookmarks, query]);

  if (!isOpen) return null;

  return (
    <div className="bookmarks-overlay" onClick={onClose}>
      <div className="bookmarks-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bookmarks-header">
          <h3>📚 Bookmarks</h3>
          <div className="bookmarks-header-actions">
            <input
              className="bookmark-search"
              placeholder="Search bookmarks"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="close-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>
        
        <div className="bookmarks-content">
          {isLoading ? (
            <div className="loading-message">Loading bookmarks...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h4>No bookmarks found</h4>
              <p>{bookmarks.length ? 'Try a different search.' : 'Add bookmarks by clicking the ⭐ in the address bar.'}</p>
            </div>
          ) : (
            <div className="bookmarks-grid">
              {filtered.map((b, i) => {
                let hostname = '';
                try { hostname = new URL(b.url).hostname.replace(/^www\./, ''); } catch {}
                let faviconSrc = '';
                try { faviconSrc = new URL('/favicon.ico', new URL(b.url).origin).toString(); } catch {}
                return (
                  <div
                    key={`${b.url}-${i}`}
                    className="bookmark-card"
                    onClick={() => handleBookmarkClick(b.url)}
                    title={b.title || b.url}
                  >
                    <div className="bookmark-card-header">
                      <img className="bookmark-favicon" src={faviconSrc} alt="" onError={(e)=>{ e.currentTarget.style.display='none'; const fallback = e.currentTarget.nextSibling; if (fallback) fallback.style.display='inline-flex'; }} />
                      <span className="bookmark-favicon-fallback" aria-hidden>
                        {(hostname || (b.title || '?')).charAt(0).toUpperCase()}
                      </span>
                      <div className="bookmark-texts">
                        <div className="bookmark-title">{b.title || 'Untitled'}</div>
                        <div className="bookmark-host">{hostname}</div>
                      </div>
                      <button
                        className="bookmark-delete"
                        onClick={(e) => handleRemoveBookmark(b.url, e)}
                        title="Remove bookmark"
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="bookmark-url" aria-hidden>{b.url}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookmarksPanel;
