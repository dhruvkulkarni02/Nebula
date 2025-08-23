import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Defensive global: some guest scripts or injected pages reference `dragEvent`
// accidentally which causes noisy ReferenceErrors in development. Provide a
// benign global and suppress that specific ReferenceError to keep the console
// focused on real issues.
try {
  if (typeof window !== 'undefined' && typeof window.dragEvent === 'undefined') {
    window.dragEvent = null;
  }
  // Suppress the noisy ReferenceError message for dragEvent only.
  window.onerror = (message, source, lineno, colno, error) => {
    try {
      if (typeof message === 'string' && message.includes('dragEvent is not defined')) {
        console.warn('[startup] suppressed benign ReferenceError: dragEvent');
        return true; // prevent default logging
      }
    } catch (e) {}
    return false; // allow default handling for other errors
  };
} catch (e) {}

// Create the root element
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the app
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
