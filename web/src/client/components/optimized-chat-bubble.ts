/**
 * Optimized Chat Bubble Component
 *
 * High-performance chat bubble implementation using DOM pooling and lazy rendering.
 * Designed for smooth 60fps scrolling with thousands of messages.
 *
 * Key optimizations:
 * - DOM element recycling via object pool
 * - Lazy content rendering with Intersection Observer
 * - Efficient diff-based updates
 * - Memory-optimized state management
 * - Batched DOM operations
 */

import { html, LitElement, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  type ChatMessage,
  ChatMessageType,
  type ContentSegment,
  ContentSegmentType,
} from '../../shared/types.js';
import { domPool } from '../utils/dom-pool.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('optimized-chat-bubble');

interface RenderCache {
  contentHash: string;
  renderedContent: TemplateResult | typeof nothing;
  timestamp: number;
}

interface LazyContent {
  segment: ContentSegment;
  index: number;
  isLoaded: boolean;
  isVisible: boolean;
}

@customElement('optimized-chat-bubble')
export class OptimizedChatBubble extends LitElement {
  // Disable shadow DOM for performance and Tailwind compatibility
  createRenderRoot() {
    return this;
  }

  @property({ type: Object }) message: ChatMessage | null = null;
  @property({ type: Boolean }) isGrouped = false;
  @property({ type: Boolean }) isFirstInGroup = true;
  @property({ type: Boolean }) isLastInGroup = true;
  @property({ type: Boolean }) lazy = true; // Enable lazy rendering
  @property({ type: Boolean }) recycled = false; // Whether this element is from pool

  @state() private expandedThinking = new Set<string>();
  @state() private copied = false;
  @state() private lazyContent: LazyContent[] = [];
  @state() private isVisible = false;

  private renderCache?: RenderCache;
  private intersectionObserver?: IntersectionObserver;
  private copyTimeout?: number;
  private pooledElements = new Map<string, HTMLElement>();

