import React, { useState, useEffect } from 'react';
import '../styles/DownloadsManager.css';

const DownloadsManager = ({ isOpen, onClose }) => {
  const [downloads, setDownloads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const loadDownloads = async () => {
      setIsLoading(true);
      try {
        if (window.electronAPI) {
          const downloadList = await window.electronAPI.getDownloads();
          setDownloads(downloadList || []);
        }
      } catch (error) {
        console.error('Failed to load downloads:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    const onStart = (_e, d) => {
      setDownloads(prev => [{ ...d }, ...prev]);
    };
    const onProgress = (_e, p) => {
      setDownloads(prev => prev.map(d => d.id === p.id ? { ...d, ...p } : d));
    };
    const onComplete = (_e, c) => {
      setDownloads(prev => prev.map(d => d.id === c.id ? { ...d, ...c } : d));
    };

    loadDownloads();
    window.electronAPI?.onDownloadStarted(onStart);
    window.electronAPI?.onDownloadProgress(onProgress);
    window.electronAPI?.onDownloadComplete(onComplete);

    return () => {
      mounted = false;
      window.electronAPI?.removeDownloadStartedListener(onStart);
      window.electronAPI?.removeDownloadProgressListener(onProgress);
      window.electronAPI?.removeDownloadCompleteListener(onComplete);
    };
  }, [isOpen]);

  const updateDownloadProgress = (downloadId, progress) => {
    setDownloads(prev => prev.map(download => 
      download.id === downloadId 
        ? { ...download, ...progress }
        : download
    ));
  };

  const handleOpenFile = async (filePath) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.openDownload(filePath);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleShowInFolder = async (filePath) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.showDownloadInFolder(filePath);
      }
    } catch (error) {
      console.error('Failed to show in folder:', error);
    }
  };

  const handleClearDownloads = async () => {
    if (window.confirm('Clear all download history?')) {
      try {
        if (window.electronAPI) {
          await window.electronAPI.clearDownloads();
          setDownloads([]);
        }
      } catch (error) {
        console.error('Failed to clear downloads:', error);
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes < 0) return '—';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now - time) / (1000 * 60 * 60));
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return time.toLocaleDateString();
  };

  const getFileIcon = (fileName = '') => {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const iconMap = { pdf: '📄', doc: '📝', docx: '📝', txt: '📝', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬', mp3: '🎵', wav: '🎵', flac: '🎵', zip: '📦', rar: '📦', '7z': '📦', exe: '⚙️', dmg: '⚙️', pkg: '⚙️', default: '📁' };
    return iconMap[ext] || iconMap.default;
  };

  if (!isOpen) return null;

  return (
    <div className="downloads-overlay" onClick={onClose}>
      <div className="downloads-panel" onClick={(e) => e.stopPropagation()}>
        <div className="downloads-header">
          <h3>📥 Downloads</h3>
          <div className="header-controls">
            <button className="clear-downloads-btn" onClick={handleClearDownloads}>🗑️ Clear</button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="downloads-content">
          {isLoading ? (
            <div className="loading-state"><div className="loading-spinner"></div><p>Loading downloads...</p></div>
          ) : downloads.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📥</div><h4>No downloads yet</h4><p>Downloaded files will appear here</p></div>
          ) : (
            <div className="downloads-list">
              {downloads.map((download) => (
                <div key={download.id} className={`download-item ${download.state}`}>
                  <div className="download-icon">{getFileIcon(download.filename)}</div>
                  <div className="download-info">
                    <div className="download-name" title={download.filename}>{download.filename || '—'}</div>
                    <div className="download-details">
                      <span className="download-size">{formatFileSize(download.totalBytes)}</span>
                      <span className="download-time">{formatTimeAgo(download.startTime)}</span>
                      {download.url ? (<span className="download-url" title={download.url}>from {(() => { try { return new URL(download.url).hostname; } catch { return ''; } })()}</span>) : null}
                    </div>
                    {download.state === 'progressing' && download.totalBytes > 0 && (
                      <div className="download-progress">
                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%` }}></div></div>
                        <span className="progress-text">{Math.round((download.receivedBytes / download.totalBytes) * 100)}%</span>
                      </div>
                    )}
                  </div>
                  <div className="download-actions">
                    {download.state === 'completed' && (
                      <>
                        <button className="action-btn primary" onClick={() => handleOpenFile(download.savePath)} title="Open file">📂 Open</button>
                        <button className="action-btn secondary" onClick={() => handleShowInFolder(download.savePath)} title="Show in folder">📁 Show</button>
                      </>
                    )}
                    {download.state === 'progressing' && (<button className="action-btn secondary" disabled>⏳ Downloading...</button>)}
                    {download.state === 'interrupted' && (<button className="action-btn danger">❌ Failed</button>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DownloadsManager;
