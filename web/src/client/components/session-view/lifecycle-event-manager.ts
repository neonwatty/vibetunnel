/**
 * Lifecycle & Event Manager for Session View
 *
 * Manages the lifecycle events, keyboard/touch handlers, preferences, and
 * overall event coordination for the session view component.
 */

import type { Session } from '../../../shared/types.js';
import { isBrowserShortcut } from '../../utils/browser-shortcuts.js';
import { consumeEvent } from '../../utils/event-utils.js';
import { createLogger } from '../../utils/logger.js';
import { type LifecycleEventManagerCallbacks, ManagerEventEmitter } from './interfaces.js';

// Extend Window interface to include our custom property
declare global {
  interface Window {
    __deviceType?: 'phone' | 'tablet' | 'desktop';
  }
}

interface AppPreferences {
  useDirectKeyboard: boolean;
  showLogLink: boolean;
  touchKeyboardPreference?: 'auto' | 'always' | 'never';
}

const logger = createLogger('lifecycle-event-manager');

// Re-export the interface for backward compatibility
export type { LifecycleEventManagerCallbacks } from './interfaces.js';

export class LifecycleEventManager extends ManagerEventEmitter {
  private callbacks: LifecycleEventManagerCallbacks | null = null;
  private session: Session | null = null;
  private touchStartX = 0;
  private touchStartY = 0;

  // Event listener tracking
  private keyboardListenerAdded = false;
  private touchListenersAdded = false;
  private visualViewportHandler: (() => void) | null = null;
  private clickHandler: (() => void) | null = null;

  // Touch detection results cache
  private touchCapabilityCache: {
    hasTouch: boolean;
    isCoarsePointer: boolean;
    hasFinePointer: boolean;
    hasHover: boolean;
  } | null = null;

  // Session view element reference
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Used in setSessionViewElement and detectSystemCapabilities
  private sessionViewElement: HTMLElement | null = null;

  constructor() {
    super();
    logger.log('LifecycleEventManager initialized');
  }

  setSessionViewElement(element: HTMLElement): void {
    this.sessionViewElement = element;
  }

  setCallbacks(callbacks: LifecycleEventManagerCallbacks): void {
    this.callbacks = callbacks;
  }

  setSession(session: Session | null): void {
    this.session = session;
  }

  /**
   * Detect touch capabilities using multiple signals
   */
  private detectTouchCapabilities() {
    if (this.touchCapabilityCache) {
      return this.touchCapabilityCache;
    }

    const hasTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      ((navigator as Navigator & { msMaxTouchPoints?: number }).msMaxTouchPoints ?? 0) > 0 ||
      window.matchMedia?.('(any-pointer: coarse)').matches === true;

    const isCoarsePointer = window.matchMedia('(any-pointer: coarse)').matches;
    const hasFinePointer = window.matchMedia('(any-pointer: fine)').matches;
    const hasHover = window.matchMedia('(any-hover: hover)').matches;

    this.touchCapabilityCache = {
      hasTouch,
      isCoarsePointer,
      hasFinePointer,
      hasHover,
    };

    logger.log('Touch capabilities detected:', this.touchCapabilityCache);
    return this.touchCapabilityCache;
  }

  /**
   * Determine if touch keyboard should be enabled based on capabilities and preferences
   */
  private shouldEnableTouchKeyboard(): boolean {
    // Get user preference from localStorage
    const preference = localStorage.getItem('touchKeyboardPreference') || 'auto';

    if (preference === 'always') {
      return true;
    }

    if (preference === 'never') {
      return false;
    }

    // Auto mode: use smart detection
    const capabilities = this.detectTouchCapabilities();

    // Touch-first devices: has touch + coarse pointer + no hover
    const isTouchFirst =
      capabilities.hasTouch && capabilities.isCoarsePointer && !capabilities.hasHover;

    // Hybrid devices: has both touch and fine pointer (Surface, iPad with trackpad, etc)
    const isHybrid = capabilities.hasTouch && capabilities.hasFinePointer;

    // For hybrid devices, also check screen size
    const screenSize = Math.min(window.innerWidth, window.innerHeight);
    const isSmallScreen = screenSize < 1024;

    // Enable for touch-first OR hybrid with small screen
    return isTouchFirst || (isHybrid && isSmallScreen);
  }