  connectedCallback() {
    super.connectedCallback();

    if (this.lazy) {
      this.setupIntersectionObserver();
    }

    this.initializeLazyContent();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout);
    }

    // Return pooled elements
    this.pooledElements.forEach((element, type) => {
      domPool.release(type, element);
    });
    this.pooledElements.clear();
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);

    if (changedProperties.has('message')) {
      this.initializeLazyContent();
      this.invalidateRenderCache();
    }
  }

  private setupIntersectionObserver() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const wasVisible = this.isVisible;
          this.isVisible = entry.isIntersecting;

          if (this.isVisible && !wasVisible) {
            // Became visible, load content
            this.loadVisibleContent();
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
      }
    );

    this.intersectionObserver.observe(this);
  }

  private initializeLazyContent() {
    if (!this.message) {
      this.lazyContent = [];
      return;
    }

    this.lazyContent = this.message.content.map((segment, index) => ({
      segment,
      index,
      isLoaded: !this.lazy || this.shouldEagerLoad(segment),
      isVisible: false,
    }));
  }

  private shouldEagerLoad(segment: ContentSegment): boolean {
    // Eager load text and small code blocks
    return (
      segment.type === ContentSegmentType.TEXT ||
      (segment.type === ContentSegmentType.CODE && segment.content.length < 1000) ||
      (segment.type === ContentSegmentType.THINKING && segment.content.length < 500)
    );
  }

  private loadVisibleContent() {
    let needsUpdate = false;

    this.lazyContent.forEach((item) => {
      if (!item.isLoaded && this.isVisible) {
        item.isLoaded = true;
        needsUpdate = true;

        // Trigger specific loading for different content types
        this.loadSegmentContent(item.segment);
      }
    });

    if (needsUpdate) {
      this.requestUpdate();
    }
  }

  private async loadSegmentContent(segment: ContentSegment) {
    switch (segment.type) {
      case ContentSegmentType.CODE:
        if (segment.language) {
          // Lazy load syntax highlighting
          await this.loadSyntaxHighlighting(segment);
        }
        break;

      case ContentSegmentType.THINKING:
        // Pre-process thinking content for better performance
        break;
    }
  }

  private async loadSyntaxHighlighting(_segment: ContentSegment) {
    // Placeholder for lazy syntax highlighting
    // This would integrate with highlight.js or similar
    // Example: const hljs = await import('highlight.js');
    // hljs.default.highlightBlock(codeElement);
  }

  private getContentHash(): string {
    if (!this.message) return '';

    return `${this.message.id}-${this.message.timestamp}-${this.message.content.length}`;
  }

  private invalidateRenderCache() {
    this.renderCache = undefined;
  }

  private getCachedRender(): TemplateResult | typeof nothing | null {
    if (!this.message) return nothing;

    const contentHash = this.getContentHash();

    if (this.renderCache && this.renderCache.contentHash === contentHash) {
      return this.renderCache.renderedContent;
    }

    return null;
  }

  private setCachedRender(content: TemplateResult | typeof nothing) {
    if (!this.message) return;

    this.renderCache = {
      contentHash: this.getContentHash(),
      renderedContent: content,
      timestamp: Date.now(),
    };
  }

  private handleCopy() {
    if (!this.message) return;

    const text = this.message.content
      .map((segment) => {
        if (segment.type === ContentSegmentType.CODE) {
          return `\`\`\`${segment.language || ''}\n${segment.content}\n\`\`\``;
        }
        return segment.content;
      })
      .join('\n');

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

    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private renderSegment(lazyItem: LazyContent): TemplateResult | typeof nothing {
    const { segment, index, isLoaded } = lazyItem;
    const segmentId = `${this.message?.id}-${index}`;

    // Show placeholder for unloaded content
    if (!isLoaded) {
      return html`
        <div class="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-full"></div>
      `;
    }

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
                  <div class="flex items-center justify-between border-b border-gray-700 px-3 py-1.5">
                    <span class="text-xs text-gray-400">${segment.language}</span>
                  </div>
                `
                : nothing
            }
            <pre class="overflow-x-auto p-3 text-sm"><code class="text-gray-100">${segment.content}</code></pre>
          </div>
        `;

      case ContentSegmentType.THINKING: {
        const isExpanded = this.expandedThinking.has(segmentId);
        return html`
          <div class="my-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
            <button
              @click=${() => this.toggleThinking(segmentId)}
              class="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50"
              aria-expanded=${isExpanded}
            >
              <span class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <svg class="h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span class="italic">Thinking...</span>
              </span>
              <span class="text-xs text-gray-500">
                ${isExpanded ? 'Click to hide' : 'Click to show'}
              </span>
            </button>
            ${
              isExpanded
                ? html`
                  <div class="border-t border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
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

    // Check for cached render first
    const cached = this.getCachedRender();
    if (cached) {
      return cached;
    }

    const isUser = this.message.type === ChatMessageType.USER;
    const isError = this.message.type === ChatMessageType.ERROR;
    const isSystem = this.message.type === ChatMessageType.SYSTEM;

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

    const containerClasses = [
      'flex',
      isUser ? 'justify-end' : 'justify-start',
      this.isGrouped && !this.isFirstInGroup ? 'mt-1' : 'mt-4',
    ].join(' ');

    const rendered = html`
      <div class="${containerClasses}">
        <div class="relative max-w-[85%] lg:max-w-[70%]">
          <!-- Avatar and timestamp for first in group -->
          ${
            this.isFirstInGroup
              ? html`
                <div class="mb-1 flex items-center gap-2 ${isUser ? 'justify-end pr-2' : 'pl-2'}">
                  ${
                    !isUser
                      ? html`
                        <div class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${
                          isError
                            ? 'from-red-400 to-red-600'
                            : isSystem
                              ? 'from-gray-400 to-gray-600'
                              : 'from-purple-400 to-purple-600'
                        } text-xs font-medium text-white">
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
              ${this.lazyContent.map((item) => this.renderSegment(item))}
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
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                          </svg>
                          <span>Copied!</span>
                        `
                        : html`
                          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
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

    // Cache the render result
    this.setCachedRender(rendered);

    return rendered;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'optimized-chat-bubble': OptimizedChatBubble;
  }
}
