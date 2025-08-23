import React, { useState, useEffect, useRef } from 'react';
import './FlowState.css';

const FlowState = ({ 
  isEnabled = false, 
  webviewRef, 
  onFlowStateChange 
}) => {
  const [flowLevel, setFlowLevel] = useState(0); // 0-100
  const [isInFlow, setIsInFlow] = useState(false);
  const [focusTime, setFocusTime] = useState(0);
  const [distractionLevel, setDistractionLevel] = useState(0);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [breathingCue, setBreathingCue] = useState({ show: false, phase: 'inhale' });
  
  const flowTimerRef = useRef(null);
  const breathingTimerRef = useRef(null);
  const activityMonitorRef = useRef(null);

  // Monitor user activity to determine flow state
  useEffect(() => {
    if (!isEnabled || !webviewRef?.current) return;

    const webview = webviewRef.current;
    let scrollActivity = 0;
    let clickActivity = 0;
    let lastScrollTime = 0;
    let lastClickTime = 0;

    const handleScroll = () => {
      const now = Date.now();
      scrollActivity++;
      lastScrollTime = now;
      setLastActivityTime(now);
      
      // Smooth scrolling indicates focus
      if (now - lastScrollTime < 100) {
        setDistractionLevel(prev => Math.max(0, prev - 2));
      }
    };

    const handleClick = () => {
      const now = Date.now();
      clickActivity++;
      lastClickTime = now;
      setLastActivityTime(now);
      
      // Rapid clicking indicates distraction
      if (now - lastClickTime < 500) {
        setDistractionLevel(prev => Math.min(100, prev + 5));
      }
    };

    const handleMouseMove = () => {
      setLastActivityTime(Date.now());
    };

    // Try to add event listeners to webview
    try {
      webview.addEventListener('scroll', handleScroll);
      webview.addEventListener('click', handleClick);
      webview.addEventListener('mousemove', handleMouseMove);
    } catch (e) {
      console.warn('Could not attach flow state listeners to webview:', e);
    }

    // Monitor activity patterns
    activityMonitorRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityTime;
      
      // Calculate flow based on activity patterns
      let newFlowLevel = flowLevel;
      
      if (timeSinceActivity < 30000) { // Active within 30 seconds
        if (scrollActivity > 0 && clickActivity < 3) {
          // Reading/scrolling behavior suggests focus
          newFlowLevel = Math.min(100, newFlowLevel + 2);
        } else if (clickActivity > 5) {
          // Lots of clicking suggests distraction
          newFlowLevel = Math.max(0, newFlowLevel - 3);
        }
      } else if (timeSinceActivity > 60000) {
        // No activity for over a minute
        newFlowLevel = Math.max(0, newFlowLevel - 1);
      }
      
      // Apply distraction penalty
      newFlowLevel = Math.max(0, newFlowLevel - distractionLevel * 0.1);
      
      setFlowLevel(newFlowLevel);
      
      // Determine if in flow state
      const inFlow = newFlowLevel > 60;
      if (inFlow !== isInFlow) {
        setIsInFlow(inFlow);
        onFlowStateChange?.(inFlow, newFlowLevel);
      }
      
      // Reset counters
      scrollActivity = 0;
      clickActivity = 0;
    }, 5000);

    return () => {
      try {
        webview.removeEventListener('scroll', handleScroll);
        webview.removeEventListener('click', handleClick);
        webview.removeEventListener('mousemove', handleMouseMove);
      } catch (e) {}
      
      if (activityMonitorRef.current) {
        clearInterval(activityMonitorRef.current);
      }
    };
  }, [isEnabled, webviewRef?.current, flowLevel, isInFlow, lastActivityTime]);

  // Track focus time
  useEffect(() => {
    if (!isInFlow) return;

    flowTimerRef.current = setInterval(() => {
      setFocusTime(prev => prev + 1);
    }, 1000);

    return () => {
      if (flowTimerRef.current) {
        clearInterval(flowTimerRef.current);
      }
    };
  }, [isInFlow]);

  // Breathing cue for flow enhancement
  const startBreathingCue = () => {
    let phase = 'inhale';
    let count = 0;
    
    setBreathingCue({ show: true, phase });
    
    breathingTimerRef.current = setInterval(() => {
      count++;
      if (count % 4 === 0) {
        phase = phase === 'inhale' ? 'exhale' : 'inhale';
        setBreathingCue({ show: true, phase });
      }
      
      if (count >= 32) { // 8 breathing cycles
        setBreathingCue({ show: false, phase: 'inhale' });
        clearInterval(breathingTimerRef.current);
      }
    }, 1000);
  };

  // Inject flow-enhancing styles into the webview
  useEffect(() => {
    if (!isEnabled || !webviewRef?.current || !isInFlow) return;

    const webview = webviewRef.current;
    const flowLevel = Math.min(100, Math.max(0, flowLevel));
    
    const flowScript = `
      (() => {
        try {
          if (window.__nebulaFlowInjected) return;
          window.__nebulaFlowInjected = true;
          
          const flowLevel = ${flowLevel};
          const style = document.createElement('style');
          style.id = 'nebula-flow-state';
          
          // Gradually fade distracting elements as flow increases
          const opacity = 1 - (flowLevel / 200);
          const blur = flowLevel / 50;
          
          style.textContent = \`
            /* Fade distracting elements */
            .ad, .advertisement, .sidebar, .popup, .modal,
            [class*="ad-"], [class*="popup"], [class*="banner"],
            header nav, .navigation, .menu, .social-share {
              opacity: \${opacity} !important;
              filter: blur(\${blur}px) !important;
              transition: all 2s ease !important;
            }
            
            /* Enhance reading experience */
            article, main, .content, .post-content, .article-body,
            p, h1, h2, h3, h4, h5, h6 {
              line-height: 1.7 !important;
              transition: line-height 1s ease !important;
            }
            
            /* Soften harsh colors */
            * {
              filter: saturate(\${1 - flowLevel / 200}) !important;
            }
            
            /* Reduce motion for focus */
            *, *::before, *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          \`;
          
          document.head.appendChild(style);
        } catch (e) {}
      })();
    `;

    try {
      webview.executeJavaScript(flowScript).catch(() => {});
    } catch (e) {
      console.warn('Could not inject flow state styles:', e);
    }

    return () => {
      try {
        const removeScript = `
          (() => {
            const style = document.getElementById('nebula-flow-state');
            if (style) style.remove();
            window.__nebulaFlowInjected = false;
          })();
        `;
        webview.executeJavaScript(removeScript).catch(() => {});
      } catch (e) {}
    };
  }, [isEnabled, webviewRef?.current, isInFlow, flowLevel]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!isEnabled) return null;

  return (
    <div className={`flow-state-overlay ${isInFlow ? 'in-flow' : ''}`}>
      {/* Flow State Indicator */}
      <div className="flow-indicator">
        <div className="flow-meter">
          <div 
            className="flow-level"
            style={{ height: `${flowLevel}%` }}
          />
        </div>
        <div className="flow-status">
          <div className="flow-text">
            {isInFlow ? '🌊 Flow State' : '🎯 Focus Mode'}
          </div>
          <div className="flow-time">
            {isInFlow && `⏱️ ${formatTime(focusTime)}`}
          </div>
        </div>
      </div>

      {/* Breathing Cue */}
      {breathingCue.show && (
        <div className={`breathing-cue ${breathingCue.phase}`}>
          <div className="breathing-circle">
            <div className="breathing-text">
              {breathingCue.phase === 'inhale' ? 'Breathe In' : 'Breathe Out'}
            </div>
          </div>
        </div>
      )}

      {/* Flow Controls */}
      <div className="flow-controls">
        <button 
          className="breathing-button"
          onClick={startBreathingCue}
          title="Start breathing exercise"
        >
          🫁 Breathe
        </button>
        
        <button 
          className="focus-boost"
          onClick={() => {
            setFlowLevel(prev => Math.min(100, prev + 10));
            setDistractionLevel(0);
          }}
          title="Boost focus"
        >
          ⚡ Focus
        </button>
      </div>

      {/* Flow Achievements */}
      {focusTime > 0 && focusTime % 300 === 0 && ( // Every 5 minutes
        <div className="flow-achievement">
          <div className="achievement-content">
            🏆 Flow Achievement!
            <br />
            {focusTime >= 1800 ? 'Deep Focus Master' : 
             focusTime >= 900 ? 'Focus Warrior' : 
             'Focus Apprentice'}
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowState;
