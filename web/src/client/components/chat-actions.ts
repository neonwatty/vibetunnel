/**
 * Chat Actions Component
 *
 * Quick action buttons for the mobile chat view, providing common actions
 * like stopping sessions, clearing chat, and copying messages.
 *
 * @fires stop-session - When user clicks stop session button
 * @fires clear-chat - When user clicks clear chat button
 * @fires copy-all - When user clicks copy all button
 */

import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Session } from '../../shared/types.js';
import { Z_INDEX } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { detectMobile } from '../utils/mobile-utils.js';

const logger = createLogger('chat-actions');

@customElement('chat-actions')
export class ChatActions extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Object }) session: Session | null = null;
  @property({ type: Boolean }) hasMessages = false;
  @property({ type: Boolean }) disabled = false;

  @state() private copyButtonText = 'Copy All';
  @state() private copyButtonDisabled = false;

  private isMobile = detectMobile();

  private handleStopSession() {
    if (this.disabled || !this.session || this.session.status !== 'running') {
      return;
    }

    logger.log('Stop session clicked');
    this.dispatchEvent(
      new CustomEvent('stop-session', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleClearChat() {
    if (this.disabled || !this.hasMessages) {
      return;
    }

    logger.log('Clear chat clicked');
    this.dispatchEvent(
      new CustomEvent('clear-chat', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private async handleCopyAll() {
    if (this.disabled || !this.hasMessages || this.copyButtonDisabled) {
      return;
    }

    logger.log('Copy all clicked');

    // Disable button temporarily to prevent double clicks
    this.copyButtonDisabled = true;
    this.copyButtonText = 'Copying...';

    this.dispatchEvent(
      new CustomEvent('copy-all', {
        bubbles: true,
        composed: true,
      })
    );

    // Show success feedback
    setTimeout(() => {
      this.copyButtonText = 'Copied!';
      setTimeout(() => {
        this.copyButtonText = 'Copy All';
        this.copyButtonDisabled = false;
      }, 1500);
    }, 100);
  }

  render() {
    const canStop = this.session && this.session.status === 'running';
    const canClear = this.hasMessages;
    const canCopy = this.hasMessages;

    return html`
      <div 
        class="chat-actions flex items-center justify-center gap-4 px-4 py-2 bg-surface/50 backdrop-blur-sm border-t border-border"
        style="z-index: ${Z_INDEX.MOBILE_OVERLAY}"
      >
        <!-- Stop Session Button -->
        <button
          @click=${this.handleStopSession}
          ?disabled=${this.disabled || !canStop}
          class="flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all
                 ${
                   canStop && !this.disabled
                     ? 'bg-status-error/20 text-status-error hover:bg-status-error/30 active:bg-status-error/40'
                     : 'bg-surface/50 text-text-dim cursor-not-allowed opacity-50'
                 }"
          aria-label="Stop session"
          title="${this.isMobile ? '' : 'Stop the current session'}"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M6 6h12v12H6z" />
          </svg>
          ${!this.isMobile ? html`<span class="text-sm font-medium">Stop</span>` : ''}
        </button>

        <!-- Clear Chat Button -->
        <button
          @click=${this.handleClearChat}
          ?disabled=${this.disabled || !canClear}
          class="flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all
                 ${
                   canClear && !this.disabled
                     ? 'bg-status-warning/20 text-status-warning hover:bg-status-warning/30 active:bg-status-warning/40'
                     : 'bg-surface/50 text-text-dim cursor-not-allowed opacity-50'
                 }"
          aria-label="Clear chat"
          title="${this.isMobile ? '' : 'Clear all chat messages'}"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          ${!this.isMobile ? html`<span class="text-sm font-medium">Clear</span>` : ''}
        </button>

        <!-- Copy All Button -->
        <button
          @click=${this.handleCopyAll}
          ?disabled=${this.disabled || !canCopy || this.copyButtonDisabled}
          class="flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all
                 ${
                   canCopy && !this.disabled && !this.copyButtonDisabled
                     ? 'bg-primary/20 text-primary hover:bg-primary/30 active:bg-primary/40'
                     : 'bg-gray-700/50 text-gray-500 cursor-not-allowed opacity-50'
                 }"
          aria-label="Copy all messages"
          title="${this.isMobile ? '' : 'Copy all messages to clipboard'}"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${
              this.copyButtonText === 'Copied!'
                ? html`
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M5 13l4 4L19 7" />
              `
                : html`
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              `
            }
          </svg>
          ${!this.isMobile ? html`<span class="text-sm font-medium">${this.copyButtonText}</span>` : ''}
        </button>
      </div>

      <!-- Mobile Touch Target Helper -->
      ${
        this.isMobile
          ? html`
        <style>
          .chat-actions button {
            min-width: 44px;
            min-height: 44px;
          }
        </style>
      `
          : ''
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-actions': ChatActions;
  }
}
