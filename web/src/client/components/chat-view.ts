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
import './optimized-chat-bubble.js';
import './chat-input.js';
import './pull-to-refresh.js';
import './mobile-theme-toggle.js';
import { domPool } from '../utils/dom-pool.js';
import { themeManager } from '../utils/theme-manager.js';
import type { PullToRefreshState } from './pull-to-refresh.js';

const logger = createLogger('chat-view');

// Virtual scrolling configuration
const MESSAGE_BUFFER_SIZE = 100;
const SCROLL_BUFFER_PIXELS = 100;
const VIRTUAL_SCROLL_ITEM_HEIGHT = 80; // Base height estimate
const VIEWPORT_OVERSCAN = 5; // Extra items to render outside viewport
const INTERSECTION_THRESHOLD = 0.1;
const RENDER_BATCH_SIZE = 10; // Centralized batch size constant
const RENDER_THROTTLE_MS = 16; // ~60fps
const MIN_VISIBLE_ITEMS = 3; // Minimum items to keep visible
const MAX_HEIGHT_CACHE_SIZE = 1000; // Maximum height cache entries

// Pull-to-refresh constants
const PULL_THRESHOLD = 80;
const MAX_PULL_DISTANCE = 120;
const PULL_RESISTANCE_LOW = 0.6;
const PULL_RESISTANCE_HIGH = 0.3;
const MIN_PULL_TO_PREVENT_SCROLL = 10;
const REFRESH_INDICATOR_HEIGHT = 60;

interface MessageGroup {
  type: ChatMessageType;
  messages: ChatMessage[];
  timestamp: number;
  id: string; // Unique identifier for virtual scrolling
  estimatedHeight?: number; // Cached height for performance
  actualHeight?: number; // Measured height after render
  lineCount?: number; // Cached line count for height estimation
  contentHash?: string; // Hash of content for cache invalidation
}

interface VirtualScrollState {
  viewportHeight: number;
  scrollTop: number;
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  offsetBottom: number;
}

interface RenderBatch {
  groups: MessageGroup[];
  startIndex: number;
  endIndex: number;
  timestamp: number;
}

