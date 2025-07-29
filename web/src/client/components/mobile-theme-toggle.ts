/**
 * Mobile Theme Toggle Component
 *
 * A simple, mobile-optimized toggle specifically for the chat view.
 * Uses minimal UI with smooth icon transitions.
 *
 * @fires theme-changed - When theme is toggled (detail: 'light' | 'dark')
 */

import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('mobile-theme-toggle');

export type Theme = 'light' | 'dark';

@customElement('mobile-theme-toggle')
export class MobileThemeToggle extends LitElement {
  @property({ type: String, reflect: true }) theme: Theme = 'light';

  createRenderRoot() {
    return this;
  }

  private handleClick() {
    const newTheme: Theme = this.theme === 'light' ? 'dark' : 'light';
    this.theme = newTheme;

    this.dispatchEvent(
      new CustomEvent('theme-changed', {
        detail: newTheme,
        bubbles: true,
        composed: true,
      })
    );

    // Announce theme change to screen readers
    const announcement = newTheme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled';
    this.announceToScreenReader(announcement);

    logger.log(`Theme changed to: ${newTheme}`);
  }

  private announceToScreenReader(text: string) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.style.position = 'absolute';
    announcement.style.left = '-10000px';
    announcement.style.width = '1px';
    announcement.style.height = '1px';
    announcement.style.overflow = 'hidden';
    announcement.textContent = text;

    document.body.appendChild(announcement);
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  render() {
    return html`
      <button
        @click=${this.handleClick}
        class="p-2 hover:bg-surface-hover rounded transition-all duration-200 relative w-10 h-10 flex items-center justify-center"
        aria-label="Theme toggle"
        aria-checked=${this.theme === 'dark'}
        role="switch"
        aria-live="polite"
      >
        <div class="relative w-5 h-5">
          <!-- Sun icon (light mode) -->
          <svg 
            class="absolute inset-0 w-full h-full transition-all duration-300 ${
              this.theme === 'light'
                ? 'opacity-100 rotate-0 scale-100'
                : 'opacity-0 -rotate-90 scale-0'
            }"
            fill="none" 
            stroke="currentColor" 
            stroke-width="2" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          
          <!-- Moon icon (dark mode) -->
          <svg 
            class="absolute inset-0 w-full h-full transition-all duration-300 ${
              this.theme === 'dark'
                ? 'opacity-100 rotate-0 scale-100'
                : 'opacity-0 rotate-90 scale-0'
            }"
            fill="none" 
            stroke="currentColor" 
            stroke-width="2" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </div>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-theme-toggle': MobileThemeToggle;
  }
}
