import React, { useEffect, useRef, useState } from 'react';
import FindInPage from './FindInPage';
import '../styles/WebView.css';

const WebView = ({ url, isLoading, onUrlChange, onNavigate, onOpenFind, onStopAvailable, onZoomAvailable, onFaviconChange, onAudioAvailable }) => {
  const webviewRef = useRef(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showFind, setShowFind] = useState(false);

  // Expose webviewRef to parent via callback
  useEffect(() => {
    if (onOpenFind) {
      onOpenFind(() => setShowFind(true));
    }
  }, [onOpenFind]);

  useEffect(() => {
    if (onStopAvailable) {
      onStopAvailable(() => {
        const webview = webviewRef.current;
        if (webview && webview.stop) webview.stop();
      });
    }
  }, [onStopAvailable]);

  useEffect(() => {
    if (onZoomAvailable) {
      onZoomAvailable({
        zoomIn: () => {
          const webview = webviewRef.current;
          if (!webview) return;
          const current = webview.getZoomFactor();
          webview.setZoomFactor(Math.min(current + 0.1, 3));
        },
        zoomOut: () => {
          const webview = webviewRef.current;
          if (!webview) return;
          const current = webview.getZoomFactor();
          webview.setZoomFactor(Math.max(current - 0.1, 0.25));
        },
        resetZoom: () => {
          const webview = webviewRef.current;
          if (!webview) return;
          webview.setZoomFactor(1);
        }
      });
    }
  }, [onZoomAvailable]);

  useEffect(() => {
    if (onAudioAvailable) {
      onAudioAvailable({
        toggleMute: () => {
          const webview = webviewRef.current;
          if (!webview) return;
          const muted = webview.isAudioMuted();
          webview.setAudioMuted(!muted);
        }
      });
    }
  }, [onAudioAvailable]);

  useEffect(() => {
    // Only set up event listeners if we have a valid URL and webview element
    if (!url || url === 'about:blank' || !webviewRef.current) {
      // Silently bail when there's no actionable URL or ref to avoid log spam during app idle/start page
      return;
    }

  const webview = webviewRef.current;

    // Reset error state when URL changes
    setHasError(false);
    setErrorMessage('');
    setLoadProgress(0);

    // Handle navigation events
    const handleNavigation = async () => {
      try {
        const currentUrl = webview.getURL();
        const title = webview.getTitle();
        console.log('Navigation:', currentUrl, title);
        onUrlChange(currentUrl, title);
        
        // Add to history
        if (window.electronAPI && currentUrl && currentUrl !== 'about:blank') {
          await window.electronAPI.addToHistory(currentUrl, title);
        }
      } catch (error) {
        console.error('Navigation error:', error);
      }
    };

    const handlePageLoad = () => {
      console.log('Page loaded successfully');
      handleNavigation();
      setLoadProgress(100);
      setHasError(false);
    };

    const handlePageTitle = () => {
      handleNavigation();
    };

    const handleLoadProgress = (event) => {
      const progress = Math.round((event?.progress || 0) * 100);
      setLoadProgress(progress);
    };

    const handleLoadStart = () => {
      console.log('Load started');
      setLoadProgress(10);
      setHasError(false);
    };

    const handleLoadStop = () => {
      console.log('Load stopped');
      setLoadProgress(100);
    };

    const handleFailLoad = (event) => {
      const code = event?.errorCode;
      const desc = event?.errorDescription || 'Unknown error';
      const vurl = event?.validatedURL || url;
      console.error('WebView load failed:', { code, desc, url: vurl });
      setHasError(true);
      setErrorMessage(`Failed to load (${code}): ${desc}`);
      setLoadProgress(0);
    };

    // Wait for webview to be ready
    const handleDomReady = () => {
      console.log('WebView DOM ready');
      // Don't set URL here - it's already set via the src attribute
    };

    const handleFaviconUpdated = (event) => {
      if (onFaviconChange) {
        onFaviconChange(event.favicons || []);
      }
    };

    // Handle permission requests (media/fullscreen)
    const handlePermissionRequest = (e) => {
      const p = e?.permission;
      if (["media", "microphone", "camera", "fullscreen", "pointerLock"].includes(p)) {
        try { e.request?.allow(); } catch {}
      } else {
        try { e.request?.deny(); } catch {}
      }
    };

    // Add event listeners
    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleLoadStart);
    webview.addEventListener('did-stop-loading', handleLoadStop);
    webview.addEventListener('did-finish-load', handlePageLoad);
    webview.addEventListener('did-fail-load', handleFailLoad);
    webview.addEventListener('page-title-updated', handlePageTitle);
    webview.addEventListener('did-navigate', handleNavigation);
    webview.addEventListener('did-navigate-in-page', handleNavigation);
    webview.addEventListener('page-favicon-updated', handleFaviconUpdated);
    webview.addEventListener('permissionrequest', handlePermissionRequest);

    // Security: Add console message handler for debugging
    webview.addEventListener('console-message', (e) => {
      if (process.env.NODE_ENV === 'development' && e.level >= 2) {
        console.log('WebView console:', e.message);
      }
    });

    // Load timeout
    const loadTimeout = setTimeout(() => {
      if (loadProgress < 100) {
        console.warn('Page load timeout for:', url);
        setHasError(true);
        setErrorMessage('Page load timeout (30 seconds)');
      }
    }, 30000);

    // URL is already set via the src attribute, no need to set it again

    // Cleanup
    return () => {
      clearTimeout(loadTimeout);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleLoadStart);
      webview.removeEventListener('did-stop-loading', handleLoadStop);
      webview.removeEventListener('did-finish-load', handlePageLoad);
      webview.removeEventListener('did-fail-load', handleFailLoad);
      webview.removeEventListener('page-title-updated', handlePageTitle);
      webview.removeEventListener('did-navigate', handleNavigation);
      webview.removeEventListener('did-navigate-in-page', handleNavigation);
      webview.removeEventListener('page-favicon-updated', handleFaviconUpdated);
  webview.removeEventListener('permissionrequest', handlePermissionRequest);
    };
  }, [url, onUrlChange, onFaviconChange]);

  if (hasError) {
    return (
      <div className="webview-container">
        <div className="error-page">
          <h2>Unable to load page</h2>
          <p>The page at <strong>{url}</strong> could not be loaded.</p>
          {errorMessage && <p className="error-details">{errorMessage}</p>}
          <button onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="webview-container">
      {loadProgress > 0 && loadProgress < 100 && url && url !== 'about:blank' && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading... {Math.round(loadProgress)}%</div>
        </div>
      )}
      
      {!url || url === 'about:blank' ? (
        <div className="start-page">
          <h1>🌤️ NebulaBrowser</h1>
          <p>Simple, private, and fast. Your browsing starts here.</p>
          <p>Tip: Cmd/Ctrl+L to focus the address bar, Cmd/Ctrl+T to open a new tab.</p>
          <div className="quick-actions">
            <button className="quick-action" onClick={() => onNavigate && onNavigate('https://duckduckgo.com')}>🦆 DuckDuckGo</button>
            <button className="quick-action" onClick={() => onNavigate && onNavigate('https://google.com')}>🔍 Google</button>
            <button className="quick-action" onClick={() => onNavigate && onNavigate('https://github.com')}>💻 GitHub</button>
            <button className="quick-action" onClick={() => onNavigate && onNavigate('https://wikipedia.org')}>📚 Wikipedia</button>
            <button className="quick-action" onClick={() => onNavigate && onNavigate('https://youtube.com')}>📺 YouTube</button>
            <button className="quick-action" onClick={() => onNavigate && onNavigate('https://news.ycombinator.com')}>📰 Hacker News</button>
          </div>
        </div>
      ) : (
        <webview
          ref={webviewRef}
          src={url}
          className="webview"
          // Security settings - balance security with compatibility
          nodeintegration="false"
          webpreferences="contextIsolation=true,enableRemoteModule=false,sandbox=false"
          allowpopups
          // Enable JavaScript and modern web features
          plugins="true"
          // Updated user agent for better compatibility with modern websites
          useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
          // Partition for session management
          partition="webview"
          // Enable experimental web platform features
          experimentalfeatures="true"
        />
      )}
      
      <FindInPage
        isOpen={showFind}
        onClose={() => setShowFind(false)}
        webviewRef={webviewRef}
      />
    </div>
  );
};

export default WebView;