// TouchCoordinate interface for future use
// interface TouchCoordinate {
//   x: number;
//   y: number;
//   timestamp: number;
// }

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
  @state() private virtualScrollState: VirtualScrollState = {
    viewportHeight: 0,
    scrollTop: 0,
    totalHeight: 0,
    startIndex: 0,
    endIndex: 50,
    offsetTop: 0,
    offsetBottom: 0,
  };
  @state() private visibleGroups: MessageGroup[] = [];
  @state() private keyboardHeight = 0;
  @state() private isKeyboardVisible = false;
  @state() private pullToRefreshState: PullToRefreshState = 'idle';
  @state() private pullDistance = 0;
  @state() private hasMoreHistory = true;
  @state() private isVisible = true; // Track component visibility
  @state() private currentTheme: 'light' | 'dark' = 'light';

  private ws: WebSocket | null = null;
  private scrollContainer: HTMLElement | null = null;
  private isMobile = detectMobile();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private lastScrollTop = 0;
  private viewportResizeTimeout: number | null = null;
  private viewportUnsubscribe?: () => void;
  private touchStartY = 0;
  private isPulling = false;
  private isLoadingHistory = false;
  private touchStartHandler?: (e: TouchEvent) => void;
  private touchMoveHandler?: (e: TouchEvent) => void;
  private touchEndHandler?: () => void;
  private lastTouchMoveTime = 0;
  private touchMoveThrottle = 16; // ~60fps
  private intersectionObserver?: IntersectionObserver;
  private resizeObserver?: ResizeObserver;
  private renderRafId?: number;
  private lastRenderTime = 0;
  private pendingRenderBatch?: RenderBatch;
  private messageHeightCache = new Map<string, number>();
  private themeUnsubscribe?: () => void;

  connectedCallback() {
    super.connectedCallback();
    logger.log('Chat view connected');

    // Subscribe to viewport changes
    this.viewportUnsubscribe = mobileViewportManager.subscribe(this.handleViewportStateChange);

    // Subscribe to theme changes
    this.themeUnsubscribe = themeManager().subscribe((config) => {
      this.currentTheme = config.effective;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    logger.log('Chat view disconnected');

    this.cleanupWebSocket();
    this.cleanupTouchHandlers();
    this.cleanupVirtualScrolling();

    if (this.viewportUnsubscribe) {
      this.viewportUnsubscribe();
    }

    if (this.viewportResizeTimeout) {
      clearTimeout(this.viewportResizeTimeout);
    }

    if (this.themeUnsubscribe) {
      this.themeUnsubscribe();
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

    // Re-observe elements after render
    if (
      changedProperties.has('visibleGroups') &&
      this.resizeObserver &&
      this.intersectionObserver
    ) {
      requestAnimationFrame(() => {
        const groupElements = this.querySelectorAll('[data-group-id]');
        groupElements.forEach((element) => {
          this.resizeObserver?.observe(element);
          this.intersectionObserver?.observe(element);
        });
      });
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
    let groupIndex = 0;

    for (const message of this.messages) {
      if (!currentGroup || currentGroup.type !== message.type) {
        currentGroup = {
          type: message.type,
          messages: [message],
          timestamp: message.timestamp,
          id: `group-${groupIndex++}-${message.type}-${message.timestamp}`,
          estimatedHeight: VIRTUAL_SCROLL_ITEM_HEIGHT,
        };
        groups.push(currentGroup);
      } else {
        currentGroup.messages.push(message);
        // Update group ID to reflect all messages
        currentGroup.id = `group-${groupIndex - 1}-${message.type}-${currentGroup.timestamp}-${message.timestamp}`;
      }
    }

    this.messageGroups = groups;
    this.scheduleVirtualScrollUpdate();
  }

  private setupTouchHandlers() {
    if (!this.scrollContainer || !this.isMobile) return;

    // Touch start - record initial position
    this.touchStartHandler = (e: TouchEvent) => {
      if (this.pullToRefreshState === 'refreshing' || this.isLoadingHistory) return;

      this.touchStartY = e.touches[0].clientY;
      this.isPulling = false;
    };

    // Touch move - handle pull gesture with throttling
    this.touchMoveHandler = (e: TouchEvent) => {
      if (this.pullToRefreshState === 'refreshing' || this.isLoadingHistory) return;
      if (!this.hasMoreHistory) return;

      // Throttle touch move events
      const now = Date.now();
      if (now - this.lastTouchMoveTime < this.touchMoveThrottle) return;
      this.lastTouchMoveTime = now;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - this.touchStartY;

      // Only start pulling if at top of scroll and pulling down
      if (this.scrollContainer && this.scrollContainer.scrollTop === 0 && deltaY > 0) {
        this.isPulling = true;

        // Apply resistance factor for natural feel
        const resistance = deltaY > PULL_THRESHOLD ? PULL_RESISTANCE_HIGH : PULL_RESISTANCE_LOW;
        this.pullDistance = Math.min(deltaY * resistance, MAX_PULL_DISTANCE);

        // Update state based on pull distance
        if (this.pullDistance > PULL_THRESHOLD) {
          this.pullToRefreshState = 'releasing';
        } else {
          this.pullToRefreshState = 'pulling';
        }

        // Prevent default scrolling while pulling
        if (this.pullDistance > MIN_PULL_TO_PREVENT_SCROLL) {
          e.preventDefault();
        }
      } else if (this.isPulling && deltaY <= 0) {
        // User scrolled back up, cancel pull
        this.cancelPullToRefresh();
      }
    };

    // Touch end - trigger refresh if threshold met
    this.touchEndHandler = async () => {
      if (!this.isPulling) return;

      if (this.pullDistance > PULL_THRESHOLD && this.pullToRefreshState === 'releasing') {
        // Trigger refresh
        this.pullToRefreshState = 'refreshing';
        this.pullDistance = REFRESH_INDICATOR_HEIGHT; // Keep indicator visible during refresh

        await this.loadMessageHistory();
      } else {
        // Cancel pull
        this.cancelPullToRefresh();
      }
    };

    // Add event listeners
    this.scrollContainer.addEventListener('touchstart', this.touchStartHandler, { passive: true });
    this.scrollContainer.addEventListener('touchmove', this.touchMoveHandler, { passive: false });
    this.scrollContainer.addEventListener('touchend', this.touchEndHandler);
  }

  private cleanupTouchHandlers() {
    if (!this.scrollContainer) return;

    if (this.touchStartHandler) {
      this.scrollContainer.removeEventListener('touchstart', this.touchStartHandler);
    }
    if (this.touchMoveHandler) {
      this.scrollContainer.removeEventListener('touchmove', this.touchMoveHandler);
    }
    if (this.touchEndHandler) {
      this.scrollContainer.removeEventListener('touchend', this.touchEndHandler);
    }

    this.touchStartHandler = undefined;
    this.touchMoveHandler = undefined;
    this.touchEndHandler = undefined;
  }

  private cancelPullToRefresh() {
    this.isPulling = false;
    this.pullDistance = 0;
    this.pullToRefreshState = 'idle';
  }

  private async loadMessageHistory() {
    if (!this.sessionId || this.isLoadingHistory) return;

    logger.log('Loading message history...');
    this.isLoadingHistory = true;

    try {
      const result = await chatSubscriptionService.loadMessageHistory(this.sessionId);

      if (result.success) {
        this.hasMoreHistory = result.hasMore;
        this.pullToRefreshState = 'complete';
        logger.log('Message history loaded successfully');
      } else {
        this.pullToRefreshState = 'error';
        logger.error('Failed to load message history:', result.error);

        // Provide specific error feedback
        const errorMessage = result.error?.includes('Not connected')
          ? 'Connection lost. Please check your network.'
          : result.error || 'Failed to load messages';

        this.dispatchEvent(
          new CustomEvent('error', {
            detail: errorMessage,
            bubbles: true,
            composed: true,
          })
        );
      }
    } catch (error) {
      this.pullToRefreshState = 'error';
      logger.error('Error loading message history:', error);

      // Network error handling
      const isNetworkError = error instanceof TypeError && error.message.includes('fetch');
      const errorMessage = isNetworkError
        ? 'Network error. Please check your connection.'
        : 'Failed to load message history';

      this.dispatchEvent(
        new CustomEvent('error', {
          detail: errorMessage,
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.isLoadingHistory = false;
    }

    // Reset after animation completes
    setTimeout(() => {
      this.cancelPullToRefresh();
    }, 800);
  }

  private handleScroll(event: Event) {
    const target = event.target as HTMLElement;

    // Disable auto-scroll if user scrolls up
    const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 50;
    this.isAutoScrollEnabled = isAtBottom;

    // Throttle virtual scroll updates
    this.scheduleVirtualScrollUpdate();
  }

  private updateVirtualScrollState() {
    if (!this.scrollContainer) return;

    try {
      const viewportHeight = this.scrollContainer.clientHeight;
      const scrollTop = this.scrollContainer.scrollTop;

      // Calculate total height and visible range
      let totalHeight = 0;
      let startIndex = 0;
      let endIndex = this.messageGroups.length;
      let offsetTop = 0;
      let offsetBottom = 0;

      // Find start index based on scroll position
      for (let i = 0; i < this.messageGroups.length; i++) {
        const group = this.messageGroups[i];
        const height = this.getGroupHeight(group);

        if (totalHeight + height < scrollTop - SCROLL_BUFFER_PIXELS) {
          startIndex = i + 1;
          offsetTop = totalHeight + height;
        }

        totalHeight += height;

        if (
          totalHeight > scrollTop + viewportHeight + SCROLL_BUFFER_PIXELS &&
          endIndex === this.messageGroups.length
        ) {
          endIndex = Math.min(i + VIEWPORT_OVERSCAN, this.messageGroups.length);
          offsetBottom =
            totalHeight - (totalHeight - scrollTop - viewportHeight - SCROLL_BUFFER_PIXELS);
        }
      }

      // Ensure we render at least minimum items
      startIndex = Math.max(0, startIndex - VIEWPORT_OVERSCAN);
      endIndex = Math.max(startIndex + MIN_VISIBLE_ITEMS, endIndex);

      this.virtualScrollState = {
        viewportHeight,
        scrollTop,
        totalHeight,
        startIndex,
        endIndex,
        offsetTop,
        offsetBottom,
      };

      this.updateVisibleGroups();
    } catch (error) {
      logger.error('Virtual scrolling update failed:', error);

      // Fallback to simple rendering without virtual scrolling
      this.virtualScrollState = {
        viewportHeight: this.scrollContainer?.clientHeight || 0,
        scrollTop: this.scrollContainer?.scrollTop || 0,
        totalHeight: this.messageGroups.length * VIRTUAL_SCROLL_ITEM_HEIGHT,
        startIndex: 0,
        endIndex: Math.min(this.messageGroups.length, RENDER_BATCH_SIZE),
        offsetTop: 0,
        offsetBottom: 0,
      };

      this.updateVisibleGroups();

      // Dispatch error event for external handling
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: 'Virtual scrolling error - fallback mode enabled',
          bubbles: true,
          composed: true,
        })
      );
    }
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
      this.updateVirtualScrollState();
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

  private cleanupVirtualScrolling() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    if (this.renderRafId) {
      // Clear both types since we can't reliably distinguish
      // Modern browsers handle calling wrong clear function gracefully
      try {
        clearTimeout(this.renderRafId);
        cancelAnimationFrame(this.renderRafId);
      } catch {
        // Ignore any errors from clearing the wrong type
      }
      this.renderRafId = undefined;
    }

    // Return any pooled elements
    this.returnPooledElements();
  }

  private returnPooledElements() {
    // Clean up any pooled DOM elements
    const pooledElements = this.querySelectorAll('[data-pooled="true"]');
    pooledElements.forEach((element) => {
      const poolType = element.getAttribute('data-pool-type');
      if (poolType) {
        domPool.release(poolType, element as HTMLElement);
      }
    });
  }

  private setupVirtualScrolling() {
    if (!this.scrollContainer) return;

    // Setup Intersection Observer for lazy loading
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const groupElement = entry.target as HTMLElement;
            const groupId = groupElement.dataset.groupId;
            if (groupId) {
              this.lazyLoadGroupContent(groupId);
            }
          }
        });
      },
      {
        root: this.scrollContainer,
        threshold: INTERSECTION_THRESHOLD,
        rootMargin: `${SCROLL_BUFFER_PIXELS}px`,
      }
    );

    // Setup ResizeObserver for measuring actual heights
    this.resizeObserver = new ResizeObserver((entries) => {
      let needsUpdate = false;

      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;
        const groupId = element.dataset.groupId;

        if (groupId) {
          const height = entry.contentRect.height;
          const cached = this.messageHeightCache.get(groupId);

          if (!cached || Math.abs(cached - height) > 5) {
            this.messageHeightCache.set(groupId, height);
            needsUpdate = true;

            // Limit cache size to prevent memory leaks
            if (this.messageHeightCache.size > MAX_HEIGHT_CACHE_SIZE) {
              const firstKey = this.messageHeightCache.keys().next().value;
              if (firstKey) {
                this.messageHeightCache.delete(firstKey);
              }
            }
          }
        }
      });

      if (needsUpdate) {
        this.scheduleVirtualScrollUpdate();
      }
    });
  }

  private getGroupHeight(group: MessageGroup): number {
    const cached = this.messageHeightCache.get(group.id);
    if (cached) return cached;

    // Use cached height calculation if available
    if (group.estimatedHeight && group.lineCount !== undefined) {
      return group.estimatedHeight;
    }

    // Calculate height based on content with caching
    let estimatedHeight = VIRTUAL_SCROLL_ITEM_HEIGHT;
    let totalLines = 0;

    // Add extra height for code blocks and thinking sections
    for (const message of group.messages) {
      for (const segment of message.content) {
        if (segment.type === 'code') {
          // Cache line count to avoid repeated string splitting
          const lineCount = segment.content.split('\n').length;
          totalLines += lineCount;
          estimatedHeight += Math.min(lineCount * 20, 200);
        } else if (segment.type === 'thinking') {
          estimatedHeight += 40; // Collapsed thinking block
        } else {
          // Estimate lines for text content
          const textLines = Math.ceil(segment.content.length / 80); // Rough estimate
          totalLines += textLines;
          estimatedHeight += textLines * 20;
        }
      }
    }

    // Cache the calculation in the group object
    group.estimatedHeight = estimatedHeight;
    group.lineCount = totalLines;

    return estimatedHeight;
  }

  private scheduleVirtualScrollUpdate() {
    if (this.renderRafId) return;

    const now = performance.now();
    if (now - this.lastRenderTime < RENDER_THROTTLE_MS) {
      // Too soon, use setTimeout for throttling instead of nested RAF
      const delay = Math.max(1, RENDER_THROTTLE_MS - (now - this.lastRenderTime));
      this.renderRafId = window.setTimeout(() => {
        this.renderRafId = undefined;
        this.updateVirtualScrollState();
        this.lastRenderTime = performance.now();
      }, delay);
    } else {
      // Use RAF for immediate updates
      this.renderRafId = requestAnimationFrame(() => {
        this.renderRafId = undefined;
        this.updateVirtualScrollState();
        this.lastRenderTime = performance.now();
      });
    }
  }

  private updateVisibleGroups() {
    const { startIndex, endIndex } = this.virtualScrollState;

    // Create render batch
    const newVisibleGroups = this.messageGroups.slice(startIndex, endIndex);

    // Batch update if groups have changed
    if (!this.arraysEqual(this.visibleGroups, newVisibleGroups)) {
      this.pendingRenderBatch = {
        groups: newVisibleGroups,
        startIndex,
        endIndex,
        timestamp: performance.now(),
      };

      this.processPendingRenderBatch();
    }
  }

  private processPendingRenderBatch() {
    if (!this.pendingRenderBatch) return;

    const batch = this.pendingRenderBatch;
    this.pendingRenderBatch = undefined;

    // Apply batch update
    this.visibleGroups = batch.groups;

    // Trigger re-render
    this.requestUpdate();
  }

  private arraysEqual(a: MessageGroup[], b: MessageGroup[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((item, index) => item.id === b[index]?.id);
  }

  private lazyLoadGroupContent(groupId: string) {
    // Find the group and trigger lazy loading for heavy content
    const group = this.messageGroups.find((g) => g.id === groupId);
    if (!group) return;

    // Process code segments for syntax highlighting
    for (const message of group.messages) {
      for (const segment of message.content) {
        if (segment.type === 'code' && segment.language) {
          // Trigger syntax highlighting if not already done
          this.lazyHighlightCode(segment);
        }
      }
    }
  }

  private async lazyHighlightCode(_segment: import('../../shared/types.js').ContentSegment) {
    // Placeholder for lazy syntax highlighting
    // This would integrate with a syntax highlighting library
    // when the code block becomes visible
    // Example: await import('highlight.js').then(hljs => {
    //   hljs.highlightElement(codeElement);
    // });
  }

  private renderMessageGroup(group: MessageGroup) {
    const useOptimized = this.messageGroups.length > 20; // Use optimized bubbles for large lists

    return html`
      <div class="message-group">
        ${repeat(
          group.messages,
          (msg) => msg.id,
          (message, index) => {
            const isFirstInGroup = index === 0;
            const isLastInGroup = index === group.messages.length - 1;

            return useOptimized
              ? html`
              <optimized-chat-bubble
                .message=${message}
                .isGrouped=${true}
                .isFirstInGroup=${isFirstInGroup}
                .isLastInGroup=${isLastInGroup}
                .lazy=${!this.isVisible}
                @copy-message=${(e: CustomEvent<string>) => {
                  logger.debug('Message copied:', `${e.detail.substring(0, 50)}...`);
                }}
              ></optimized-chat-bubble>
            `
              : html`
              <chat-bubble
                .message=${message}
                .isGrouped=${true}
                .isFirstInGroup=${isFirstInGroup}
                .isLastInGroup=${isLastInGroup}
                @copy-message=${(e: CustomEvent<string>) => {
                  logger.debug('Message copied:', `${e.detail.substring(0, 50)}...`);
                }}
              ></chat-bubble>
            `;
          }
        )}
      </div>
    `;
  }

  render() {
    return html`
      <div class="chat-view flex flex-col h-full bg-bg text-text">
        <!-- Header -->
        <div class="chat-header flex items-center justify-between px-4 py-3 border-b border-border bg-chat-header-bg" 
             style="z-index: ${Z_INDEX.MOBILE_OVERLAY}">
          <button
            @click=${() => this.dispatchEvent(new CustomEvent('navigate-back', { bubbles: true, composed: true }))}
            class="p-2 hover:bg-surface-hover rounded transition-colors"
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
              <div class="text-xs text-text-muted">Claude Assistant</div>
            `
                : ''
            }
          </div>

          <div class="flex items-center gap-1">
            <!-- Theme toggle -->
            <mobile-theme-toggle
              .theme=${this.currentTheme}
              @theme-changed=${(e: CustomEvent<'light' | 'dark'>) => {
                themeManager().setPreference(e.detail);
              }}
            ></mobile-theme-toggle>
            
            <!-- Scroll to bottom -->
            <button
              @click=${this.scrollToBottom}
              class="p-2 hover:bg-surface-hover rounded transition-colors ${this.isAutoScrollEnabled ? 'opacity-50' : ''}"
              aria-label="Scroll to bottom"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages container -->
        <div 
          class="flex-1 overflow-y-auto px-4 py-4 ${
            this.isMobile ? 'overscroll-behavior-contain' : ''
          } relative"
          @scroll=${this.handleScroll}
          id="scroll-container"
          style="${
            this.isMobile && this.isKeyboardVisible
              ? `padding-bottom: ${Math.max(100, this.keyboardHeight)}px;`
              : ''
          }"
        >
          <!-- Pull to refresh indicator -->
          ${
            this.isMobile
              ? html`
            <pull-to-refresh
              .state=${this.pullToRefreshState}
              .pullDistance=${this.pullDistance}
              .isRefreshing=${this.pullToRefreshState === 'refreshing'}
              @refresh-triggered=${this.loadMessageHistory}
              @refresh-complete=${this.cancelPullToRefresh}
              role="status"
              aria-live="polite"
              aria-label="Pull to refresh messages"
            ></pull-to-refresh>
          `
              : ''
          }

          <!-- Message groups with virtual scrolling -->
          <div 
            id="messages-container"
            class="relative"
            style="height: ${this.virtualScrollState.totalHeight}px;"
          >
            <!-- Virtual spacer for scrolled out content above -->
            ${
              this.virtualScrollState.offsetTop > 0
                ? html`
              <div style="height: ${this.virtualScrollState.offsetTop}px;"></div>
            `
                : ''
            }
            
            <!-- Visible message groups -->
            <div id="visible-groups">
              ${
                this.messageGroups.length === 0
                  ? html`
                    <div class="text-center text-text-muted py-8">
                      <p>No messages yet</p>
                      <p class="text-sm mt-2">Type in the terminal to start a conversation</p>
                    </div>
                  `
                  : repeat(
                      this.visibleGroups,
                      (group) => group.id,
                      (group) => html`
                        <div 
                          data-group-id="${group.id}"
                          class="message-group-container"
                        >
                          ${this.renderMessageGroup(group)}
                        </div>
                      `
                    )
              }
            </div>
            
            <!-- Virtual spacer for scrolled out content below -->
            ${
              this.virtualScrollState.offsetBottom > 0
                ? html`
              <div style="height: ${this.virtualScrollState.offsetBottom}px;"></div>
            `
                : ''
            }
          </div>

          <!-- Auto-scroll indicator -->
          ${
            !this.isAutoScrollEnabled
              ? html`
            <button
              @click=${this.scrollToBottom}
              class="fixed bottom-20 right-4 bg-primary text-white rounded-full p-3 shadow-lg hover:bg-primary-hover transition-colors"
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
    // this.virtualContainer = this.querySelector('#messages-container') as HTMLElement;

    // Setup virtual scrolling
    this.setupVirtualScrolling();

    // Initialize virtual scroll state
    if (this.scrollContainer) {
      this.virtualScrollState.viewportHeight = this.scrollContainer.clientHeight;
      this.updateVirtualScrollState();
    }

    // Set up touch handlers for pull to refresh
    if (this.isMobile) {
      this.setupTouchHandlers();
    }

    // Check if we have history available
    if (this.sessionId) {
      this.hasMoreHistory = chatSubscriptionService.hasMoreHistory(this.sessionId);
    }

    // Observe all rendered groups for height measurement
    if (this.resizeObserver) {
      const groupElements = this.querySelectorAll('[data-group-id]');
      groupElements.forEach((element) => {
        this.resizeObserver?.observe(element);
      });
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-view': ChatView;
  }
}
