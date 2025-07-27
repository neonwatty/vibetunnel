/**
 * Mobile Viewport Utilities
 *
 * Provides utilities for handling virtual keyboards, viewport changes,
 * and mobile-specific behaviors in the chat interface.
 */

import { createLogger } from './logger.js';

const logger = createLogger('mobile-viewport');

// Keyboard detection threshold in pixels
// Values above this threshold indicate a virtual keyboard is likely visible
const KEYBOARD_DETECTION_THRESHOLD = 100;

export interface ViewportState {
  isKeyboardVisible: boolean;
  keyboardHeight: number;
  viewportHeight: number;
  windowHeight: number;
  hasNotch: boolean;
  orientation: 'portrait' | 'landscape';
}

export class MobileViewportManager {
  private callbacks = new Set<(state: ViewportState) => void>();
  private currentState: ViewportState;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastTouchY = 0;
  private isScrolling = false;
  private scrollDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  // Store bound listener references for proper cleanup
  private boundHandleViewportChange = this.handleViewportChange.bind(this);
  private boundHandleViewportScroll = this.handleViewportScroll.bind(this);
  private boundHandleWindowResize = this.handleWindowResize.bind(this);
  private boundHandleOrientationChange = this.handleOrientationChange.bind(this);
  private boundHandleTouchStart = this.handleTouchStart.bind(this);
  private boundHandleTouchMove = this.handleTouchMove.bind(this);
  private boundHandleTouchEnd = this.handleTouchEnd.bind(this);
  private boundHandleScroll = this.handleScroll.bind(this);

  constructor() {
    this.currentState = this.calculateState();
    this.setupListeners();
  }

  /**
   * Get Visual Viewport with fallback for browsers that don't support it
   */
  private getVisualViewport(): {
    height: number;
    width: number;
    offsetTop: number;
    offsetLeft: number;
    pageTop: number;
    pageLeft: number;
    scale: number;
  } | null {
    if (window.visualViewport) {
      return window.visualViewport;
    }

    // Fallback for browsers without Visual Viewport API
    return {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: window.pageYOffset || document.documentElement.scrollTop || 0,
      pageLeft: window.pageXOffset || document.documentElement.scrollLeft || 0,
      scale: 1,
    };
  }

  private calculateState(): ViewportState {
    const windowHeight = window.innerHeight;
    const viewport = this.getVisualViewport();
    const viewportHeight = viewport?.height || windowHeight;
    const keyboardHeight = Math.max(0, windowHeight - viewportHeight);
    const isKeyboardVisible = keyboardHeight > KEYBOARD_DETECTION_THRESHOLD;

    // Detect notch (iPhone X and later)
    const hasNotch = this.detectNotch();

    // Detect orientation
    const orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';

    return {
      isKeyboardVisible,
      keyboardHeight,
      viewportHeight,
      windowHeight,
      hasNotch,
      orientation,
    };
  }

  private detectNotch(): boolean {
    // Check for iPhone X and later models with notch
    // Note: _standalonePWA is preserved for potential future use in PWA detection
    const _standalonePWA = window.matchMedia('(display-mode: standalone)').matches;
    const iosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent);

    // Check safe area insets
    const style = getComputedStyle(document.documentElement);
    const topInset = Number.parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0');

