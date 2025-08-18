import React from 'react';
import '../styles/WebView.css';

const WebView = ({ url, isLoading, onUrlChange }) => {
  if (!url || url === 'about:blank') {
    return (
      <div className="webview-container">
        <div className="start-page">
          <h1>🌟 NebulaBrowser</h1>
          <p>Privacy-focused web browser</p>
          <p>Enter a URL in the address bar to start browsing</p>
          <p className="debug-info">Current URL: {url || 'none'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="webview-container">
      <div className="browser-view-container">
        <div className="browser-view-placeholder">
          <div className="loading-message">
            <h2>🔧 Development Mode</h2>
            <p>URL: {url}</p>
            <p>BrowserView integration coming soon...</p>
            <p>Status: {isLoading ? 'Loading...' : 'Ready'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebView;
