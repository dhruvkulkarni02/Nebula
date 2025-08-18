import React, { useState, useEffect } from 'react';
import '../styles/BookmarksPanel.css';

const BookmarksPanel = ({ isOpen, onClose, onNavigate }) => {
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

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

  if (!isOpen) return null;

  return (
    <div className="bookmarks-overlay" onClick={onClose}>
      <div className="bookmarks-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bookmarks-header">
          <h3>📚 Bookmarks</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="bookmarks-content">
          {isLoading ? (
            <div className="loading-message">Loading bookmarks...</div>
          ) : bookmarks.length === 0 ? (
            <div className="empty-state">
              <p>No bookmarks yet</p>
              <p>Add bookmarks by clicking the ⭐ button in the address bar</p>
            </div>
          ) : (
            <div className="bookmarks-list">
              {bookmarks.map((bookmark, index) => (
                <div 
                  key={index} 
                  className="bookmark-item"
                  onClick={() => handleBookmarkClick(bookmark.url)}
                >
                  <div className="bookmark-info">
                    <div className="bookmark-title">{bookmark.title || 'Untitled'}</div>
                    <div className="bookmark-url">{bookmark.url}</div>
                  </div>
                  <button 
                    className="remove-bookmark"
                    onClick={(e) => handleRemoveBookmark(bookmark.url, e)}
                    title="Remove bookmark"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookmarksPanel;
