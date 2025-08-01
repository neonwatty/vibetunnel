import { html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// Terminal-specific quick keys for mobile use
const TERMINAL_QUICK_KEYS = [
  // First row
  { key: 'Escape', label: 'Esc', row: 1 },
  { key: 'Control', label: 'Ctrl', modifier: true, row: 1 },
  { key: 'CtrlExpand', label: '⌃', toggle: true, row: 1 },
  { key: 'F', label: 'F', toggle: true, row: 1 },
  { key: 'Tab', label: 'Tab', row: 1 },
  { key: 'shift_tab', label: '⇤', row: 1 },
  { key: 'ArrowUp', label: '↑', arrow: true, row: 1 },
  { key: 'ArrowDown', label: '↓', arrow: true, row: 1 },
  { key: 'ArrowLeft', label: '←', arrow: true, row: 1 },
  { key: 'ArrowRight', label: '→', arrow: true, row: 1 },
  { key: 'PageUp', label: 'PgUp', row: 1 },
  { key: 'PageDown', label: 'PgDn', row: 1 },
  // Second row
  { key: 'Home', label: 'Home', row: 2 },
  { key: 'Paste', label: 'Paste', row: 2 },
  { key: 'End', label: 'End', row: 2 },
  { key: 'Delete', label: 'Del', row: 2 },
  { key: '`', label: '`', row: 2 },
  { key: '~', label: '~', row: 2 },
  { key: '|', label: '|', row: 2 },
  { key: '/', label: '/', row: 2 },
  { key: '\\', label: '\\', row: 2 },
  { key: '-', label: '-', row: 2 },
  { key: 'Done', label: 'Done', special: true, row: 2 },
  // Third row - additional special characters
  { key: 'Option', label: '⌥', modifier: true, row: 3 },
  { key: 'Command', label: '⌘', modifier: true, row: 3 },
  { key: 'Ctrl+C', label: '^C', combo: true, row: 3 },
  { key: 'Ctrl+Z', label: '^Z', combo: true, row: 3 },
  { key: "'", label: "'", row: 3 },
  { key: '"', label: '"', row: 3 },
  { key: '{', label: '{', row: 3 },
  { key: '}', label: '}', row: 3 },
  { key: '[', label: '[', row: 3 },
  { key: ']', label: ']', row: 3 },
  { key: '(', label: '(', row: 3 },
  { key: ')', label: ')', row: 3 },
];

// Common Ctrl key combinations
const CTRL_SHORTCUTS = [
  { key: 'Ctrl+D', label: '^D', combo: true, description: 'EOF/logout' },
  { key: 'Ctrl+L', label: '^L', combo: true, description: 'Clear screen' },
  { key: 'Ctrl+R', label: '^R', combo: true, description: 'Reverse search' },
  { key: 'Ctrl+W', label: '^W', combo: true, description: 'Delete word' },
  { key: 'Ctrl+U', label: '^U', combo: true, description: 'Clear line' },
  { key: 'Ctrl+A', label: '^A', combo: true, description: 'Start of line' },
  { key: 'Ctrl+E', label: '^E', combo: true, description: 'End of line' },
  { key: 'Ctrl+K', label: '^K', combo: true, description: 'Kill to EOL' },
  { key: 'CtrlFull', label: 'Ctrl…', special: true, description: 'Full Ctrl UI' },
];

// Function keys F1-F12
const FUNCTION_KEYS = Array.from({ length: 12 }, (_, i) => ({
  key: `F${i + 1}`,
  label: `F${i + 1}`,
  func: true,
}));

@customElement('terminal-quick-keys')
export class TerminalQuickKeys extends LitElement {
  createRenderRoot() {
    return this;
  }

  @property({ type: Function }) onKeyPress?: (
    key: string,
    isModifier?: boolean,
    isSpecial?: boolean,
    isToggle?: boolean,
    pasteText?: string
  ) => void;
  @property({ type: Boolean }) visible = false;

  @state() private showFunctionKeys = false;
  @state() private showCtrlKeys = false;
  @state() private isLandscape = false;

  private keyRepeatInterval: number | null = null;
  private keyRepeatTimeout: number | null = null;
  private orientationHandler: (() => void) | null = null;

  // Chord system state
  private activeModifiers = new Set<string>();

  connectedCallback() {
    super.connectedCallback();
    // Check orientation on mount
    this.checkOrientation();

    // Set up orientation change listener
    this.orientationHandler = () => {
      this.checkOrientation();
    };

    window.addEventListener('resize', this.orientationHandler);
    window.addEventListener('orientationchange', this.orientationHandler);
  }

  private checkOrientation() {
    // Consider landscape if width is greater than height
    // and width is more than 600px (typical phone landscape width)
    this.isLandscape = window.innerWidth > window.innerHeight && window.innerWidth > 600;
  }

  private getButtonSizeClass(label: string): string {
    if (label.length >= 4) {
      // Long text: compact with max-width constraint
      return this.isLandscape ? 'px-0.5 py-1 flex-1 max-w-14' : 'px-0.5 py-1.5 flex-1 max-w-16';
    } else if (label.length === 3) {
      // Medium text: slightly more padding, larger max-width
      return this.isLandscape ? 'px-1 py-1 flex-1 max-w-16' : 'px-1 py-1.5 flex-1 max-w-18';
    } else {
      // Short text: can grow freely
      return this.isLandscape ? 'px-1 py-1 flex-1' : 'px-1 py-1.5 flex-1';
    }
  }

  private getButtonFontClass(label: string): string {
    if (label.length >= 4) {
      return 'quick-key-btn-xs'; // 8px
    } else if (label.length === 3) {
      return 'quick-key-btn-small'; // 10px
    } else {
      return 'quick-key-btn-medium'; // 13px
    }
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
  }

  private handleKeyPress(
    key: string,
    isModifier = false,
    isSpecial = false,
    isToggle = false,
    event?: Event
  ) {
    // Prevent default to avoid any focus loss
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (isToggle && key === 'F') {
      // Toggle function keys display
      this.showFunctionKeys = !this.showFunctionKeys;
      this.showCtrlKeys = false; // Hide Ctrl keys if showing
      return;
    }

    if (isToggle && key === 'CtrlExpand') {
      // Toggle Ctrl shortcuts display
      this.showCtrlKeys = !this.showCtrlKeys;
      this.showFunctionKeys = false; // Hide function keys if showing
      return;
    }

    // If we're showing function keys and a function key is pressed, hide them
    if (this.showFunctionKeys && key.startsWith('F') && key !== 'F') {
      this.showFunctionKeys = false;
    }

    // If we're showing Ctrl keys and a Ctrl shortcut is pressed (not CtrlFull), hide them
    if (this.showCtrlKeys && key.startsWith('Ctrl+')) {
      this.showCtrlKeys = false;
    }

    // Handle modifier keys for chord system
    if (isModifier && key === 'Option') {
      // If Option is already active, clear it
      if (this.activeModifiers.has('Option')) {
        this.activeModifiers.delete('Option');
      } else {
        // Add Option to active modifiers
        this.activeModifiers.add('Option');
      }
      // Request update to reflect visual state change
      this.requestUpdate();
      return; // Don't send Option key immediately
    }

    // Check for Option+Arrow chord combinations
    if (this.activeModifiers.has('Option') && key.startsWith('Arrow')) {
      // Clear only the Option modifier after use
      this.activeModifiers.delete('Option');
      this.requestUpdate();

      // Send the Option+Arrow combination
      if (this.onKeyPress) {
        // Send Option (ESC) first
        this.onKeyPress('Option', true, false);
        // Then send the arrow key
        this.onKeyPress(key, false, false);
      }
      return;
    }

    // If any non-arrow key is pressed while Option is active, clear Option
    if (this.activeModifiers.has('Option') && !key.startsWith('Arrow')) {
      this.activeModifiers.clear();
      this.requestUpdate();
    }

    if (this.onKeyPress) {
      this.onKeyPress(key, isModifier, isSpecial);
    }
  }

  private handlePasteImmediate(_e: Event) {
    console.log('[QuickKeys] Paste button touched - delegating to paste handler');

    // Always delegate to the main paste handler in direct-keyboard-manager
    // This preserves user gesture context while keeping all clipboard logic in one place
    if (this.onKeyPress) {
      this.onKeyPress('Paste', false, false);
    }
  }

  private startKeyRepeat(key: string, isModifier: boolean, isSpecial: boolean) {
    // Only enable key repeat for arrow keys
    if (!key.startsWith('Arrow')) return;

    // Clear any existing repeat
    this.stopKeyRepeat();

    // Send first key immediately
    if (this.onKeyPress) {
      this.onKeyPress(key, isModifier, isSpecial);
    }

    // Start repeat after 500ms initial delay
    this.keyRepeatTimeout = window.setTimeout(() => {
      // Repeat every 50ms
      this.keyRepeatInterval = window.setInterval(() => {
        if (this.onKeyPress) {
          this.onKeyPress(key, isModifier, isSpecial);
        }
      }, 50);
    }, 500);
  }

  private stopKeyRepeat() {
    if (this.keyRepeatTimeout) {
      clearTimeout(this.keyRepeatTimeout);
      this.keyRepeatTimeout = null;
    }
    if (this.keyRepeatInterval) {
      clearInterval(this.keyRepeatInterval);
      this.keyRepeatInterval = null;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopKeyRepeat();

    // Clean up orientation listener
    if (this.orientationHandler) {
      window.removeEventListener('resize', this.orientationHandler);
      window.removeEventListener('orientationchange', this.orientationHandler);
      this.orientationHandler = null;
    }
  }

  private renderStyles() {
    return html`
      <style>
        
        /* Quick keys container - positioned above keyboard */
        .terminal-quick-keys-container {
          position: fixed;
          left: 0;
          right: 0;
          /* Default to bottom of screen */
          bottom: 0;
          z-index: 999999;
          /* Ensure it stays on top */
          isolation: isolate;
          /* Smooth transition when keyboard appears/disappears */
          transition: bottom 0.3s ease-out;
          background-color: rgb(var(--color-bg-secondary));
        }
        
        /* The actual bar with buttons */
        .quick-keys-bar {
          background: rgb(var(--color-bg-secondary));
          border-top: 1px solid rgb(var(--color-border-base));
          padding: 0.25rem 0.25rem;
          /* Prevent iOS from adding its own styling */
          -webkit-appearance: none;
          appearance: none;
          /* Add shadow for visibility */
          box-shadow: 0 -2px 10px rgb(var(--color-bg-secondary) / 0.5);
        }
        
        /* Quick key buttons */
        .quick-key-btn {
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
          /* Ensure buttons are clickable */
          touch-action: manipulation;
        }
        
        /* Modifier key styling */
        .modifier-key {
          background-color: rgb(var(--color-bg-tertiary));
          border-color: rgb(var(--color-border-base));
        }
        
        .modifier-key:hover {
          background-color: rgb(var(--color-bg-secondary));
        }
        
        /* Active modifier styling */
        .modifier-key.active {
          background-color: rgb(var(--color-primary));
          border-color: rgb(var(--color-primary));
          color: rgb(var(--color-text-bright));
        }
        
        .modifier-key.active:hover {
          background-color: rgb(var(--color-primary-hover));
        }
        
        /* Arrow key styling */
        .arrow-key {
          font-size: 1rem;
          padding: 0.375rem 0.5rem;
        }
        
        /* Medium font for short character buttons */
        .quick-key-btn-medium {
          font-size: 13px;
        }
        
        /* Small font for mobile keyboard buttons */
        .quick-key-btn-small {
          font-size: 10px;
        }
        
        /* Extra small font for long text buttons */
        .quick-key-btn-xs {
          font-size: 8px;
        }
        
        /* Max width constraints for buttons */
        .max-w-14 {
          max-width: 3.5rem; /* 56px */
        }
        
        .max-w-16 {
          max-width: 4rem; /* 64px */
        }
        
        .max-w-18 {
          max-width: 4.5rem; /* 72px */
        }
        
        
        /* Combo key styling (like ^C, ^Z) */
        .combo-key {
          background-color: rgb(var(--color-bg-tertiary));
          border-color: rgb(var(--color-border-accent));
        }
        
        .combo-key:hover {
          background-color: rgb(var(--color-bg-secondary));
        }
        
        /* Special key styling (like ABC) */
        .special-key {
          background-color: rgb(var(--color-primary));
          border-color: rgb(var(--color-primary));
          color: rgb(var(--color-text-bright));
        }
        
        .special-key:hover {
          background-color: rgb(var(--color-primary-hover));
        }
        
        /* Function key styling */
        .func-key-btn {
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
        }
        
        /* Toggle button styling */
        .toggle-key {
          background-color: rgb(var(--color-bg-secondary));
          border-color: rgb(var(--color-border-accent));
        }
        
        .toggle-key:hover {
          background-color: rgb(var(--color-bg-tertiary));
        }
        
        .toggle-key.active {
          background-color: rgb(var(--color-primary));
          border-color: rgb(var(--color-primary));
          color: rgb(var(--color-text-bright));
        }
        
        .toggle-key.active:hover {
          background-color: rgb(var(--color-primary-hover));
        }
        
        /* Ctrl shortcut button styling */
        .ctrl-shortcut-btn {
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
        }
        
        /* Landscape mode adjustments */
        @media (orientation: landscape) and (max-width: 926px) {
          .quick-keys-bar {
            padding: 0.2rem 0.2rem;
          }
        }
      </style>
    `;
  }

  render() {
    if (!this.visible) return '';

    // Use the same layout for all mobile devices (phones and tablets)
    return html`
      <div 
        class="terminal-quick-keys-container"
        @mousedown=${(e: Event) => e.preventDefault()}
        @touchstart=${(e: Event) => e.preventDefault()}
      >
        <div class="quick-keys-bar">
          <!-- Row 1 -->
          <div class="flex gap-0.5 justify-center mb-0.5">
            ${TERMINAL_QUICK_KEYS.filter((k) => k.row === 1).map(
              ({ key, label, modifier, arrow, toggle }) => html`
                <button
                  type="button"
                  tabindex="-1"
                  class="quick-key-btn ${this.getButtonFontClass(label)} min-w-0 ${this.getButtonSizeClass(label)} bg-tertiary text-primary font-mono rounded border border-base hover:bg-surface hover:border-primary transition-all whitespace-nowrap ${modifier ? 'modifier-key' : ''} ${arrow ? 'arrow-key' : ''} ${toggle ? 'toggle-key' : ''} ${toggle && ((key === 'CtrlExpand' && this.showCtrlKeys) || (key === 'F' && this.showFunctionKeys)) ? 'active' : ''} ${modifier && key === 'Option' && this.activeModifiers.has('Option') ? 'active' : ''}"
                  @mousedown=${(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  @touchstart=${(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Start key repeat for arrow keys
                    if (arrow) {
                      this.startKeyRepeat(key, modifier || false, false);
                    }
                  }}
                  @touchend=${(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Stop key repeat
                    if (arrow) {
                      this.stopKeyRepeat();
                    } else {
                      this.handleKeyPress(key, modifier, false, toggle, e);
                    }
                  }}
                  @touchcancel=${(_e: Event) => {
                    // Also stop on touch cancel
                    if (arrow) {
                      this.stopKeyRepeat();
                    }
                  }}
                  @click=${(e: MouseEvent) => {
                    if (e.detail !== 0 && !arrow) {
                      this.handleKeyPress(key, modifier, false, toggle, e);
                    }
                  }}
                >
                  ${label}
                </button>
              `
            )}
          </div>
          
          <!-- Row 2 or Function Keys or Ctrl Shortcuts -->
          ${
            this.showCtrlKeys
              ? html`
              <!-- Ctrl shortcuts row -->
              <div class="flex gap-0.5 justify-between flex-wrap mb-0.5">
                ${CTRL_SHORTCUTS.map(
                  ({ key, label, combo, special }) => html`
                    <button
                      type="button"
                      tabindex="-1"
                      class="ctrl-shortcut-btn ${this.getButtonFontClass(label)} min-w-0 ${this.getButtonSizeClass(label)} bg-tertiary text-primary font-mono rounded border border-base hover:bg-surface hover:border-primary transition-all whitespace-nowrap ${combo ? 'combo-key' : ''} ${special ? 'special-key' : ''}"
                      @mousedown=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      @touchstart=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      @touchend=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleKeyPress(key, false, special, false, e);
                      }}
                      @click=${(e: MouseEvent) => {
                        if (e.detail !== 0) {
                          this.handleKeyPress(key, false, special, false, e);
                        }
                      }}
                    >
                      ${label}
                    </button>
                  `
                )}
              </div>
            `
              : this.showFunctionKeys
                ? html`
              <!-- Function keys row -->
              <div class="flex gap-0.5 justify-between mb-0.5">
                ${FUNCTION_KEYS.map(
                  ({ key, label }) => html`
                    <button
                      type="button"
                      tabindex="-1"
                      class="func-key-btn ${this.getButtonFontClass(label)} min-w-0 ${this.getButtonSizeClass(label)} bg-tertiary text-primary font-mono rounded border border-base hover:bg-surface hover:border-primary transition-all whitespace-nowrap"
                      @mousedown=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      @touchstart=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      @touchend=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleKeyPress(key, false, false, false, e);
                      }}
                      @click=${(e: MouseEvent) => {
                        if (e.detail !== 0) {
                          this.handleKeyPress(key, false, false, false, e);
                        }
                      }}
                    >
                      ${label}
                    </button>
                  `
                )}
              </div>
            `
                : html`
              <!-- Regular row 2 -->
              <div class="flex gap-0.5 justify-center mb-0.5">
                ${TERMINAL_QUICK_KEYS.filter((k) => k.row === 2).map(
                  ({ key, label, modifier, combo, special, toggle }) => html`
                    <button
                      type="button"
                      tabindex="-1"
                      class="quick-key-btn ${this.getButtonFontClass(label)} min-w-0 ${this.getButtonSizeClass(label)} bg-tertiary text-primary font-mono rounded border border-base hover:bg-surface hover:border-primary transition-all whitespace-nowrap ${modifier ? 'modifier-key' : ''} ${combo ? 'combo-key' : ''} ${special ? 'special-key' : ''} ${toggle ? 'toggle-key' : ''} ${toggle && this.showFunctionKeys ? 'active' : ''}"
                      @mousedown=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      @touchstart=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      @touchend=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (key === 'Paste') {
                          this.handlePasteImmediate(e);
                        } else {
                          this.handleKeyPress(key, modifier || combo, special, toggle, e);
                        }
                      }}
                      @click=${(e: MouseEvent) => {
                        if (e.detail !== 0) {
                          this.handleKeyPress(key, modifier || combo, special, toggle, e);
                        }
                      }}
                    >
                      ${label}
                    </button>
                  `
                )}
              </div>
            `
          }
          
          <!-- Row 3 - Additional special characters (always visible) -->
          <div class="flex gap-0.5 justify-center">
            ${TERMINAL_QUICK_KEYS.filter((k) => k.row === 3).map(
              ({ key, label, modifier, combo, special }) => html`
                <button
                  type="button"
                  tabindex="-1"
                  class="quick-key-btn ${this.getButtonFontClass(label)} min-w-0 ${this.getButtonSizeClass(label)} bg-tertiary text-primary font-mono rounded border border-base hover:bg-surface hover:border-primary transition-all whitespace-nowrap ${modifier ? 'modifier-key' : ''} ${combo ? 'combo-key' : ''} ${special ? 'special-key' : ''} ${modifier && key === 'Option' && this.activeModifiers.has('Option') ? 'active' : ''}"
                  @mousedown=${(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  @touchstart=${(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  @touchend=${(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleKeyPress(key, modifier || combo, special, false, e);
                  }}
                  @click=${(e: MouseEvent) => {
                    if (e.detail !== 0) {
                      this.handleKeyPress(key, modifier || combo, special, false, e);
                    }
                  }}
                >
                  ${label}
                </button>
              `
            )}
          </div>
        </div>
      </div>
      ${this.renderStyles()}
    `;
  }
}
