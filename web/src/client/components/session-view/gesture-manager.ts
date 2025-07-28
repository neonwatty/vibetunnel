/**
 * Gesture Manager for Session View
 *
 * Manages touch gestures for switching between terminal and chat views,
 * integrating with the GestureDetector and handling view transitions.
 */

import { GestureDetector, type SwipeGestureResult } from '../../utils/gesture-detector.js';
import { createLogger } from '../../utils/logger.js';
import { detectMobile } from '../../utils/mobile-utils.js';

const logger = createLogger('gesture-manager');

export interface GestureManagerCallbacks {
  getCurrentView: () => 'terminal' | 'chat';
  setCurrentView: (view: 'terminal' | 'chat') => void;
  shouldShowViewToggle: () => boolean;
  requestUpdate: () => void;
  saveViewPreference: (view: 'terminal' | 'chat') => void;
  triggerHapticFeedback?: () => void;
}

export class GestureManager {
  private gestureDetector: GestureDetector | null = null;
  private callbacks: GestureManagerCallbacks | null = null;
  private element: HTMLElement | null = null;
  private isEnabled = false;
  private isAnimating = false;
  private previewActive = false;

  // DOM elements for visual feedback
  private terminalContainer: HTMLElement | null = null;
  private chatContainer: HTMLElement | null = null;
  private previewOverlay: HTMLElement | null = null;
  private progressIndicator: HTMLElement | null = null;

  constructor() {
    // Only enable on mobile devices
    this.isEnabled = detectMobile();
  }

  public initialize(element: HTMLElement, callbacks: GestureManagerCallbacks): void {
    if (!this.isEnabled) {
      logger.debug('Gesture manager disabled on non-mobile device');
      return;
    }

    this.element = element;
    this.callbacks = callbacks;

    // Create gesture detector
    this.gestureDetector = new GestureDetector(
      element,
      this.handleGesture.bind(this),
      this.handlePreview.bind(this),
      this.handleGestureEnd.bind(this)
    );

    // Setup visual feedback elements
    this.setupVisualFeedback();

    logger.debug('Gesture manager initialized');
  }

  private setupVisualFeedback(): void {
    if (!this.element) return;

    // Create preview overlay
    this.previewOverlay = document.createElement('div');
    this.previewOverlay.className = 'gesture-preview-overlay';
    this.element.appendChild(this.previewOverlay);

    // Create progress indicator
    this.progressIndicator = document.createElement('div');
    this.progressIndicator.className = 'swipe-progress-indicator';
    this.element.appendChild(this.progressIndicator);
  }

  public updateContainerReferences(): void {
    if (!this.element) return;

    try {
      // Find terminal and chat containers for animation
      this.terminalContainer = this.element.querySelector('.terminal-view') as HTMLElement;
      this.chatContainer = this.element.querySelector('.chat-view') as HTMLElement;
    } catch (error) {
      logger.warn('Failed to update container references:', error);
      this.terminalContainer = null;
      this.chatContainer = null;
    }
  }

  private handleGesture(result: SwipeGestureResult): void {
    try {
      if (!this.callbacks || this.isAnimating || !this.canSwitchViews()) {
        return;
      }

      const currentView = this.callbacks.getCurrentView();
      let targetView: 'terminal' | 'chat' | null = null;

      // Determine target view based on swipe direction and current view
      if (result.direction === 'left' && currentView === 'terminal') {
        targetView = 'chat';
      } else if (result.direction === 'right' && currentView === 'chat') {
        targetView = 'terminal';
      }

      if (targetView && targetView !== currentView && result.direction) {
        this.performViewSwitch(targetView, result.direction);
        this.triggerHapticFeedback();

        logger.log(
          `Gesture completed: ${currentView} -> ${targetView} (${result.direction} swipe)`
        );
      }
    } catch (error) {
      logger.warn('Error handling gesture:', error);
    }
  }

  private handlePreview(result: SwipeGestureResult): void {
    try {
      if (!this.callbacks || this.isAnimating || !this.canSwitchViews()) {
        return;
      }

      const currentView = this.callbacks.getCurrentView();
      const canSwitch =
        (result.direction === 'left' && currentView === 'terminal') ||
        (result.direction === 'right' && currentView === 'chat');

      if (canSwitch && result.direction) {
        this.showPreview(result);
      } else {
        this.hidePreview();
      }
    } catch (error) {
      logger.warn('Error handling preview:', error);
    }
  }

  private handleGestureEnd(): void {
    this.hidePreview();
  }

  private showPreview(result: SwipeGestureResult): void {
    if (!this.previewActive) {
      this.previewActive = true;
      this.updateVisualFeedback(result);
    }

    // Update progress based on gesture progress
    if (result.direction) {
      this.updateProgress(result.progress, result.direction);
    }
  }

  private hidePreview(): void {
    if (this.previewActive) {
      this.previewActive = false;
      this.clearVisualFeedback();
    }
  }

  private updateVisualFeedback(result: SwipeGestureResult): void {
    try {
      if (this.previewOverlay) {
        this.previewOverlay.classList.add('active');
        this.previewOverlay.style.setProperty(
          '--gesture-opacity',
          String(Math.min(result.progress, 0.3))
        );
      }

      if (this.progressIndicator) {
        this.progressIndicator.className = `swipe-progress-indicator ${result.direction} active`;
        this.progressIndicator.style.setProperty('--gesture-opacity', String(0.8));
        this.progressIndicator.style.setProperty(
          '--gesture-scale',
          String(1 + result.progress * 0.2)
        );
      }
    } catch (error) {
      logger.warn('Error updating visual feedback:', error);
    }
  }

