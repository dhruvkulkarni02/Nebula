import React, { useState, useEffect } from 'react';
import '../styles/DownloadsManager.css';

const DownloadsManager = ({ isOpen, onClose }) => {
  const [downloads, setDownloads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDownloads();
      // Set up download progress listener (will be implemented when download system is added)
      // if (window.electronAPI) {
      //   window.electronAPI.onDownloadProgress((event, progress) => {
      //     updateDownloadProgress(progress.id, progress);
      //   });
      // }
    }
  }, [isOpen]);

  const loadDownloads = async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const downloadList = await window.electronAPI.getDownloads();
        
        // If no downloads exist, create some sample data for demonstration
        if (!downloadList || downloadList.length === 0) {
          const sampleDownloads = [
            {
              id: 'download-1',
              filename: 'example-document.pdf',
              url: 'https://example.com/document.pdf',
              filePath: '/Users/Downloads/example-document.pdf',
              totalBytes: 2048576,
              receivedBytes: 2048576,
              state: 'completed',
              startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
              endTime: new Date(Date.now() - 3500000).toISOString()
            },
            {
              id: 'download-2',
              filename: 'image-gallery.zip',
              url: 'https://example.com/images.zip',
              filePath: '/Users/Downloads/image-gallery.zip',
              totalBytes: 10485760,
              receivedBytes: 7340032,
              state: 'progressing',
              startTime: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
              endTime: null
            },
            {
              id: 'download-3',
              filename: 'presentation.pptx',
              url: 'https://example.com/presentation.pptx',
              filePath: '/Users/Downloads/presentation.pptx',
              totalBytes: 5242880,
              receivedBytes: 1048576,
              state: 'interrupted',
              startTime: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
              endTime: null
            }
          ];
          setDownloads(sampleDownloads);
        } else {
          setDownloads(downloadList);
        }
      }
    } catch (error) {
      console.error('Failed to load downloads:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now - time) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return time.toLocaleDateString();
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconMap = {
      pdf: '📄', doc: '📝', docx: '📝', txt: '📝',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️',
      mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬',
      mp3: '🎵', wav: '🎵', flac: '🎵',
      zip: '📦', rar: '📦', '7z': '📦',
      exe: '⚙️', dmg: '⚙️', pkg: '⚙️',
      default: '📁'
    };
    return iconMap[ext] || iconMap.default;
  };

  if (!isOpen) return null;

  return (
    <div className="downloads-overlay" onClick={onClose}>
      <div className="downloads-panel" onClick={(e) => e.stopPropagation()}>
        <div className="downloads-header">
          <h3>📥 Downloads</h3>
          <div className="header-controls">
            <button className="clear-downloads-btn" onClick={handleClearDownloads}>
              🗑️ Clear
            </button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        
        <div className="downloads-content">
          {isLoading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading downloads...</p>
            </div>
          ) : downloads.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📥</div>
              <h4>No downloads yet</h4>
              <p>Downloaded files will appear here</p>
            </div>
          ) : (
            <div className="downloads-list">
              {downloads.map((download) => (
                <div key={download.id} className={`download-item ${download.state}`}>
                  <div className="download-icon">
                    {getFileIcon(download.filename)}
                  </div>
                  
                  <div className="download-info">
                    <div className="download-name" title={download.filename}>
                      {download.filename}
                    </div>
                    <div className="download-details">
                      <span className="download-size">
                        {download.totalBytes ? formatFileSize(download.totalBytes) : 'Unknown size'}
                      </span>
                      <span className="download-time">
                        {formatTimeAgo(download.startTime)}
                      </span>
                      <span className="download-url" title={download.url}>
                        from {new URL(download.url).hostname}
                      </span>
                    </div>
                    
                    {download.state === 'progressing' && (
                      <div className="download-progress">
                        <div className="progress-bar">
                          <div 
                            className="progress-fill"
                            style={{ width: `${(download.receivedBytes / download.totalBytes) * 100}%` }}
                          ></div>
                        </div>
                        <span className="progress-text">
                          {Math.round((download.receivedBytes / download.totalBytes) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="download-actions">
                    {download.state === 'completed' && (
                      <>
                        <button 
                          className="action-btn primary"
                          onClick={() => handleOpenFile(download.savePath)}
                          title="Open file"
                        >
                          📂 Open
                        </button>
                        <button 
                          className="action-btn secondary"
                          onClick={() => handleShowInFolder(download.savePath)}
                          title="Show in folder"
                        >
                          📁 Show
                        </button>
                      </>
                    )}
                    {download.state === 'progressing' && (
                      <button className="action-btn secondary" disabled>
                        ⏳ Downloading...
                      </button>
                    )}
                    {download.state === 'interrupted' && (
                      <button className="action-btn danger">
                        ❌ Failed
                      </button>
                    )}
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
