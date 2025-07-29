/**
 * Chat Search Component
 *
 * Mobile-optimized search UI for the chat view. Provides a collapsible search bar
 * with touch-friendly controls for searching through chat messages.
 *
 * @fires search - When user initiates a search (detail: { query: string })
 * @fires clear-search - When user clears the search
 * @fires navigate-result - When navigating between results (detail: { direction: 'prev' | 'next' })
 * @fires close - When closing the search UI
 */

import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Z_INDEX } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('chat-search');

// Debounce delay for search input
const SEARCH_DEBOUNCE_MS = 300;

@customElement('chat-search')
export class ChatSearch extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .search-container {
      background: var(--chat-header-bg, var(--bg));
      border-bottom: 1px solid var(--border);
      overflow: hidden;
      transition: height 0.3s ease, opacity 0.3s ease;
    }

    .search-container.collapsed {
      height: 0;
      opacity: 0;
    }

    .search-container.expanded {
      height: auto;
      opacity: 1;
    }

    .search-content {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .search-input-wrapper {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      width: 20px;
      height: 20px;
      color: var(--text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      height: 44px;
      padding: 0 40px 0 40px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 22px;
      font-size: 16px;
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      border-color: var(--primary);
    }

    .search-input::placeholder {
      color: var(--text-muted);
    }

    .clear-button {
      position: absolute;
      right: 12px;
      width: 20px;
      height: 20px;
      padding: 0;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      transition: color 0.2s, opacity 0.2s;
      opacity: 0;
    }

    .clear-button.visible {
      opacity: 1;
    }

    .clear-button:hover {
      color: var(--text);
    }

    .search-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .result-counter {
      font-size: 14px;
      color: var(--text-muted);
      white-space: nowrap;
      min-width: 80px;
      text-align: center;
    }

    .nav-buttons {
      display: flex;
      gap: 4px;
    }

    .nav-button {
      width: 36px;
      height: 36px;
      padding: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      cursor: pointer;
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s, opacity 0.2s;
    }

    .nav-button:hover:not(:disabled) {
      background: var(--surface-hover);
    }

    .nav-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .close-button {
      width: 36px;
      height: 36px;
      padding: 0;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }

    .close-button:hover {
      opacity: 0.7;
    }

    /* Mobile optimizations */
    @media (max-width: 768px) {
      .search-content {
        padding: 8px 12px;
      }

      .result-counter {
        font-size: 13px;
        min-width: 60px;
      }

      .nav-button,
      .close-button {
        width: 32px;
        height: 32px;
      }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .search-input {
        background: var(--surface-dark, #2a2a2a);
        border-color: var(--border-dark, #3a3a3a);
      }

      .search-input:focus {
        border-color: var(--primary-dark, #4a9eff);
      }
    }
  `;

  @property({ type: Boolean }) isOpen = false;
  @property({ type: Number }) currentMatch = 0;
  @property({ type: Number }) totalMatches = 0;
  @property({ type: Boolean }) searching = false;

  @state() private searchQuery = '';
  private searchDebounceTimer?: number;
  private inputElement?: HTMLInputElement;

  connectedCallback() {
    super.connectedCallback();
    logger.log('Chat search component connected');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);

    // Auto-focus input when opened
    if (changedProperties.has('isOpen') && this.isOpen) {
      requestAnimationFrame(() => {
        this.inputElement?.focus();
      });
    }
  }

  private handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;

    // Clear any existing timer
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    // Debounce search
    this.searchDebounceTimer = window.setTimeout(() => {
      this.performSearch();
    }, SEARCH_DEBOUNCE_MS);
  }

  private performSearch() {
    if (!this.searchQuery.trim()) {
      this.clearSearch();
      return;
    }

    logger.log(`Performing search for: ${this.searchQuery}`);

    this.dispatchEvent(
      new CustomEvent('search', {
        detail: { query: this.searchQuery },
        bubbles: true,
        composed: true,
      })
    );
  }

  private clearSearch() {
    logger.log('Clearing search');

    this.searchQuery = '';
    if (this.inputElement) {
      this.inputElement.value = '';
    }

    this.dispatchEvent(
      new CustomEvent('clear-search', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private navigateResult(direction: 'prev' | 'next') {
    logger.log(`Navigating ${direction} in search results`);

    this.dispatchEvent(
      new CustomEvent('navigate-result', {
        detail: { direction },
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleClose() {
    logger.log('Closing search');

    // Clear search when closing
    this.clearSearch();

    this.dispatchEvent(
      new CustomEvent('close', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.handleClose();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        this.navigateResult('prev');
      } else {
        this.navigateResult('next');
      }
    }
  }

  render() {
    const hasQuery = this.searchQuery.length > 0;
    const hasResults = this.totalMatches > 0;

    return html`
      <div 
        class="search-container ${this.isOpen ? 'expanded' : 'collapsed'}"
        style="z-index: ${Z_INDEX.MOBILE_OVERLAY - 1};"
        role="search"
        aria-label="Search messages"
      >
        <div class="search-content">
          <div class="search-input-wrapper">
            <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            
            <input
              type="search"
              class="search-input"
              placeholder="Search messages..."
              .value=${this.searchQuery}
              @input=${this.handleInput}
              @keydown=${this.handleKeydown}
              aria-label="Search query"
              aria-describedby="search-results"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            />
            
            <button
              class="clear-button ${hasQuery ? 'visible' : ''}"
              @click=${this.clearSearch}
              aria-label="Clear search"
              ?hidden=${!hasQuery}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="search-controls">
            ${
              hasQuery
                ? html`
              <div class="result-counter" id="search-results" role="status" aria-live="polite">
                ${
                  hasResults ? html`${this.currentMatch} of ${this.totalMatches}` : html`No results`
                }
              </div>
              
              <div class="nav-buttons">
                <button
                  class="nav-button"
                  @click=${() => this.navigateResult('prev')}
                  ?disabled=${!hasResults || this.searching}
                  aria-label="Previous result"
                  title="Previous (Shift+Enter)"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                
                <button
                  class="nav-button"
                  @click=${() => this.navigateResult('next')}
                  ?disabled=${!hasResults || this.searching}
                  aria-label="Next result"
                  title="Next (Enter)"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            `
                : ''
            }
            
            <button
              class="close-button"
              @click=${this.handleClose}
              aria-label="Close search"
              title="Close (Esc)"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  firstUpdated() {
    this.inputElement = this.shadowRoot?.querySelector('.search-input') as HTMLInputElement;
  }

  // Public method to focus the search input
  focus() {
    this.inputElement?.focus();
  }

  // Public method to clear and reset search
  reset() {
    this.clearSearch();
    this.currentMatch = 0;
    this.totalMatches = 0;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-search': ChatSearch;
  }
}