  handlePreferencesChanged = (e: Event): void => {
    if (!this.callbacks) return;

    const event = e as CustomEvent;
    const preferences = event.detail as AppPreferences;
    this.callbacks.setUseDirectKeyboard(preferences.useDirectKeyboard);

    // Update touch keyboard preference if provided
    if (preferences.touchKeyboardPreference) {
      localStorage.setItem('touchKeyboardPreference', preferences.touchKeyboardPreference);
      // Clear cache to force re-evaluation
      this.touchCapabilityCache = null;
      // Re-evaluate mobile status
      this.updateMobileStatus();
    }

    // Update hidden input based on preference
    const isMobile = this.callbacks.getIsMobile();
    const useDirectKeyboard = this.callbacks.getUseDirectKeyboard();
    const directKeyboardManager = this.callbacks.getDirectKeyboardManager();

    if (isMobile && useDirectKeyboard && !directKeyboardManager.getShowQuickKeys()) {
      directKeyboardManager.ensureHiddenInputVisible();
    } else if (!useDirectKeyboard) {
      // Cleanup direct keyboard manager when disabled
      directKeyboardManager.cleanup();
      this.callbacks.setShowQuickKeys(false);
    }
  };

  /**
   * Update mobile status based on current detection
   */
  private updateMobileStatus(): void {
    if (!this.callbacks) return;

    const shouldEnableTouchKeyboard = this.shouldEnableTouchKeyboard();
    const capabilities = this.detectTouchCapabilities();

    // Update device type based on screen size for layout purposes
    const screenWidth = window.innerWidth;
    const isTablet = capabilities.hasTouch && screenWidth >= 768;
    const isPhone = capabilities.hasTouch && screenWidth < 768;
    window.__deviceType = isTablet ? 'tablet' : isPhone ? 'phone' : 'desktop';

    // Update mobile status
    const wasMobile = this.callbacks.getIsMobile();
    if (wasMobile !== shouldEnableTouchKeyboard) {
      this.callbacks.setIsMobile(shouldEnableTouchKeyboard);

      // Handle transition from mobile to non-mobile
      if (!shouldEnableTouchKeyboard) {
        // Cleanup mobile features
        const directKeyboardManager = this.callbacks.getDirectKeyboardManager();
        if (directKeyboardManager) {
          directKeyboardManager.cleanup();
          this.callbacks.setShowQuickKeys(false);
        }
      }
    }
  }

  handleWindowResize = (): void => {
    if (!this.callbacks) return;

    // Clear cache to re-evaluate capabilities (in case of device mode changes in dev tools)
    this.touchCapabilityCache = null;

    // Update mobile status
    this.updateMobileStatus();
  };

  keyboardHandler = (e: KeyboardEvent): void => {
    if (!this.callbacks) return;

    // Check if focus management is disabled (e.g., when overlays/modals are active)
    if (this.callbacks.getDisableFocusManagement()) {
      // Don't capture keyboard input when overlays are active
      return;
    }

    // Check if we're in an inline-edit component
    // Since inline-edit uses Shadow DOM, we need to check the composed path
    const composedPath = e.composedPath();
    for (const element of composedPath) {
      if (element instanceof HTMLElement && element.tagName?.toLowerCase() === 'inline-edit') {
        // Allow the event to pass through to the inline-edit component
        return;
      }
    }

    if (!this.session) return;

    // Handle Escape key specially for exited sessions
    if (e.key === 'Escape' && this.session.status === 'exited') {
      this.callbacks.handleBack();
      return;
    }

    // Don't capture keyboard input for exited sessions (except Escape handled above)
    if (this.session.status === 'exited') {
      // Allow normal browser behavior for exited sessions
      return;
    }

    // Get keyboard capture state FIRST
    const keyboardCaptureActive = this.callbacks.getKeyboardCaptureActive();

    // Special case: Always handle Escape key for double-tap toggle functionality
    if (e.key === 'Escape') {
      // Always send Escape to input manager for double-tap detection
      consumeEvent(e);
      this.callbacks.handleKeyboardInput(e);
      return;
    }

    // If keyboard capture is OFF, allow browser to handle ALL shortcuts
    if (!keyboardCaptureActive) {
      // Don't consume the event - let browser handle it
      logger.log('Keyboard capture OFF - allowing browser to handle key:', e.key);
      return;
    }

    // From here on, keyboard capture is ON, so we handle shortcuts

    // Check if this is a critical browser shortcut that should never be captured
    // Import isBrowserShortcut to check for critical shortcuts
    if (isBrowserShortcut(e)) {
      // These are critical shortcuts like Cmd+T, Cmd+W that should always go to browser
      logger.log('Critical browser shortcut detected, allowing browser to handle:', e.key);
      return;
    }

    // Handle Cmd+O / Ctrl+O to open file browser (only when capture is ON)
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      // Stop propagation to prevent parent handlers from interfering with our file browser
      consumeEvent(e);
      this.callbacks.setShowFileBrowser(true);
      return;
    }

    // Only prevent default for keys we're actually going to handle
    consumeEvent(e);

