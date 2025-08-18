import React, { useState, useEffect } from 'react';
import BrowserInterface from './components/BrowserInterface';
import './styles/App.css';
import './styles/DownloadsManager.css';

function App() {
  const [currentUrl, setCurrentUrl] = useState(''); // Start with empty URL to avoid navigation loop
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Initialize app
  useEffect(() => {
    console.log('🚀 NebulaBrowser App component mounted - STARTING UP!');
    console.log('electronAPI available:', !!window.electronAPI);
    console.log('Current URL:', currentUrl);
    console.log('User Agent:', navigator.userAgent);
    
    // Set up event listeners for navigation updates
    if (window.electronAPI) {
      window.electronAPI.onNavigation((event, data) => {
        setCurrentUrl(data.url || '');
      });

      window.electronAPI.onLoadingState((event, data) => {
        setIsLoading(data.isLoading);
        setCanGoBack(data.canGoBack || false);
        setCanGoForward(data.canGoForward || false);
      });
    }

    // Cleanup listeners on unmount
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeNavigationListener(() => {});
        window.electronAPI.removeLoadingStateListener(() => {});
      }
    };
  }, []);

  const handleNavigate = async (url) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.navigateToUrl(url);
      }
      setCurrentUrl(url);
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  const handleGoBack = async () => {
    if (window.electronAPI) {
      await window.electronAPI.goBack();
    }
  };

  const handleGoForward = async () => {
    if (window.electronAPI) {
      await window.electronAPI.goForward();
    }
  };

  const handleReload = async () => {
    if (window.electronAPI) {
      await window.electronAPI.reload();
    }
  };

  return (
    <div className="app">
      <BrowserInterface
        currentUrl={currentUrl}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onNavigate={handleNavigate}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
      />
    </div>
  );
}

export default App;