    return iosDevice && topInset > 20; // Standard status bar is 20px
  }

  private setupListeners() {
    try {
      // Visual Viewport API with feature detection
      if ('visualViewport' in window && window.visualViewport) {
        window.visualViewport.addEventListener('resize', this.boundHandleViewportChange);
        window.visualViewport.addEventListener('scroll', this.boundHandleViewportScroll);
      }

      // Window resize (orientation change)
      window.addEventListener('resize', this.boundHandleWindowResize);
      window.addEventListener('orientationchange', this.boundHandleOrientationChange);

      // Touch events for keyboard dismiss detection
      document.addEventListener('touchstart', this.boundHandleTouchStart, { passive: true });
      document.addEventListener('touchmove', this.boundHandleTouchMove, { passive: true });
      document.addEventListener('touchend', this.boundHandleTouchEnd, { passive: true });

      // Scroll events
      document.addEventListener('scroll', this.boundHandleScroll, { passive: true });
    } catch (error) {
      logger.error('Error setting up viewport listeners:', error);
    }
  }

  private handleViewportChange() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = setTimeout(() => {
      const newState = this.calculateState();
      const oldState = this.currentState;

      // Check if state actually changed
      if (
        newState.isKeyboardVisible !== oldState.isKeyboardVisible ||
        Math.abs(newState.keyboardHeight - oldState.keyboardHeight) > 10 ||
        newState.orientation !== oldState.orientation
      ) {
        logger.debug('Viewport state changed:', newState);
        this.currentState = newState;
        this.notifyCallbacks();
      }
    }, 100);
  }

  private handleViewportScroll() {
    try {
      // Prevent viewport from scrolling on iOS when keyboard is visible
      const viewport = this.getVisualViewport();
      if (this.currentState.isKeyboardVisible && viewport && viewport.offsetTop > 0) {
        window.scrollTo(0, 0);
      }
    } catch (error) {
      logger.error('Error handling viewport scroll:', error);
    }
  }

  private handleWindowResize() {
    this.handleViewportChange();
  }

  private handleOrientationChange() {
    logger.log('Orientation change detected');
    // Force recalculation after orientation change
    setTimeout(() => {
      this.handleViewportChange();
    }, 500);
  }

  private handleTouchStart(e: TouchEvent) {
    if (e.touches.length > 0) {
      this.lastTouchY = e.touches[0].clientY;
    }
  }

  private handleTouchMove(e: TouchEvent) {
    if (e.touches.length > 0) {
      const currentY = e.touches[0].clientY;
      const deltaY = Math.abs(currentY - this.lastTouchY);

      // Detect scrolling gesture
      if (deltaY > 10) {
        this.isScrolling = true;
      }
    }
  }

  private handleTouchEnd() {
    // Reset scrolling flag after a delay
    setTimeout(() => {
      this.isScrolling = false;
    }, 100);
  }

  private handleScroll() {
    // Debounce blur operation to prevent UI jank
    if (this.scrollDebounceTimeout) {
      clearTimeout(this.scrollDebounceTimeout);
    }

    if (this.currentState.isKeyboardVisible && this.isScrolling) {
      this.scrollDebounceTimeout = setTimeout(() => {
        const activeElement = document.activeElement;
        if (activeElement && (activeElement as HTMLElement).blur) {
          logger.debug('Dismissing keyboard on scroll');
          (activeElement as HTMLElement).blur();
        }
      }, 150); // Debounce delay to prevent excessive blur calls
    }
  }

  private notifyCallbacks() {
    this.callbacks.forEach((callback) => {
      try {
        callback(this.currentState);
      } catch (error) {
        logger.error('Error in viewport callback:', error);
      }
    });
  }

  subscribe(callback: (state: ViewportState) => void): () => void {
    this.callbacks.add(callback);

    // Call immediately with current state
    callback(this.currentState);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  getState(): ViewportState {
    return this.currentState;
  }

  ensureElementVisible(
    element: HTMLElement,
    options?: {
      padding?: number;
      animated?: boolean;
    }
  ) {
    const { padding = 20, animated = true } = options || {};

    if (!element) return;

    try {
      const rect = element.getBoundingClientRect();
      const viewport = this.getVisualViewport();
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportBottom = viewportTop + viewportHeight;

      // Check if element is below visible viewport
      if (rect.bottom > viewportBottom - padding) {
        const scrollAmount = rect.bottom - viewportBottom + padding;

        if (animated) {
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        } else {
          window.scrollBy(0, scrollAmount);
        }
      }

      // Check if element is above visible viewport
      if (rect.top < viewportTop + padding) {
        const scrollAmount = rect.top - viewportTop - padding;

        if (animated) {
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        } else {
          window.scrollBy(0, scrollAmount);
        }
      }
    } catch (error) {
      logger.error('Error ensuring element visibility:', error);
    }
  }

  cleanup() {
    if ('visualViewport' in window && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.boundHandleViewportChange);
      window.visualViewport.removeEventListener('scroll', this.boundHandleViewportScroll);
    }

    window.removeEventListener('resize', this.boundHandleWindowResize);
    window.removeEventListener('orientationchange', this.boundHandleOrientationChange);

    document.removeEventListener('touchstart', this.boundHandleTouchStart);
    document.removeEventListener('touchmove', this.boundHandleTouchMove);
    document.removeEventListener('touchend', this.boundHandleTouchEnd);
    document.removeEventListener('scroll', this.boundHandleScroll);

    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    if (this.scrollDebounceTimeout) {
      clearTimeout(this.scrollDebounceTimeout);
    }

    this.callbacks.clear();
  }
}

// Export singleton instance
export const mobileViewportManager = new MobileViewportManager();
