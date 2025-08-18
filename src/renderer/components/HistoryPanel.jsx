import React, { useState, useEffect } from 'react';
import '../styles/HistoryPanel.css';

const HistoryPanel = ({ isOpen, onClose, onNavigate }) => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const historyList = await window.electronAPI.getHistory();
        setHistory(historyList || []);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHistoryClick = (url) => {
    onNavigate(url);
    onClose();
  };

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear all browsing history?')) {
      try {
        if (window.electronAPI) {
          await window.electronAPI.clearHistory();
          setHistory([]);
        }
      } catch (error) {
        console.error('Failed to clear history:', error);
      }
    }
  };

  const filteredHistory = history.filter(item =>
    item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.url?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupHistoryByDate = (historyItems) => {
    const grouped = {};
    historyItems.forEach(item => {
      const date = new Date(item.visitTime).toDateString();
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(item);
    });
    return grouped;
  };

  const groupedHistory = groupHistoryByDate(filteredHistory);

  if (!isOpen) return null;

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h3>📖 Browsing History</h3>
          <div className="header-controls">
            <button className="clear-history-btn" onClick={handleClearHistory}>
              🗑️ Clear History
            </button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        
        <div className="history-search">
          <input
            type="text"
            placeholder="Search history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="history-content">
          {isLoading ? (
            <div className="loading-message">Loading history...</div>
          ) : Object.keys(groupedHistory).length === 0 ? (
            <div className="empty-state">
              <p>No browsing history found</p>
              <p>Start browsing to see your history here</p>
            </div>
          ) : (
            <div className="history-list">
              {Object.entries(groupedHistory).map(([date, items]) => (
                <div key={date} className="history-group">
                  <h4 className="history-date">{date}</h4>
                  {items.map((item, index) => (
                    <div 
                      key={`${date}-${index}`}
                      className="history-item"
                      onClick={() => handleHistoryClick(item.url)}
                    >
                      <div className="history-info">
                        <div className="history-title">{item.title || 'Untitled'}</div>
                        <div className="history-url">{item.url}</div>
                        <div className="history-time">
                          {new Date(item.visitTime).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;
