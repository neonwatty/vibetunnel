/**
 * Chat Bubble Component
 *
 * Renders individual chat messages with appropriate styling for different message types.
 * Supports collapsible thinking blocks, code segments, and copy functionality.
 *
 * @fires copy-message - When copy button is clicked (detail: string)
 */

import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  type ChatMessage,
  ChatMessageType,
  type ContentSegment,
  ContentSegmentType,
} from '../../shared/types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('chat-bubble');

@customElement('chat-bubble')
export class ChatBubble extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Object }) message: ChatMessage | null = null;
  @property({ type: Boolean }) isGrouped = false; // Whether this is part of a group
  @property({ type: Boolean }) isFirstInGroup = true; // First message in a group
  @property({ type: Boolean }) isLastInGroup = true; // Last message in a group

  @state() private expandedThinking = new Set<string>(); // Track expanded thinking blocks
  @state() private copied = false; // Show copy feedback

  private copyTimeout?: number;

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout);
    }
  }

  private handleCopy() {
    if (!this.message) return;

    // Get full message text
    const text = this.message.content
      .map((segment) => {
        if (segment.type === ContentSegmentType.CODE) {
          return `\`\`\`${segment.language || ''}\n${segment.content}\n\`\`\``;
        }
        return segment.content;
      })
      .join('\n');

    // Copy to clipboard
    navigator.clipboard.writeText(text).then(
      () => {
        this.copied = true;
        if (this.copyTimeout) clearTimeout(this.copyTimeout);
        this.copyTimeout = window.setTimeout(() => {
          this.copied = false;
        }, 2000);

        this.dispatchEvent(
          new CustomEvent('copy-message', {
            detail: text,
            bubbles: true,
            composed: true,
          })
        );
      },
      (err) => {
        logger.error('Failed to copy message', err);
      }
    );
  }

  private toggleThinking(segmentId: string) {
    const newExpanded = new Set(this.expandedThinking);
    if (newExpanded.has(segmentId)) {
      newExpanded.delete(segmentId);
    } else {
      newExpanded.add(segmentId);
    }
    this.expandedThinking = newExpanded;
  }

  private formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    // Format as date for older messages
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private renderSegment(segment: ContentSegment, index: number) {
    const segmentId = `${this.message?.id}-${index}`;

    switch (segment.type) {
      case ContentSegmentType.TEXT:
        return html`
          <div class="whitespace-pre-wrap break-words">${segment.content}</div>
        `;

      case ContentSegmentType.CODE:
        return html`
          <div class="my-2 overflow-hidden rounded-lg bg-gray-900 dark:bg-gray-950">
            ${
              segment.language
                ? html`
                  <div
                    class="flex items-center justify-between border-b border-gray-700 px-3 py-1.5"
                  >
                    <span class="text-xs text-gray-400">${segment.language}</span>
                  </div>
                `
                : nothing
            }
            <pre
              class="overflow-x-auto p-3 text-sm"
            ><code class="text-gray-100">${segment.content}</code></pre>
          </div>
        `;

      case ContentSegmentType.THINKING: {
        const isExpanded = this.expandedThinking.has(segmentId);
        return html`
          <div
            class="my-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
          >
            <button
              @click=${() => this.toggleThinking(segmentId)}
              class="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50"
              aria-expanded=${isExpanded}
              aria-label="${isExpanded ? 'Collapse' : 'Expand'} thinking"
            >
              <span class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <svg
                  class="h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <span class="italic">Thinking...</span>
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-500">
                ${isExpanded ? 'Click to hide' : 'Click to show'}
              </span>
            </button>
            ${
              isExpanded
                ? html`
                  <div
                    class="border-t border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400"
                  >
                    <pre class="whitespace-pre-wrap break-words">${segment.content}</pre>
                  </div>
                `
                : nothing
            }
          </div>
        `;
      }

      default:
        return nothing;
    }
  }

  render() {
    if (!this.message) return nothing;

    const isUser = this.message.type === ChatMessageType.USER;
    const isError = this.message.type === ChatMessageType.ERROR;
    const isSystem = this.message.type === ChatMessageType.SYSTEM;

    // Bubble styling based on message type
    const bubbleClasses = [
      'relative max-w-[85%] px-4 py-3 rounded-2xl',
      isUser
        ? 'bg-blue-500 text-white dark:bg-blue-600'
        : isError
          ? 'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200 border border-red-200 dark:border-red-800'
          : isSystem
            ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
    ].join(' ');

    // Container styling with grouped message handling
    const containerClasses = [
      'flex',
      isUser ? 'justify-end' : 'justify-start',
      this.isGrouped && !this.isFirstInGroup ? 'mt-1' : 'mt-4',
    ].join(' ');

    return html`
      <div class="${containerClasses}">
        <div class="relative max-w-[85%] lg:max-w-[70%]">
          <!-- Avatar and timestamp for first in group -->
          ${
            this.isFirstInGroup
              ? html`
                <div
                  class="mb-1 flex items-center gap-2 ${isUser ? 'justify-end pr-2' : 'pl-2'}"
                >
                  ${
                    !isUser
                      ? html`
                        <div
                          class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${
                            isError
                              ? 'from-red-400 to-red-600'
                              : isSystem
                                ? 'from-gray-400 to-gray-600'
                                : 'from-purple-400 to-purple-600'
                          } text-xs font-medium text-white"
                        >
                          ${isError ? '!' : isSystem ? 'S' : 'C'}
                        </div>
                      `
                      : nothing
                  }
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    ${this.formatTimestamp(this.message.timestamp)}
                  </span>
                </div>
              `
              : nothing
          }

          <!-- Message bubble -->
          <div class="${bubbleClasses}">
            <!-- Message content -->
            <div class="space-y-2">
              ${this.message.content.map((segment, index) => this.renderSegment(segment, index))}
            </div>

            <!-- Copy button for non-user messages -->
            ${
              !isUser && this.isLastInGroup
                ? html`
                  <button
                    @click=${this.handleCopy}
                    class="absolute -bottom-6 right-0 flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Copy message"
                  >
                    ${
                      this.copied
                        ? html`
                          <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fill-rule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clip-rule="evenodd"
                            />
                          </svg>
                          <span>Copied!</span>
                        `
                        : html`
                          <svg
                            class="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                            />
                          </svg>
                          <span>Copy</span>
                        `
                    }
                  </button>
                `
                : nothing
            }
          </div>
        </div>
      </div>
    `;
  }
}

// Declare the element for TypeScript
declare global {
  interface HTMLElementTagNameMap {
    'chat-bubble': ChatBubble;
  }
}