  private updateProgress(progress: number, direction: 'left' | 'right'): void {
    try {
      // Validate inputs
      if (typeof progress !== 'number' || Number.isNaN(progress)) {
        logger.warn('Invalid progress value:', progress);
        return;
      }

      progress = Math.max(0, Math.min(1, progress)); // Clamp to 0-1

      // Update any containers with preview transforms using CSS custom properties
      if (this.terminalContainer && this.chatContainer && this.callbacks) {
        const currentView = this.callbacks.getCurrentView();

        if (currentView === 'terminal' && direction === 'left') {
          // Preview sliding terminal out and chat in
          const terminalTranslateX = -progress * 100;
          const chatTranslateX = 100 - progress * 100;

          this.terminalContainer.style.setProperty(
            '--gesture-translate-x',
            `${terminalTranslateX}%`
          );
          this.chatContainer.style.setProperty('--gesture-translate-x', `${chatTranslateX}%`);
        } else if (currentView === 'chat' && direction === 'right') {
          // Preview sliding chat out and terminal in
          const chatTranslateX = progress * 100;
          const terminalTranslateX = -100 + progress * 100;

          this.chatContainer.style.setProperty('--gesture-translate-x', `${chatTranslateX}%`);
          this.terminalContainer.style.setProperty(
            '--gesture-translate-x',
            `${terminalTranslateX}%`
          );
        }
      }
    } catch (error) {
      logger.warn('Error updating progress:', error);
    }
  }

  private clearVisualFeedback(): void {
    try {
      if (this.previewOverlay) {
        this.previewOverlay.classList.remove('active');
        this.previewOverlay.style.removeProperty('--gesture-opacity');
      }

      if (this.progressIndicator) {
        this.progressIndicator.classList.remove('active', 'left', 'right');
        this.progressIndicator.style.removeProperty('--gesture-opacity');
        this.progressIndicator.style.removeProperty('--gesture-scale');
      }

      // Reset container transforms using CSS custom properties
      if (this.terminalContainer) {
        this.terminalContainer.style.removeProperty('--gesture-translate-x');
        this.terminalContainer.style.removeProperty('--gesture-translate-y');
        this.terminalContainer.style.removeProperty('--gesture-scale');
        this.terminalContainer.style.removeProperty('--gesture-opacity');
      }
      if (this.chatContainer) {
        this.chatContainer.style.removeProperty('--gesture-translate-x');
        this.chatContainer.style.removeProperty('--gesture-translate-y');
        this.chatContainer.style.removeProperty('--gesture-scale');
        this.chatContainer.style.removeProperty('--gesture-opacity');
      }
    } catch (error) {
      logger.warn('Error clearing visual feedback:', error);
    }
  }

  private performViewSwitch(targetView: 'terminal' | 'chat', _direction: 'left' | 'right'): void {
    if (!this.callbacks) return;

    this.isAnimating = true;

    // Add transition classes for smooth animation
    if (this.terminalContainer) {
      this.terminalContainer.classList.add('view-container', 'elastic');
    }
    if (this.chatContainer) {
      this.chatContainer.classList.add('view-container', 'elastic');
    }

    // Perform the view switch
    this.callbacks.setCurrentView(targetView);
    this.callbacks.saveViewPreference(targetView);
    this.callbacks.requestUpdate();

    // Clear animation state after transition
    setTimeout(() => {
      this.isAnimating = false;
      this.clearTransitionClasses();
    }, 400); // Match elastic transition duration
  }

  private clearTransitionClasses(): void {
    if (this.terminalContainer) {
      this.terminalContainer.classList.remove('view-container', 'elastic', 'snap-back', 'preview');
    }
    if (this.chatContainer) {
      this.chatContainer.classList.remove('view-container', 'elastic', 'snap-back', 'preview');
    }
  }

  private canSwitchViews(): boolean {
    return this.callbacks?.shouldShowViewToggle() ?? false;
  }

  private triggerHapticFeedback(): void {
    // Try to trigger native haptic feedback if available
    if (this.callbacks?.triggerHapticFeedback) {
      this.callbacks.triggerHapticFeedback();
    } else {
      // Fallback: add haptic feedback class for CSS animation
      if (this.element) {
        this.element.classList.add('haptic-feedback');
        setTimeout(() => {
          this.element?.classList.remove('haptic-feedback');
        }, 100);
      }
    }

    // Try native vibration API if available
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(10); // Short, subtle vibration
      } catch (error) {
        logger.debug('Vibration API not available or failed:', error);
      }
    }
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled && detectMobile();

    if (!this.isEnabled && this.gestureDetector) {
      this.gestureDetector.destroy();
      this.gestureDetector = null;
    }
  }

  public isGestureEnabled(): boolean {
    return this.isEnabled && !!this.gestureDetector;
  }

  public cleanup(): void {
    if (this.gestureDetector) {
      this.gestureDetector.destroy();
      this.gestureDetector = null;
    }

    // Remove visual feedback elements
    if (this.previewOverlay?.parentNode) {
      this.previewOverlay.parentNode.removeChild(this.previewOverlay);
    }
    if (this.progressIndicator?.parentNode) {
      this.progressIndicator.parentNode.removeChild(this.progressIndicator);
    }

    this.clearTransitionClasses();
    this.element = null;
    this.callbacks = null;
    this.terminalContainer = null;
    this.chatContainer = null;
    this.previewOverlay = null;
    this.progressIndicator = null;
  }
}
