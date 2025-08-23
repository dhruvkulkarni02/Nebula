import React, { useState, useRef, useEffect } from 'react';
import './SpatialNavigation.css';

const SpatialNavigation = ({ 
  tabs = [], 
  activeTabId, 
  onTabSelect, 
  onTabClose, 
  isEnabled = false 
}) => {
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: -500 });
  const [isNavigating, setIsNavigating] = useState(false);
  const containerRef = useRef(null);
  const animationRef = useRef(null);

  // Add some sample tabs if none provided
  const defaultTabs = [
    { id: 'current', title: 'Current Page', url: 'about:blank', favicon: null },
    { id: 'google', title: 'Google', url: 'https://google.com', favicon: '🔍' },
    { id: 'github', title: 'GitHub', url: 'https://github.com', favicon: '🐙' },
    { id: 'youtube', title: 'YouTube', url: 'https://youtube.com', favicon: '📺' },
    { id: 'reddit', title: 'Reddit', url: 'https://reddit.com', favicon: '🤖' }
  ];
  
  const effectiveTabs = tabs.length > 0 ? tabs : defaultTabs;

  // Calculate positions for tabs in 3D space
  const calculateTabPositions = () => {
    const radius = 300;
    const positions = [];
    
    effectiveTabs.forEach((tab, index) => {
      const angle = (index / effectiveTabs.length) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (index % 3 - 1) * 100; // Distribute tabs across 3 levels
      
      positions.push({
        id: tab.id,
        x,
        y,
        z,
        title: tab.title || 'Untitled',
        url: tab.url,
        favicon: tab.favicon,
        isActive: tab.id === activeTabId
      });
    });
    
    return positions;
  };

  const tabPositions = calculateTabPositions();

  // Handle mouse movement for camera control
  const handleMouseMove = (e) => {
    if (!isNavigating) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const deltaX = (mouseX - centerX) / centerX;
    const deltaY = (mouseY - centerY) / centerY;
    
    setCameraPosition(prev => ({
      x: prev.x + deltaX * 10,
      y: prev.y - deltaY * 10,
      z: prev.z
    }));
  };

  // Handle wheel for zoom
  const handleWheel = (e) => {
    e.preventDefault();
    setCameraPosition(prev => ({
      ...prev,
      z: Math.max(-1000, Math.min(-100, prev.z + e.deltaY * 2))
    }));
  };

  // Focus on specific tab
  const focusOnTab = (tabPosition) => {
    const targetX = -tabPosition.x * 0.5;
    const targetY = -tabPosition.y * 0.5;
    const targetZ = -300;
    
    // Smooth animation to target position
    const startPos = { ...cameraPosition };
    const startTime = Date.now();
    const duration = 800;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      setCameraPosition({
        x: startPos.x + (targetX - startPos.x) * easeOut,
        y: startPos.y + (targetY - startPos.y) * easeOut,
        z: startPos.z + (targetZ - startPos.z) * easeOut
      });
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        onTabSelect(tabPosition.id);
      }
    };
    
    animate();
  };

  // Handle tab click
  const handleTabClick = (tabPosition) => {
    if (tabPosition.isActive) {
      // If clicking active tab, exit spatial mode
      setIsNavigating(false);
    } else {
      focusOnTab(tabPosition);
    }
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!isEnabled) return null;

  return (
    <div 
      ref={containerRef}
      className={`spatial-navigation ${isNavigating ? 'navigating' : ''}`}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onMouseEnter={() => setIsNavigating(true)}
      onMouseLeave={() => setIsNavigating(false)}
    >
      <div 
        className="spatial-scene"
        style={{
          transform: `translate3d(${cameraPosition.x}px, ${cameraPosition.y}px, ${cameraPosition.z}px)`
        }}
      >
        {tabPositions.map((tab) => (
          <div
            key={tab.id}
            className={`spatial-tab ${tab.isActive ? 'active' : ''}`}
            style={{
              transform: `translate3d(${tab.x}px, ${tab.y}px, ${tab.z}px)`
            }}
            onClick={() => handleTabClick(tab)}
          >
            <div className="tab-planet">
              <div className="tab-surface">
                {tab.favicon && (
                  <img src={tab.favicon} alt="" className="tab-favicon" />
                )}
              </div>
              <div className="tab-atmosphere"></div>
              <div className="tab-glow"></div>
            </div>
            <div className="tab-label">
              <div className="tab-title">{tab.title}</div>
              <div className="tab-url">{new URL(tab.url || 'https://example.com').hostname}</div>
            </div>
            <button 
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      
      <div className="spatial-controls">
        <div className="control-hint">
          <span>🖱️ Move mouse to navigate</span>
          <span>🖱️ Scroll to zoom</span>
          <span>🖱️ Click planets to visit</span>
        </div>
        <button 
          className="exit-spatial"
          onClick={() => setIsNavigating(false)}
        >
          Exit Spatial Mode
        </button>
      </div>

      <div className="constellation-background">
        {Array.from({ length: 100 }).map((_, i) => (
          <div
            key={i}
            className="star"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default SpatialNavigation;
