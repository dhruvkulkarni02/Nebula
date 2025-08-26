// Example step configuration for NebulaBrowser onboarding
// Each step defines: id, title, description, selector (CSS) for highlight, optional placement override

export const defaultOnboardingSteps = [
  {
    id: 'tabs',
    title: 'Manage & Reorganize Tabs',
    description: 'Open, close, and reorder tabs. To enable vertical tabs, right-click any tab and select "Enable vertical tabs" from the menu.',
    // Highlight horizontal tab at first, then vertical tab after layout change
    dynamicSelector: () => {
      // If vertical tabs are enabled, highlight the first vertical tab only
      const verticalTab = document.querySelector('.tab-sidebar .tab, .vertical-tabs .tab, [data-tab-layout="vertical"] .tab, .content-area .sidebar .tab');
      if (verticalTab) return verticalTab;
      // Otherwise, highlight the first horizontal tab only
      return document.querySelector('.tab-bar .tab.active') || document.querySelector('.tab-bar .tab');
    },
    // Completion: vertical layout active only (robust selector)
    isComplete: () => !!document.querySelector('.tab-sidebar, .vertical-tabs, [data-tab-layout="vertical"], .content-area .sidebar'),
    requireAction: true, // user must enable vertical tabs through context menu
  },
  {
    id: 'search',
    title: 'Search & Navigate',
    description: 'Use the address bar to search or enter a URL. Press ⌘/Ctrl+L to jump there instantly.',
    selector: '.address-bar input, .address-bar .url-input, .url-input',
    // Completion now triggered by Cmd/Ctrl+L shortcut (handled in provider) or if input receives programmatic focus.
    isComplete: () => {
      const el = document.activeElement;
      return !!(el && (el.matches?.('.address-bar input, .address-bar .url-input, .url-input')));
    },
    requireAction: true
  },
  {
    id: 'customize',
    title: 'Customize Start Page',
    description: 'Add or rearrange tiles for quick access to favorite sites.',
    // Highlight the explicit Add Tile button for clearer affordance; switches to modal when clicked
    selector: '.start-page button[title="Add a site to Home"]',
    // During tile add process, highlight the modal instead
    dynamicSelector: () => {
      const modal = document.querySelector('[style*="position:fixed"][style*="display:flex"][style*="align-items:center"]');
      if (modal) return modal;
      return document.querySelector('.start-page button[title="Add a site to Home"]');
    },
    isComplete: () => !!document.querySelector('.start-page button[aria-label]'), // a tile exists
    requireAction: true // user must add at least one tile
  },
  {
    id: 'settings',
    title: 'Settings & Actions',
    description: 'Access preferences and advanced features here.',
    selector: 'button[title="Settings"], .menu-button[title="Settings"]',
    isComplete: () => {
      // Check if settings window/panel is open
      return !!(document.querySelector('.settings-window, .settings-panel') || 
               window.location.search.includes('settingsWindow=1'));
    },
    requireAction: true // user must open Settings (click Settings button)
  },
  {
    id: 'privacy',
    title: 'Privacy Features',
    description: 'Nebula blocks intrusive ads & trackers. You can adjust this anytime in Settings.',
    selector: null, // no specific UI anchor, center the panel
    requireAction: false // informational step, no action required
  },
  {
    id: 'finish',
    title: 'You\'re all set!',
    description: 'Enjoy faster, private browsing. Have a stellar journey ✨',
    selector: null,
    final: true
  }
];
