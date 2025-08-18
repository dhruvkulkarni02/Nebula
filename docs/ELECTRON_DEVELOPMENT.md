# NebulaBrowser Electron Development Guide

## Architecture Overview

NebulaBrowser is built using Electron with a React frontend and secure IPC communication between the main and renderer processes.

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   main.js       │  │   preload.js    │  │  IPC Handlers│ │
│  │ - App lifecycle │  │ - Secure bridge │  │ - Navigation │ │
│  │ - Window mgmt   │  │ - Context isolation │ - Bookmarks │ │
│  │ - Security      │  │ - API exposure  │  │ - Privacy    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │ IPC
┌─────────────────────────────────────────────────────────────┐
│                 Renderer Process (Chromium)                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │    React App    │  │   Components    │  │   WebView    │ │
│  │ - App.jsx       │  │ - BrowserInterface │ - Web content│ │
│  │ - State mgmt    │  │ - NavigationBar │  │ - Security   │ │
│  │ - Event handling│  │ - TabManager    │  │ - Isolation  │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── main/                    # Main process (Node.js)
│   ├── main.js             # App entry point, window management
│   ├── preload.js          # Secure IPC bridge
│   └── handlers/           # IPC request handlers (future)
└── renderer/               # Renderer process (React)
    ├── main.jsx            # React entry point
    ├── App.jsx             # Main app component
    ├── components/         # React components
    │   ├── BrowserInterface.jsx  # Main browser UI
    │   ├── NavigationBar.jsx     # URL bar and controls
    │   ├── WebView.jsx           # Web content display
    │   └── TabManager.jsx        # Tab management (future)
    └── styles/             # CSS stylesheets
```

## Security Implementation

### Current Security Features

1. **Context Isolation**: Renderer process cannot access Node.js APIs
2. **No Node Integration**: Node.js disabled in renderer for security
3. **Secure Preload**: Limited API exposure through contextBridge
4. **Web Security**: Standard web security policies enabled
5. **Content Security Policy**: CSP headers in HTML
6. **Window Controls**: Popup blocking and navigation restrictions

### Security Configuration (main.js)

```javascript
webPreferences: {
  nodeIntegration: false,        // Critical: Disable Node in renderer
  contextIsolation: true,        // Critical: Isolate contexts
  enableRemoteModule: false,     // Critical: Disable remote module
  preload: path.join(__dirname, 'preload.js'),
  webSecurity: true,             // Keep web security
  allowRunningInsecureContent: false
}
```

## Development Workflow

### 1. **Milestone 1: Basic Web Rendering** ✅ (Current)
**Status**: Implemented with basic functionality

**Completed**:
- Main window with webview
- URL input and navigation
- Basic tab support
- Loading indicators
- Navigation controls (back/forward/reload/home)

**Current Limitations**:
- No actual web engine integration (using webview tag)
- No history persistence
- No bookmark functionality

### 2. **Next Steps for Milestone 1 Completion**

1. **Enhanced Web Engine Integration**:
   ```bash
   npm install electron-webview-events
   ```

2. **Proper Navigation History**:
   - Implement history stack in main process
   - Add IPC handlers for navigation state

3. **Error Handling**:
   - Add network error pages
   - Implement timeout handling
   - SSL certificate error handling

### 3. **Running the Development Environment**

```bash
# Install dependencies
npm install

# Start development mode (hot reload)
npm run dev

# This will:
# 1. Start Vite dev server on localhost:3000
# 2. Launch Electron with dev tools open
# 3. Enable hot reload for UI changes
```

### 4. **Building for Production**

```bash
# Build renderer process
npm run build:renderer

# Build complete application
npm run build

# The built app will be in the dist/ directory
```

## Upcoming Privacy Features (Milestones 5-6)

### Ad/Tracker Blocking Architecture

```javascript
// Future implementation in main process
session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  const url = details.url;
  const isBlocked = adBlocker.shouldBlock(url);
  
  callback({ 
    cancel: isBlocked,
    redirectURL: isBlocked ? 'data:text/plain,' : undefined
  });
});
```

### Private Browsing Implementation

```javascript
// Future private session creation
const privateSession = session.fromPartition('private', {
  cache: false,
  persist: false
});
```

## Code Quality Standards

### ESLint Configuration
- React/JSX rules
- Security-focused rules
- Electron-specific rules

### Testing Strategy
- **Unit Tests**: Component testing with Jest
- **Integration Tests**: IPC communication testing
- **E2E Tests**: Full browser workflow testing
- **Security Tests**: Permission and isolation testing

## Common Issues & Solutions

### 1. **WebView Tag Issues**
```javascript
// Enable webview tag in main process
app.whenReady().then(() => {
  session.defaultSession.webSecurity = false; // Only for development
});
```

### 2. **IPC Communication Errors**
```javascript
// Always handle IPC errors in preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  navigate: (url) => {
    try {
      return ipcRenderer.invoke('navigate', url);
    } catch (error) {
      console.error('Navigation error:', error);
      return Promise.reject(error);
    }
  }
});
```

### 3. **CSS Loading Issues**
Ensure Vite configuration properly handles CSS imports:
```javascript
// vite.config.js
export default defineConfig({
  // ... other config
  css: {
    modules: false // For global CSS
  }
});
```

## Performance Optimization

### Memory Management
- Limit number of active tabs
- Implement tab suspension for inactive tabs
- Regular garbage collection triggers

### Bundle Size Optimization
- Use Electron Builder for efficient packaging
- Implement code splitting for renderer process
- Optimize asset loading

## Security Roadmap

### Phase 1 (Current): Basic Security
- ✅ Context isolation
- ✅ No node integration
- ✅ Secure preload script

### Phase 2 (Milestone 5): Content Security
- 🔄 Ad/tracker blocking
- 🔄 Content filtering
- 🔄 Permission management

### Phase 3 (Milestone 6): Privacy Features
- 🔄 Private browsing sessions
- 🔄 Data encryption
- 🔄 Secure data deletion

### Phase 4 (Milestone 7-8): Advanced Security
- 🔄 Certificate pinning
- 🔄 HTTPS enforcement
- 🔄 Security audit logging

## Contributing Guidelines

1. **Security First**: All changes must maintain or improve security
2. **Performance**: Consider memory and CPU impact
3. **Privacy**: Default to privacy-preserving options
4. **Testing**: Add tests for new functionality
5. **Documentation**: Update this guide for architectural changes

## Debugging

### Development Tools
```bash
# Enable debug mode
export DEBUG=nebula:*
npm run dev
```

### Main Process Debugging
```bash
# Debug main process
npm run dev -- --inspect=9229
```

### Security Debugging
```javascript
// In main.js - temporary debugging
console.log('Security settings:', {
  nodeIntegration: webPreferences.nodeIntegration,
  contextIsolation: webPreferences.contextIsolation,
  webSecurity: webPreferences.webSecurity
});
```

Ready to build a secure, privacy-focused browser! 🚀🔒
