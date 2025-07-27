/**
 * Chat View Component
 *
 * Mobile-optimized chat interface for Claude interactions. Displays parsed chat messages
 * from terminal output with virtual scrolling for performance.
 *
 * @fires chat-input - When user sends a message (detail: string)
 * @fires navigate-back - When navigating back to terminal view
 * @fires error - When an error occurs (detail: string)
 */

import { html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import type { ChatMessage, ChatMessageType, Session } from '../../shared/types.js';
import { authClient } from '../services/auth-client.js';
import { chatSubscriptionService } from '../services/chat-subscription-service.js';
import { sessionActionService } from '../services/session-action-service.js';
import { Z_INDEX } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { detectMobile } from '../utils/mobile-utils.js';
import { mobileViewportManager, type ViewportState } from '../utils/mobile-viewport.js';
import './chat-actions.js';
import './chat-bubble.js';
import './chat-input.js';

const logger = createLogger('chat-view');

// Message buffer size for virtual scrolling
const MESSAGE_BUFFER_SIZE = 100;
const SCROLL_BUFFER_PIXELS = 100;

interface MessageGroup {
  type: ChatMessageType;
  messages: ChatMessage[];
  timestamp: number;
}

@customElement('chat-view')
export class ChatView extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Object }) session: Session | null = null;
  @property({ type: String }) sessionId = '';
  @property({ type: Boolean }) active = false;

  @state() private messages: ChatMessage[] = [];
  @state() private messageGroups: MessageGroup[] = [];
  @state() private isAutoScrollEnabled = true;
  @state() private isLoading = false;
  @state() private visibleStartIndex = 0;
  @state() private visibleEndIndex = 50;
  @state() private keyboardHeight = 0;
  @state() private isKeyboardVisible = false;

  private ws: WebSocket | null = null;
  private scrollContainer: HTMLElement | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private isMobile = detectMobile();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private lastScrollTop = 0;
  private viewportResizeTimeout: number | null = null;
  private viewportUnsubscribe?: () => void;

  connectedCallback() {
    super.connectedCallback();
    logger.log('Chat view connected');

    // Set up intersection observer for pull-to-refresh
    this.setupIntersectionObserver();

    // Subscribe to viewport changes
    this.viewportUnsubscribe = mobileViewportManager.subscribe(this.handleViewportStateChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    logger.log('Chat view disconnected');

    this.cleanupWebSocket();
    this.intersectionObserver?.disconnect();

    if (this.viewportUnsubscribe) {
      this.viewportUnsubscribe();
    }

    if (this.viewportResizeTimeout) {
      clearTimeout(this.viewportResizeTimeout);
    }
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    if (changedProperties.has('sessionId') && this.sessionId) {
      logger.log(`Session ID changed to: ${this.sessionId}`);
      this.connectToWebSocket();
    }

    if (changedProperties.has('active')) {
      if (this.active && !this.ws) {
        this.connectToWebSocket();
      } else if (!this.active && this.ws) {
        this.cleanupWebSocket();
      }
    }

    // Auto-scroll on new messages
    if (changedProperties.has('messages')) {
      this.updateMessageGroups();
      if (this.isAutoScrollEnabled) {
        requestAnimationFrame(() => this.scrollToBottom());
      }
    }
  }

  private connectToWebSocket() {
    if (!this.sessionId) {
      logger.warn('No session ID provided');
      return;
    }

    this.cleanupWebSocket();

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/buffers`;

      logger.log(`Connecting to WebSocket at ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        logger.log('WebSocket connected');
        this.reconnectAttempts = 0;

        // Subscribe to session with chat enabled
        this.ws?.send(
          JSON.stringify({
            type: 'subscribe',
            sessionId: this.sessionId,
            enableChat: true,
          })
        );
      };

      this.ws.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        this.dispatchEvent(
          new CustomEvent('error', {
            detail: 'Connection error. Please try again.',
            bubbles: true,
            composed: true,
          })
        );
      };

      this.ws.onclose = () => {
        logger.log('WebSocket closed');
        this.ws = null;

        // Attempt reconnection if active
        if (this.active && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * 2 ** (this.reconnectAttempts - 1);
          logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connectToWebSocket(), delay);
        }
      };
    } catch (error) {
      logger.error('Failed to connect to WebSocket:', error);
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: 'Failed to connect to chat',
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private cleanupWebSocket() {
    if (this.ws) {
      logger.log('Cleaning up WebSocket connection');

      // Unsubscribe from session
      if (this.sessionId && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'unsubscribe',
            sessionId: this.sessionId,
          })
        );
      }

      this.ws.close();
      this.ws = null;
    }
  }

  private handleWebSocketMessage(event: MessageEvent) {
    try {
      // Handle text messages (JSON)
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);

        if (data.type === 'chatMessage' && data.message) {
          this.handleChatMessage(data.message as ChatMessage);
        } else if (data.type === 'error') {
          logger.error('Server error:', data.message);
          this.dispatchEvent(
            new CustomEvent('error', {
              detail: data.message,
              bubbles: true,
              composed: true,
            })
          );
        }
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
    }
  }

  private handleChatMessage(message: ChatMessage) {
    logger.debug(`Received ${message.type} message with ${message.content.length} segments`);

    // Add message to list
    this.messages = [...this.messages, message];

    // Trim old messages if exceeding buffer size
    if (this.messages.length > MESSAGE_BUFFER_SIZE) {
      this.messages = this.messages.slice(-MESSAGE_BUFFER_SIZE);
    }

    // Clear loading state when receiving assistant messages
    if (message.type === 'assistant') {
      this.isLoading = false;
    }
  }

  private updateMessageGroups() {
    // Group consecutive messages by type for better visual organization
    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    for (const message of this.messages) {
      if (!currentGroup || currentGroup.type !== message.type) {
        currentGroup = {
          type: message.type,
          messages: [message],
          timestamp: message.timestamp,
        };
        groups.push(currentGroup);
      } else {
        currentGroup.messages.push(message);
      }
    }

    this.messageGroups = groups;
  }

  private setupIntersectionObserver() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.target.classList.contains('pull-to-refresh-trigger')) {
            this.handlePullToRefresh();
          }
        });
      },
      { rootMargin: '50px' }
    );
  }

  private handlePullToRefresh() {
    if (this.isLoading) return;

    logger.log('Pull to refresh triggered');
    this.isLoading = true;

    // TODO: Implement history loading from server
    // For now, just simulate loading
    setTimeout(() => {
      this.isLoading = false;
    }, 1000);
  }

  private handleScroll(event: Event) {
    const target = event.target as HTMLElement;

    // Disable auto-scroll if user scrolls up
    const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 50;
    this.isAutoScrollEnabled = isAtBottom;

    // Update visible range for virtual scrolling
    this.updateVisibleRange();
  }

  private updateVisibleRange() {
    if (!this.scrollContainer) return;

    const containerHeight = this.scrollContainer.clientHeight;
    const scrollTop = this.scrollContainer.scrollTop;
    const itemHeight = 80; // Approximate height per message group

    this.visibleStartIndex = Math.max(
      0,
      Math.floor((scrollTop - SCROLL_BUFFER_PIXELS) / itemHeight)
    );
    this.visibleEndIndex = Math.min(
      this.messageGroups.length,
      Math.ceil((scrollTop + containerHeight + SCROLL_BUFFER_PIXELS) / itemHeight)
    );
  }

  private scrollToBottom(smooth = false) {
    if (!this.scrollContainer) return;

    // On mobile with keyboard visible, ensure we account for keyboard height
    const behavior = smooth ? 'smooth' : 'auto';

    this.scrollContainer.scrollTo({
      top: this.scrollContainer.scrollHeight,
      behavior: behavior as ScrollBehavior,
    });

    this.isAutoScrollEnabled = true;
  }

  private handleViewportStateChange = (state: ViewportState) => {
    const wasKeyboardVisible = this.isKeyboardVisible;
    this.isKeyboardVisible = state.isKeyboardVisible;
    this.keyboardHeight = state.keyboardHeight;

    logger.debug('Viewport state changed:', {
      isKeyboardVisible: state.isKeyboardVisible,
      keyboardHeight: state.keyboardHeight,
      orientation: state.orientation,
      hasNotch: state.hasNotch,
    });

    // If keyboard just became visible, ensure input is in view
    if (!wasKeyboardVisible && state.isKeyboardVisible) {
      requestAnimationFrame(() => {
        this.ensureInputVisible();
      });
    }

    // Handle orientation changes
    if (state.orientation !== this.lastOrientation) {
      this.lastOrientation = state.orientation;
      this.handleOrientationChange();
    }

    // Update layout
    this.requestUpdate();
  };

  private lastOrientation?: 'portrait' | 'landscape';

  private handleOrientationChange() {
    logger.log('Orientation changed');

    // Save scroll position
    if (this.scrollContainer) {
      this.lastScrollTop = this.scrollContainer.scrollTop;
    }

    // Update layout after orientation change
    requestAnimationFrame(() => {
      if (this.scrollContainer && this.lastScrollTop > 0) {
        this.scrollContainer.scrollTop = this.lastScrollTop;
      }
      this.updateVisibleRange();
    });
  }

  private ensureInputVisible() {
    const chatInput = this.querySelector('chat-input');
    if (chatInput && this.scrollContainer) {
      // Use viewport manager to ensure element is visible
      mobileViewportManager.ensureElementVisible(chatInput as HTMLElement, {
        padding: 40,
        animated: true,
      });

      // Also scroll to bottom in chat
      this.scrollToBottom(true);
    }
  }

  private async handleStopSession() {
    if (!this.session || this.session.status !== 'running') {
      return;
    }

    logger.log('Stopping session', { sessionId: this.session.id });

    try {
      await sessionActionService.terminateSession(this.session, {
        authClient,
        callbacks: {
          onSuccess: () => {
            logger.log('Session stopped successfully');
            // Navigate back to terminal view
            this.dispatchEvent(
              new CustomEvent('navigate-back', {
                bubbles: true,
                composed: true,
              })
            );
          },
          onError: (message) => {
            logger.error('Failed to stop session:', message);
            this.dispatchEvent(
              new CustomEvent('error', {
                detail: message,
                bubbles: true,
                composed: true,
              })
            );
          },
        },
      });
    } catch (error) {
      logger.error('Error stopping session:', error);
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: 'Failed to stop session',
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private handleClearChat() {
    logger.log('Clearing chat messages');

    // Clear local messages
    this.messages = [];
    this.messageGroups = [];

    // Clear cached messages in subscription service
    if (this.sessionId) {
      chatSubscriptionService.clearCache(this.sessionId);
    }

    // Notify user
    logger.log('Chat cleared');
  }

  private async handleCopyAll() {
    if (this.messages.length === 0) {
      return;
    }

    logger.log('Copying all messages to clipboard');

    try {
      // Format messages as text
      const text = this.messages
        .map((msg) => {
          const prefix =
            msg.type === 'user' ? 'User' : msg.type === 'assistant' ? 'Assistant' : 'System';
          const content = msg.content
            .map((segment) => {
              if (segment.type === 'code') {
                return `\`\`\`${segment.language || ''}\n${segment.content}\n\`\`\``;
              }
              return segment.content;
            })
            .join('');
          return `${prefix}: ${content}`;
        })
        .join('\n\n');

      // Copy to clipboard
      await navigator.clipboard.writeText(text);
      logger.log('Messages copied to clipboard');
    } catch (error) {
      logger.error('Failed to copy messages:', error);
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: 'Failed to copy messages to clipboard',
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private handleSendMessage(event: CustomEvent<string>) {
    const message = event.detail;
    if (!message || !this.sessionId) return;

    logger.log(`Sending message: ${message.substring(0, 50)}...`);

    // Send message to server via WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'sendInput',
          sessionId: this.sessionId,
          input: message,
        })
      );

      // Set loading state
      this.isLoading = true;

      // Auto-scroll to bottom when sending message
      requestAnimationFrame(() => {
        this.scrollToBottom(true);
      });

      // Clear loading state after a timeout (server should send response)
      setTimeout(() => {
        this.isLoading = false;
      }, 5000);
    } else {
      logger.error('WebSocket not connected');
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: 'Not connected to server',
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private renderMessageGroup(group: MessageGroup) {
    return html`
      <div class="message-group">
        ${repeat(
          group.messages,
          (msg) => msg.id,
          (message, index) => html`
            <chat-bubble
              .message=${message}
              .isGrouped=${true}
              .isFirstInGroup=${index === 0}
              .isLastInGroup=${index === group.messages.length - 1}
              @copy-message=${(e: CustomEvent<string>) => {
                logger.debug('Message copied:', `${e.detail.substring(0, 50)}...`);
              }}
            ></chat-bubble>
          `
        )}
      </div>
    `;
  }

  render() {
    return html`
      <div class="chat-view flex flex-col h-full bg-gray-900 text-white">
        <!-- Header -->
        <div class="chat-header flex items-center justify-between px-4 py-3 border-b border-gray-800" 
             style="z-index: ${Z_INDEX.MOBILE_OVERLAY}">
          <button
            @click=${() => this.dispatchEvent(new CustomEvent('navigate-back', { bubbles: true, composed: true }))}
            class="p-2 hover:bg-gray-800 rounded"
            aria-label="Back to terminal"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div class="flex-1 text-center">
            <h2 class="text-lg font-medium">${this.session?.name || 'Chat'}</h2>
            ${
              this.session?.sessionType === 'claude'
                ? html`
              <div class="text-xs text-gray-500">Claude Assistant</div>
            `
                : ''
            }
          </div>

          <button
            @click=${this.scrollToBottom}
            class="p-2 hover:bg-gray-800 rounded ${this.isAutoScrollEnabled ? 'opacity-50' : ''}"
            aria-label="Scroll to bottom"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>

        <!-- Messages container -->
        <div 
          class="flex-1 overflow-y-auto px-4 py-4 ${
            this.isMobile ? 'overscroll-behavior-contain' : ''
          }"
          @scroll=${this.handleScroll}
          id="scroll-container"
          style="${
            this.isMobile && this.isKeyboardVisible
              ? `padding-bottom: ${Math.max(100, this.keyboardHeight)}px;`
              : ''
          }"
        >
          <!-- Pull to refresh trigger -->
          <div class="pull-to-refresh-trigger h-1"></div>
          
          ${
            this.isLoading
              ? html`
            <div class="text-center py-4">
              <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            </div>
          `
              : ''
          }

          <!-- Message groups with virtual scrolling -->
          <div id="messages-container">
            ${
              this.messageGroups.length === 0
                ? html`
              <div class="text-center text-gray-500 py-8">
                <p>No messages yet</p>
                <p class="text-sm mt-2">Type in the terminal to start a conversation</p>
              </div>
            `
                : repeat(
                    this.messageGroups.slice(this.visibleStartIndex, this.visibleEndIndex),
                    (group) => `${group.type}-${group.timestamp}`,
                    (group) => this.renderMessageGroup(group)
                  )
            }
          </div>

          <!-- Auto-scroll indicator -->
          ${
            !this.isAutoScrollEnabled
              ? html`
            <button
              @click=${this.scrollToBottom}
              class="fixed bottom-20 right-4 bg-blue-600 text-white rounded-full p-3 shadow-lg"
              style="z-index: ${Z_INDEX.MOBILE_OVERLAY}"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          `
              : ''
          }
        </div>

        <!-- Chat actions (mobile only) -->
        ${
          this.isMobile
            ? html`
          <chat-actions
            .session=${this.session}
            .hasMessages=${this.messages.length > 0}
            ?disabled=${!this.active || !this.ws}
            @stop-session=${this.handleStopSession}
            @clear-chat=${this.handleClearChat}
            @copy-all=${this.handleCopyAll}
          ></chat-actions>
        `
            : ''
        }

        <!-- Chat input -->
        <chat-input
          ?active=${this.active && this.session !== null}
          ?loading=${this.isLoading}
          @send-message=${this.handleSendMessage}
          @focus-change=${(e: CustomEvent<boolean>) => {
            logger.debug(`Input focus changed: ${e.detail}`);
            // Auto-scroll when keyboard opens
            if (e.detail && this.isMobile) {
              // Use smooth scroll when focusing
              requestAnimationFrame(() => {
                this.scrollToBottom(true);
                this.ensureInputVisible();
              });
            }
          }}
        ></chat-input>
      </div>
    `;
  }

  firstUpdated() {
    this.scrollContainer = this.querySelector('#scroll-container') as HTMLElement;

    // Set up intersection observer
    if (this.intersectionObserver && this.scrollContainer) {
      const trigger = this.querySelector('.pull-to-refresh-trigger');
      if (trigger) {
        this.intersectionObserver.observe(trigger);
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-view': ChatView;
  }
}
