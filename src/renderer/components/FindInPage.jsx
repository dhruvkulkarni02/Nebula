import React, { useState, useEffect } from 'react';
import '../styles/FindInPage.css';

const FindInPage = ({ isOpen, onClose, webviewRef }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);

  useEffect(() => {
    if (isOpen && webviewRef?.current) {
      // Focus the input when opened
      const input = document.querySelector('.find-input');
      if (input) input.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchTerm && webviewRef?.current) {
      performSearch();
    } else if (webviewRef?.current) {
      webviewRef.current.stopFindInPage('clearSelection');
      setCurrentMatch(0);
      setTotalMatches(0);
    }
  }, [searchTerm, caseSensitive]);

  const performSearch = () => {
    if (!webviewRef?.current || !searchTerm) return;

    const options = {
      forward: true,
      findNext: false,
      matchCase: caseSensitive
    };

    webviewRef.current.findInPage(searchTerm, options);
  };

  const findNext = () => {
    if (!webviewRef?.current || !searchTerm) return;

    const options = {
      forward: true,
      findNext: true,
      matchCase: caseSensitive
    };

    webviewRef.current.findInPage(searchTerm, options);
  };

  const findPrevious = () => {
    if (!webviewRef?.current || !searchTerm) return;

    const options = {
      forward: false,
      findNext: true,
      matchCase: caseSensitive
    };

    webviewRef.current.findInPage(searchTerm, options);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleClose = () => {
    if (webviewRef?.current) {
      webviewRef.current.stopFindInPage('clearSelection');
    }
    setSearchTerm('');
    setCurrentMatch(0);
    setTotalMatches(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="find-in-page">
      <div className="find-container">
        <input
          type="text"
          className="find-input"
          placeholder="Find in page..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        
        <div className="find-controls">
          <span className="match-count">
            {searchTerm && totalMatches > 0 ? `${currentMatch}/${totalMatches}` : ''}
          </span>
          
          <button
            className="find-btn"
            onClick={findPrevious}
            disabled={!searchTerm || totalMatches === 0}
            title="Previous match (Shift+Enter)"
          >
            ↑
          </button>
          
          <button
            className="find-btn"
            onClick={findNext}
            disabled={!searchTerm || totalMatches === 0}
            title="Next match (Enter)"
          >
            ↓
          </button>
          
          <button
            className={`find-btn toggle-btn ${caseSensitive ? 'active' : ''}`}
            onClick={() => setCaseSensitive(!caseSensitive)}
            title="Match case"
          >
            Aa
          </button>
          
          <button
            className="find-btn close-btn"
            onClick={handleClose}
            title="Close (Escape)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

export default FindInPage;
