/**
 * Pull to Refresh Indicator Component
 *
 * A visual indicator component for pull-to-refresh functionality in the chat view.
 * Shows pull progress, loading state, and completion feedback with smooth animations.
 *
 * @fires refresh-triggered - When pull threshold is reached and refresh should start
 */

import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pull-to-refresh');

export type PullToRefreshState =
  | 'idle'
  | 'pulling'
  | 'releasing'
  | 'refreshing'
  | 'complete'
  | 'error';

// Configuration constants
const PULL_THRESHOLD = 80; // Pixels to pull before triggering refresh

@customElement('pull-to-refresh')
export class PullToRefresh extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: String }) state: PullToRefreshState = 'idle';
  @property({ type: Number }) pullDistance = 0;
  @property({ type: Boolean }) isRefreshing = false;
  @property({ type: String }) message = '';

  // Use CSS custom properties instead of state for better performance
  private iconRotation = 0;
  private opacity = 0;
  private scale = 0.8;

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);

    if (changedProperties.has('pullDistance')) {
      this.updateVisuals();
    }

    if (changedProperties.has('state')) {
      this.handleStateChange();
    }
  }

  private updateVisuals() {
    // Calculate visual properties based on pull distance
    const progress = Math.min(this.pullDistance / PULL_THRESHOLD, 1);

    // Update CSS custom properties for better performance
    this.opacity = Math.min(progress, 1);
    this.scale = 0.8 + 0.2 * progress;

    if (this.state === 'pulling') {
      this.iconRotation = progress * 180;
    }

    // Apply CSS custom properties to avoid re-renders
    this.style.setProperty('--pull-opacity', this.opacity.toString());
    this.style.setProperty('--pull-scale', this.scale.toString());
    this.style.setProperty('--pull-rotation', `${this.iconRotation}deg`);
    this.style.setProperty('--pull-translate-y', `${Math.min(this.pullDistance - 40, 40)}px`);
  }

  private handleStateChange() {
    logger.debug(`State changed to: ${this.state}`);

    switch (this.state) {
      case 'idle':
        this.opacity = 0;
        this.scale = 0.8;
        this.iconRotation = 0;
        this.message = '';
        break;

      case 'releasing':
        // Keep current visuals, just preparing for refresh
        this.message = 'Release to refresh';
        break;

      case 'refreshing':
        this.opacity = 1;
        this.scale = 1;
        this.message = 'Loading messages...';
        break;

      case 'complete':
        this.message = 'Updated!';
        // Auto-hide after success
        setTimeout(() => {
          if (this.state === 'complete') {
            this.dispatchEvent(new CustomEvent('refresh-complete'));
          }
        }, 800);
        break;

      case 'error':
        this.message = 'Failed to load messages';
        // Auto-hide after error with improved shake animation
        this.style.setProperty('--error-shake', '1');
        setTimeout(() => {
          this.style.setProperty('--error-shake', '0');
        }, 600);
        setTimeout(() => {
          if (this.state === 'error') {
            this.dispatchEvent(new CustomEvent('refresh-complete'));
          }
        }, 2000);
        break;
    }
  }

  render() {
    const containerClasses = {
      'pull-to-refresh-container': true,
      'pointer-events-none': true,
      'transition-all': this.state !== 'pulling',
      'duration-300': this.state !== 'pulling',
    };

    const indicatorStyles = {
      opacity: `var(--pull-opacity, ${this.opacity})`,
      transform: `scale(var(--pull-scale, ${this.scale})) translateY(var(--pull-translate-y, ${Math.min(this.pullDistance - 40, 40)}px))`,
      transition: this.state === 'pulling' ? 'none' : 'all 0.3s ease-out',
    };

    const iconClasses = {
      'w-6': true,
      'h-6': true,
      'transition-transform': this.state !== 'pulling',
      'duration-300': this.state !== 'pulling',
      'animate-spin': this.state === 'refreshing',
    };

    const iconStyles = {
      transform:
        this.state === 'pulling' ? `rotate(var(--pull-rotation, ${this.iconRotation}deg))` : '',
      animation: this.state === 'error' ? 'shake 0.6s ease-in-out' : '',
    };

    return html`
      <div class="${classMap(containerClasses)} absolute top-0 left-0 right-0 flex justify-center pt-4 z-10"
           role="status"
           aria-live="polite"
           aria-label="Pull to refresh status">
        <div class="pull-to-refresh-indicator" style="${styleMap(indicatorStyles)}">
          <div class="bg-gray-800 rounded-full p-3 shadow-lg flex flex-col items-center ${this.state === 'error' ? 'animate-shake' : ''}">
            ${this.renderIcon(iconClasses, iconStyles)}
            ${
              this.message
                ? html`
              <div class="text-xs text-gray-400 mt-1 whitespace-nowrap" 
                   role="status" 
                   aria-live="polite"
                   aria-label="${this.message}">
                ${this.message}
              </div>
            `
                : ''
            }
          </div>
        </div>
      </div>
    `;
  }

  private renderIcon(iconClasses: Record<string, boolean>, iconStyles: Record<string, string>) {
    if (this.state === 'refreshing') {
      // Loading spinner
      return html`
        <svg class="${classMap(iconClasses)}" style="${styleMap(iconStyles)}" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      `;
    } else if (this.state === 'complete') {
      // Success checkmark
      return html`
        <svg class="${classMap(iconClasses)}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      `;
    } else if (this.state === 'error') {
      // Error X
      return html`
        <svg class="${classMap(iconClasses)}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      `;
    } else {
      // Pull arrow
      return html`
        <svg class="${classMap(iconClasses)}" style="${styleMap(iconStyles)}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
      `;
    }
  }

  /**
   * Reset the component to idle state
   */
  reset() {
    this.state = 'idle';
    this.pullDistance = 0;
    this.isRefreshing = false;
    this.message = '';
    this.opacity = 0;
    this.scale = 0.8;
    this.iconRotation = 0;

    // Clear CSS custom properties
    this.style.removeProperty('--pull-opacity');
    this.style.removeProperty('--pull-scale');
    this.style.removeProperty('--pull-rotation');
    this.style.removeProperty('--pull-translate-y');
    this.style.removeProperty('--error-shake');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pull-to-refresh': PullToRefresh;
  }
}