    this.callbacks.handleKeyboardInput(e);
  };

  touchStartHandler = (e: TouchEvent): void => {
    if (!this.callbacks) return;

    const isMobile = this.callbacks.getIsMobile();
    if (!isMobile) return;

    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  };

  touchEndHandler = (e: TouchEvent): void => {
    if (!this.callbacks) return;

    const isMobile = this.callbacks.getIsMobile();
    if (!isMobile) return;

    const touch = e.changedTouches[0];
    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;

    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;

    // Check for horizontal swipe from left edge (back gesture)
    const isSwipeRight = deltaX > 100;
    const isVerticallyStable = Math.abs(deltaY) < 100;
    const startedFromLeftEdge = this.touchStartX < 50;

    if (isSwipeRight && isVerticallyStable && startedFromLeftEdge) {
      // Trigger back navigation
      this.callbacks.handleBack();
    }
  };

  handleClickOutside = (e: Event): void => {
    if (!this.callbacks) return;

    const showWidthSelector = this.callbacks.getShowWidthSelector();
    if (showWidthSelector) {
      const target = e.target as HTMLElement;
      const widthSelector = this.callbacks.querySelector('.width-selector-container');
      const widthButton = this.callbacks.querySelector('.width-selector-button');

      if (!widthSelector?.contains(target) && !widthButton?.contains(target)) {
        this.callbacks.setShowWidthSelector(false);
        this.callbacks.setCustomWidth('');
      }
    }
  };

  setupLifecycle(): void {
    if (!this.callbacks) return;

    // Make session-view focusable
    this.callbacks.setTabIndex(0);

    // Store click handler reference for proper cleanup
    this.clickHandler = () => {
      if (!this.callbacks?.getDisableFocusManagement()) {
        this.callbacks?.focus();
      }
    };
    this.callbacks.addEventListener('click', this.clickHandler);

    // Add click outside handler for width selector
    document.addEventListener('click', this.handleClickOutside);

    // Show loading animation if no session yet
    if (!this.session) {
      this.callbacks.startLoading();
    }

    // Use new touch detection logic
    const shouldEnableTouchKeyboard = this.shouldEnableTouchKeyboard();
    const capabilities = this.detectTouchCapabilities();

    // Update device type based on screen size for layout purposes
    const screenWidth = window.innerWidth;
    const isTablet = capabilities.hasTouch && screenWidth >= 768;
    const isPhone = capabilities.hasTouch && screenWidth < 768;
    window.__deviceType = isTablet ? 'tablet' : isPhone ? 'phone' : 'desktop';

    this.callbacks.setIsMobile(shouldEnableTouchKeyboard);

    logger.log('Touch keyboard enabled:', shouldEnableTouchKeyboard);
    logger.log('Device type:', window.__deviceType);

    // Listen for preference changes
    window.addEventListener('app-preferences-changed', this.handlePreferencesChanged);

    // Listen for window resize to handle orientation changes and viewport size changes
    window.addEventListener('resize', this.handleWindowResize);

    this.setupMobileFeatures(shouldEnableTouchKeyboard);
    this.setupEventListeners(shouldEnableTouchKeyboard);
  }

  private setupMobileFeatures(isMobile: boolean): void {
    if (!this.callbacks) return;

    // Set up VirtualKeyboard API if available and on mobile
    if (isMobile && 'virtualKeyboard' in navigator) {
      // Enable overlays-content mode so keyboard doesn't resize viewport
      try {
        const nav = navigator as Navigator & { virtualKeyboard?: { overlaysContent: boolean } };
        if (nav.virtualKeyboard) {
          nav.virtualKeyboard.overlaysContent = true;
        }
        logger.log('VirtualKeyboard API: overlaysContent enabled');
      } catch (e) {
        logger.warn('Failed to set virtualKeyboard.overlaysContent:', e);
      }
    } else if (isMobile) {
      logger.log('VirtualKeyboard API not available on this device');
    }

    // Set up Visual Viewport API for Safari keyboard detection
    if (isMobile && window.visualViewport) {
      let previousKeyboardHeight = 0;

      this.visualViewportHandler = () => {
        const viewport = window.visualViewport;
        if (!viewport || !this.callbacks) return;
        const keyboardHeight = window.innerHeight - viewport.height;

        // Store keyboard height in state
        this.callbacks.setKeyboardHeight(keyboardHeight);

        logger.log(`Visual Viewport keyboard height: ${keyboardHeight}px`);

        // Detect keyboard dismissal (height drops to 0 or near 0)
        if (previousKeyboardHeight > 50 && keyboardHeight < 50) {
          logger.log('Keyboard dismissed detected via viewport change');

          // Check if we're using direct keyboard mode
          const useDirectKeyboard = this.callbacks.getUseDirectKeyboard();
          const directKeyboardManager = this.callbacks.getDirectKeyboardManager();

          if (
            useDirectKeyboard &&
            directKeyboardManager &&
            directKeyboardManager.getShowQuickKeys()
          ) {
            // Force hide quick keys when keyboard dismisses
            this.callbacks.setShowQuickKeys(false);

            // Also update the direct keyboard manager's internal state
            if (directKeyboardManager.setShowQuickKeys) {
              directKeyboardManager.setShowQuickKeys(false);
            }

            logger.log('Force hiding quick keys after keyboard dismissal');
          }
        }

        previousKeyboardHeight = keyboardHeight;
      };

      window.visualViewport.addEventListener('resize', this.visualViewportHandler);
      window.visualViewport.addEventListener('scroll', this.visualViewportHandler);
    }
  }

  private setupEventListeners(isMobile: boolean): void {
    // Only add listeners if not already added
    if (!isMobile && !this.keyboardListenerAdded) {
      // Don't use capture phase - let browser handle shortcuts naturally
      document.addEventListener('keydown', this.keyboardHandler);
      this.keyboardListenerAdded = true;
    } else if (isMobile && !this.touchListenersAdded) {
      // Add touch event listeners for mobile swipe gestures
      document.addEventListener('touchstart', this.touchStartHandler, { passive: true });
      document.addEventListener('touchend', this.touchEndHandler, { passive: true });
      this.touchListenersAdded = true;
    }
  }

  teardownLifecycle(): void {
    if (!this.callbacks) return;

    logger.log('SessionView disconnectedCallback called', {
      sessionId: this.session?.id,
      sessionStatus: this.session?.status,
    });

    this.callbacks.setConnected(false);

    // Reset terminal size for external terminals when leaving session view
    const terminalLifecycleManager = this.callbacks.getTerminalLifecycleManager();
    if (this.session && this.session.status !== 'exited' && terminalLifecycleManager) {
      logger.log('Calling resetTerminalSize for session', this.session.id);
      terminalLifecycleManager.resetTerminalSize();
    }

    // Update connection manager
    const connectionManager = this.callbacks.getConnectionManager();
    if (connectionManager) {
      connectionManager.setConnected(false);
    }

    // Cleanup terminal lifecycle manager
    if (terminalLifecycleManager) {
      terminalLifecycleManager.cleanup();
    }

    // Remove click outside handler
    document.removeEventListener('click', this.handleClickOutside);

    // Remove click handler
    if (this.clickHandler) {
      this.callbacks.removeEventListener('click', this.clickHandler);
      this.clickHandler = null;
    }

    // Remove global keyboard event listener
    if (!this.callbacks.getIsMobile() && this.keyboardListenerAdded) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardListenerAdded = false;
    } else if (this.callbacks.getIsMobile() && this.touchListenersAdded) {
      // Remove touch event listeners
      document.removeEventListener('touchstart', this.touchStartHandler);
      document.removeEventListener('touchend', this.touchEndHandler);
      this.touchListenersAdded = false;
    }

    // Cleanup direct keyboard manager
    const directKeyboardManager = this.callbacks.getDirectKeyboardManager();
    if (directKeyboardManager) {
      directKeyboardManager.cleanup();
    }

    // Clean up Visual Viewport listener
    if (this.visualViewportHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.visualViewportHandler);
      window.visualViewport.removeEventListener('scroll', this.visualViewportHandler);
      this.visualViewportHandler = null;
    }

    // Remove preference change listener
    window.removeEventListener('app-preferences-changed', this.handlePreferencesChanged);

    // Remove window resize listener
    window.removeEventListener('resize', this.handleWindowResize);

    // Stop loading animation
    this.callbacks.stopLoading();

    // Cleanup stream connection if it exists
    if (connectionManager) {
      connectionManager.cleanupStreamConnection();
    }
  }

  cleanup(): void {
    logger.log('LifecycleEventManager cleanup');

    // Clean up event listeners
    document.removeEventListener('click', this.handleClickOutside);
    window.removeEventListener('app-preferences-changed', this.handlePreferencesChanged);
    window.removeEventListener('resize', this.handleWindowResize);

    // Remove global keyboard event listener
    if (!this.callbacks?.getIsMobile() && this.keyboardListenerAdded) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardListenerAdded = false;
    } else if (this.callbacks?.getIsMobile() && this.touchListenersAdded) {
      // Remove touch event listeners
      document.removeEventListener('touchstart', this.touchStartHandler);
      document.removeEventListener('touchend', this.touchEndHandler);
      this.touchListenersAdded = false;
    }

    // Clean up Visual Viewport listener
    if (this.visualViewportHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.visualViewportHandler);
      window.visualViewport.removeEventListener('scroll', this.visualViewportHandler);
      this.visualViewportHandler = null;
    }

    // Clean up click handler reference
    this.clickHandler = null;

    this.sessionViewElement = null;
    this.callbacks = null;
    this.session = null;
  }
}
