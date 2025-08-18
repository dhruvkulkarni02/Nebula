# NebulaBrowser Project Structure

This document outlines the modular project structure designed to support multiple technology stacks.

## Directory Structure

```
NebulaBrowser/
├── src/                    # Main source code
│   ├── core/              # Core browser engine and logic
│   │   ├── browser_engine/    # Web rendering engine integration
│   │   ├── navigation/        # URL handling, history, navigation
│   │   ├── network/          # HTTP requests, downloads, protocols
│   │   └── security/         # SSL/TLS, certificate handling
│   ├── ui/                # User interface components
│   │   ├── windows/          # Main window, dialogs
│   │   ├── tabs/            # Tab management
│   │   ├── toolbar/         # Navigation bar, address bar
│   │   ├── menu/            # Application menus
│   │   └── components/      # Reusable UI components
│   ├── privacy/           # Privacy and security features
│   │   ├── blockers/        # Ad/tracker blocking
│   │   ├── incognito/       # Private browsing mode
│   │   ├── permissions/     # Site permissions
│   │   └── data_protection/ # Data clearing, encryption
│   ├── storage/           # Data persistence
│   │   ├── bookmarks/       # Bookmark storage
│   │   ├── history/         # Browsing history
│   │   ├── settings/        # User preferences
│   │   └── cache/           # Web cache management
│   └── platform/          # Platform-specific code
│       ├── windows/         # Windows-specific implementations
│       ├── macos/           # macOS-specific implementations
│       └── linux/           # Linux-specific implementations
├── assets/                # Static resources
│   ├── icons/             # Application icons
│   ├── images/            # UI images and graphics
│   └── fonts/             # Custom fonts
├── resources/             # Configuration and data files
│   ├── blocklists/        # Ad/tracker blocking lists
│   ├── certificates/      # SSL certificates
│   └── localization/      # Language files
├── tests/                 # Test suites
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── ui/                # UI automation tests
├── build/                 # Build artifacts and scripts
│   ├── scripts/           # Build automation scripts
│   ├── packaging/         # Platform-specific packaging
│   └── distribution/      # Distribution files
├── docs/                  # Documentation
│   ├── api/               # API documentation
│   ├── architecture/      # Technical architecture docs
│   └── user/              # User documentation
├── config/                # Configuration files
└── tools/                 # Development tools and utilities
```

## Module Responsibilities

### Core (`src/core/`)
- **browser_engine/**: Integration with web rendering engines (Chromium, WebKit, Gecko)
- **navigation/**: URL parsing, validation, history management, session handling
- **network/**: HTTP/HTTPS requests, download management, proxy support
- **security/**: Certificate validation, secure connections, security policies

### UI (`src/ui/`)
- **windows/**: Main application window, popup management
- **tabs/**: Tab creation, switching, closing, tab groups
- **toolbar/**: Address bar, navigation buttons, search
- **menu/**: Application menus, context menus
- **components/**: Buttons, inputs, modals, and other reusable components

### Privacy (`src/privacy/`)
- **blockers/**: Ad blocking, tracker blocking, script blocking
- **incognito/**: Private browsing implementation
- **permissions/**: Camera, microphone, location, notification permissions
- **data_protection/**: Data encryption, secure deletion, privacy settings

### Storage (`src/storage/`)
- **bookmarks/**: Bookmark CRUD operations, organization, import/export
- **history/**: Browsing history storage and retrieval
- **settings/**: User preferences persistence
- **cache/**: Web cache management and cleanup

## Technology Stack Flexibility

This structure supports multiple technology choices:

- **Desktop Frameworks**: Electron, Tauri, Qt, GTK, native platform APIs
- **Languages**: JavaScript/TypeScript, Rust, C++, Python, C#, Go
- **Web Engines**: Chromium (CEF), WebKit, Gecko-based solutions
- **Build Systems**: Webpack, Vite, CMake, Cargo, MSBuild

Each directory can contain technology-specific implementations while maintaining the same interface contracts.
