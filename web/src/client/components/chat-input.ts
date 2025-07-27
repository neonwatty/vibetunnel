/**
 * Chat Input Component
 *
 * Mobile-optimized input interface for sending messages in the chat view.
 * Features auto-resizing textarea, keyboard handling, and send functionality.
 *
 * @fires send-message - When user sends a message (detail: string)
 * @fires focus-change - When input focus changes (detail: boolean)
 */

import { html, LitElement, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { Z_INDEX } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { detectMobile, isIOS } from '../utils/mobile-utils.js';

const logger = createLogger('chat-input');

// Constants for textarea sizing
const MIN_ROWS = 1;
const MAX_ROWS = 5;
const ROW_HEIGHT = 24; // Approximate height per row in pixels

@customElement('chat-input')
export class ChatInput extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) disabled = false;
  @property({ type: Boolean }) loading = false;
  @property({ type: String }) placeholder = 'Type a message...';
  @property({ type: Boolean }) active = true; // Whether the session is active

  @state() private value = '';
  @state() private rows = MIN_ROWS;
  @state() private isFocused = false;
  @state() private isComposing = false;

  @query('#message-input') private textarea!: HTMLTextAreaElement;

  private isMobile = detectMobile();
  private isIOSDevice = isIOS();
  private resizeObserver?: ResizeObserver;
  private lastViewportHeight = window.visualViewport?.height || window.innerHeight;

  connectedCallback() {
    super.connectedCallback();
    logger.log('Chat input connected');

    // Listen for viewport changes (virtual keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.handleViewportResize);
    }

    // Set up resize observer for textarea
    this.resizeObserver = new ResizeObserver(() => {
      this.adjustTextareaHeight();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    logger.log('Chat input disconnected');

    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.handleViewportResize);
    }

    this.resizeObserver?.disconnect();
  }

  firstUpdated() {
    // Observe textarea for size changes
    if (this.textarea && this.resizeObserver) {
      this.resizeObserver.observe(this.textarea);
    }
  }

  private handleViewportResize = () => {
    const currentHeight = window.visualViewport?.height || window.innerHeight;
    const heightDiff = this.lastViewportHeight - currentHeight;

    // Virtual keyboard is likely shown if viewport shrinks
    if (heightDiff > 100 && this.isFocused) {
      logger.debug('Virtual keyboard detected, adjusting layout');
      // Scroll input into view if needed
      requestAnimationFrame(() => {
        this.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }

    this.lastViewportHeight = currentHeight;
  };

  private handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.value = target.value;
    this.adjustTextareaHeight();
  }

  private adjustTextareaHeight() {
    if (!this.textarea) return;

    // Reset height to calculate new scrollHeight
    this.textarea.style.height = 'auto';
    const scrollHeight = this.textarea.scrollHeight;

    // Calculate rows based on content
    const newRows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.ceil(scrollHeight / ROW_HEIGHT)));

    // Update rows if changed
    if (newRows !== this.rows) {
      this.rows = newRows;
    }

    // Set exact height
    this.textarea.style.height = `${Math.min(scrollHeight, MAX_ROWS * ROW_HEIGHT)}px`;
  }

  private handleKeyDown(event: KeyboardEvent) {
    // Handle IME composition for languages like Japanese, Chinese
    if (this.isComposing) return;

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private handleCompositionStart = () => {
    this.isComposing = true;
  };

  private handleCompositionEnd = () => {
    this.isComposing = false;
  };

  private handleFocus = () => {
    this.isFocused = true;
    logger.debug('Input focused');

    this.dispatchEvent(
      new CustomEvent('focus-change', {
        detail: true,
        bubbles: true,
        composed: true,
      })
    );

    // iOS-specific: Prevent zoom on input focus
    if (this.isIOSDevice) {
      document
        .querySelector('meta[name="viewport"]')
        ?.setAttribute(
          'content',
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
        );
    }
  };

  private handleBlur = () => {
    this.isFocused = false;
    logger.debug('Input blurred');

    this.dispatchEvent(
      new CustomEvent('focus-change', {
        detail: false,
        bubbles: true,
        composed: true,
      })
    );

    // iOS-specific: Re-enable zoom after blur
    if (this.isIOSDevice) {
      document
        .querySelector('meta[name="viewport"]')
        ?.setAttribute('content', 'width=device-width, initial-scale=1');
    }
  };

  private sendMessage() {
    const trimmedValue = this.value.trim();
    if (!trimmedValue || this.disabled || this.loading || !this.active) {
      return;
    }

    logger.log(`Sending message: ${trimmedValue.substring(0, 50)}...`);

    this.dispatchEvent(
      new CustomEvent('send-message', {
        detail: trimmedValue,
        bubbles: true,
        composed: true,
      })
    );

    // Clear input
    this.value = '';
    this.rows = MIN_ROWS;
    if (this.textarea) {
      this.textarea.style.height = 'auto';
    }

    // Keep focus on mobile for continuous typing
    if (this.isMobile) {
      requestAnimationFrame(() => {
        this.textarea?.focus();
      });
    }
  }

  render() {
    const isDisabled = this.disabled || !this.active;

    return html`
      <div
        class="chat-input-container flex items-end gap-2 px-4 py-3 border-t border-gray-800 bg-gray-900"
        style="z-index: ${Z_INDEX.MOBILE_OVERLAY}"
      >
        <!-- Textarea container -->
        <div class="flex-1 relative">
          <textarea
            id="message-input"
            .value=${this.value}
            @input=${this.handleInput}
            @keydown=${this.handleKeyDown}
            @focus=${this.handleFocus}
            @blur=${this.handleBlur}
            @compositionstart=${this.handleCompositionStart}
            @compositionend=${this.handleCompositionEnd}
            placeholder=${this.placeholder}
            ?disabled=${isDisabled}
            rows=${this.rows}
            class="w-full resize-none rounded-lg bg-gray-800 px-4 py-3 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style="min-height: 48px; max-height: ${MAX_ROWS * ROW_HEIGHT}px;"
            aria-label="Message input"
            aria-multiline="true"
            enterkeyhint=${this.isMobile ? 'send' : 'enter'}
          ></textarea>

          <!-- Character counter for long messages -->
          ${
            this.value.length > 1000
              ? html`
                <div
                  class="absolute bottom-1 right-2 text-xs ${
                    this.value.length > 2000 ? 'text-red-400' : 'text-gray-500'
                  }"
                >
                  ${this.value.length}/2000
                </div>
              `
              : nothing
          }
        </div>

        <!-- Send button -->
        <button
          @click=${this.sendMessage}
          ?disabled=${isDisabled || !this.value.trim()}
          class="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          ${
            this.loading
              ? html`
                <svg
                  class="animate-spin h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              `
              : html`
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              `
          }
        </button>
      </div>

      <!-- Mobile keyboard hint -->
      ${
        this.isMobile && !this.isFocused && this.active
          ? html`
            <div
              class="text-center text-xs text-gray-500 py-2 bg-gray-900"
            >
              Tap to type • Enter to send${!this.isIOSDevice ? ' • Shift+Enter for new line' : ''}
            </div>
          `
          : nothing
      }

      <!-- Session inactive notice -->
      ${
        !this.active
          ? html`
            <div
              class="text-center text-xs text-yellow-500 py-2 bg-gray-900"
            >
              Session is not active
            </div>
          `
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-input': ChatInput;
  }
}
