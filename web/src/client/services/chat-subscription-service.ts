/**
 * Chat Subscription Service
 *
 * Dedicated service for subscribing to chat messages from Claude interactions
 * within terminal sessions. This service provides efficient message caching,
 * ordering, and real-time updates for the mobile chat view interface.
 *
 * ## Architecture
 * - Extends the existing WebSocket buffer infrastructure
 * - Uses enableChat flag to activate chat message parsing
 * - Maintains local message cache for fast view switching
 * - Handles message deduplication and ordering
 * - Automatic reconnection with exponential backoff
 *
 * ## Protocol Details
 *
 * ### Chat Message Subscription
 * - Client → Server: `{type: 'enableChat', sessionId: 'xxx'}`
 * - Client → Server: `{type: 'disableChat', sessionId: 'xxx'}`
 * - Server → Client: `{type: 'chatMessage', sessionId: 'xxx', message: ChatMessage}`
 * - Server → Client: `{type: 'chatEnabled', sessionId: 'xxx'}`
 * - Server → Client: `{type: 'chatDisabled', sessionId: 'xxx'}`
 *
 * ### Message Format
 * Chat messages follow the ChatMessage interface from shared types:
 * ```typescript
 * interface ChatMessage {
 *   id: string;
 *   type: ChatMessageType; // USER, ASSISTANT, SYSTEM, ERROR, THINKING
 *   content: ContentSegment[]; // Structured content segments
 *   timestamp: number;
 *   raw?: string; // Original raw content
 *   metadata?: { sessionId?, isComplete?, isStreaming?, etc. }
 * }
 * ```
 *
 * ## Usage Example
 * ```typescript
 * import { chatSubscriptionService } from './chat-subscription-service.js';
 *
 * // Initialize the service (connects automatically)
 * await chatSubscriptionService.initialize();
 *
 * // Subscribe to chat messages for a session
 * const unsubscribe = chatSubscriptionService.subscribe(
 *   'session-123',
 *   (messages) => {
 *     console.log(`Received ${messages.length} messages`);
 *     renderChatMessages(messages);
 *   }
 * );
 *
 * // Get cached messages (for quick display)
 * const cachedMessages = chatSubscriptionService.getCachedMessages('session-123');
 *
 * // Cleanup when done
 * unsubscribe();
 * ```
 *
 * @see web/src/server/services/buffer-aggregator.ts for server-side chat handling
 * @see web/src/client/components/chat-view.ts for UI integration
 * @see web/src/shared/types.ts for ChatMessage interface definition
 */

import type { ChatMessage } from '../../shared/types.js';
import { createLogger } from '../utils/logger.js';
import { authClient } from './auth-client.js';

const logger = createLogger('chat-subscription-service');

/**
 * Chat update handler function
 *
 * Called whenever new chat messages are received or when the message
 * list changes for a subscribed session.
 *
 * @param messages - Complete ordered list of messages for the session
 */
type ChatUpdateHandler = (messages: ChatMessage[]) => void;

/**
 * Chat message cache entry
 *
 * Stores messages for a session along with metadata for efficient
 * management and cache invalidation.
 */
interface ChatMessageCache {
  messages: ChatMessage[];
  lastUpdate: number;
  messageIds: Set<string>; // For fast deduplication
  hasMoreHistory?: boolean; // Whether more messages can be loaded
}

/**
 * Session subscription state
 *
 * Tracks the subscription status and handlers for each session.
 */
interface SessionSubscription {
  handlers: Set<ChatUpdateHandler>;
  isSubscribed: boolean; // Whether we've sent enableChat to server
  pendingSubscription: boolean; // Whether we're waiting for server confirmation
}

/**
 * ChatSubscriptionService manages WebSocket-based chat message subscriptions
 * for Claude interactions in terminal sessions.
 *
 * ## Features
 * - Singleton pattern for global access
 * - Efficient message caching with LRU eviction
 * - Message deduplication by ID
 * - Ordered message delivery (by timestamp)
 * - Automatic reconnection with state recovery
 * - Support for multiple handlers per session
 * - Graceful degradation when chat is not supported
 *
 * ## Cache Management
 * - Messages are cached per session for quick access
 * - Cache is limited to prevent memory leaks
 * - Automatic cleanup of unused sessions
 * - Message deduplication to prevent duplicates
 */
export class ChatSubscriptionService {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, SessionSubscription>();
  private messageCache = new Map<string, ChatMessageCache>();
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private isConnecting = false;
  private messageQueue: Array<{ type: string; sessionId?: string }> = [];

  private initialized = false;
  private noAuthMode: boolean | null = null;

  // Cache management configuration
  private static readonly MAX_CACHED_SESSIONS = 50;
  private static readonly MAX_MESSAGES_PER_SESSION = 1000;
  private static readonly CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  private cacheCleanupTimer: number | null = null;

  constructor() {
    // Do not connect automatically - wait for initialize() to be called
    // This is an intentional design decision to control connection timing
    this.startCacheCleanup();
  }

  /**
   * Initialize the chat subscription service and connect to WebSocket
   *
   * This method should be called after authentication is complete. It checks
   * the authentication configuration and establishes the WebSocket connection.
   *
   * The initialization is idempotent - calling it multiple times has no effect
   * after the first successful initialization.
   *
   * @example
   * ```typescript
   * // Initialize after auth is ready
   * await chatSubscriptionService.initialize();
   *
   * // Safe to call multiple times
   * await chatSubscriptionService.initialize(); // No-op
   * ```
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    // Check no-auth mode
    await this.checkNoAuthMode();

    // Add a small delay to ensure auth token is fully loaded and verified
    setTimeout(() => {
      this.connect();
    }, 100);
  }

  private async checkNoAuthMode(): Promise<void> {
    try {
      const response = await fetch('/api/auth/config');
      if (response.ok) {
        const config = await response.json();
        this.noAuthMode = config.noAuth === true;
      }
    } catch (error) {
      logger.warn('Failed to check auth config:', error);
      this.noAuthMode = false;
    }
  }

  private isNoAuthMode(): boolean {
    return this.noAuthMode === true;
  }

  /**
   * Establish WebSocket connection to the buffer streaming endpoint
   *
   * Reuses the same WebSocket endpoint as the buffer subscription service
   * but focuses on chat message handling rather than terminal buffer updates.
   */
  private connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    // Get auth token for WebSocket connection
    const currentUser = authClient.getCurrentUser();
    const token = currentUser?.token;

    // Don't connect if we don't have a valid token (unless in no-auth mode)
    if (!token && !this.isNoAuthMode()) {
      logger.warn('No auth token available, postponing WebSocket connection');
      // Retry connection after a delay
      setTimeout(() => {
        if (this.initialized && !this.ws) {
          this.connect();
        }
      }, 1000);
      return;
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // Build WebSocket URL with token as query parameter
    let wsUrl = `${protocol}//${window.location.host}/buffers`;
    if (token) {
      wsUrl += `?token=${encodeURIComponent(token)}`;
    }

    logger.log(`connecting to ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        logger.log('connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Start ping/pong
        this.startPingPong();

        // Send any queued messages
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          if (message) {
            this.sendMessage(message);
          }
        }

        // Re-enable chat for all active subscriptions
        this.subscriptions.forEach((subscription, sessionId) => {
          if (subscription.isSubscribed) {
            subscription.pendingSubscription = true;
            this.sendMessage({ type: 'enableChat', sessionId });
          }
        });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        logger.error('websocket error', error);
      };

      this.ws.onclose = () => {
        logger.log('disconnected');
        this.isConnecting = false;
        this.ws = null;
        this.stopPingPong();
        this.scheduleReconnect();
      };
    } catch (error) {
      logger.error('failed to create websocket', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;

    logger.log(`reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startPingPong() {
    this.stopPingPong();

    // Respond to pings with pongs
    this.pingInterval = window.setInterval(() => {
      // Ping handling is done in handleMessage
    }, 10000);
  }

  private stopPingPong() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private sendMessage(message: {
    type: string;
    sessionId?: string;
    beforeTimestamp?: number;
    limit?: number;
    input?: string;
    enableChat?: boolean;
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue message for when we reconnect
      if (message.type === 'enableChat' || message.type === 'disableChat') {
        this.messageQueue.push(message);
      }
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(data: ArrayBuffer | string) {
    // Only handle JSON messages (chat messages come as JSON)
    if (typeof data === 'string') {
      this.handleJsonMessage(data);
    }
    // Ignore binary messages (those are handled by buffer-subscription-service)
  }

  private handleJsonMessage(data: string) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'connected':
          logger.log(`connected to server, version: ${message.version}`);
          break;

        case 'chatEnabled':
          this.handleChatEnabled(message.sessionId);
          break;

        case 'chatDisabled':
          this.handleChatDisabled(message.sessionId);
          break;

        case 'chatMessage':
          this.handleChatMessage(message.sessionId, message.message);
          break;

        case 'chatHistory':
          this.handleChatHistory(message.sessionId, message.messages, message.hasMore);
          break;

        case 'ping':
          this.sendMessage({ type: 'pong' });
          break;

        case 'error':
          logger.error(`server error: ${message.message}`);
          if (message.sessionId) {
            this.handleChatError(message.sessionId, message.message);
          }
          break;

        default:
          // Ignore other message types (they're handled by buffer-subscription-service)
          break;
      }
    } catch (error) {
      logger.error('failed to parse JSON message', error);
    }
  }

  private handleChatEnabled(sessionId: string) {
    const subscription = this.subscriptions.get(sessionId);
    if (subscription) {
      subscription.pendingSubscription = false;
      subscription.isSubscribed = true;
      logger.debug(`Chat enabled for session: ${sessionId}`);
    }
  }

  private handleChatDisabled(sessionId: string) {
    const subscription = this.subscriptions.get(sessionId);
    if (subscription) {
      subscription.pendingSubscription = false;
      subscription.isSubscribed = false;
      logger.debug(`Chat disabled for session: ${sessionId}`);
    }
  }

  private handleChatMessage(sessionId: string, message: ChatMessage) {
    try {
      // Add message to cache
      this.addMessageToCache(sessionId, message);

      // Notify handlers
      const subscription = this.subscriptions.get(sessionId);
      if (subscription) {
        const cache = this.messageCache.get(sessionId);
        const messages = cache ? cache.messages : [];

        subscription.handlers.forEach((handler) => {
          try {
            handler(messages);
          } catch (error) {
            logger.error('error in chat update handler', error);
          }
        });
      }
    } catch (error) {
      logger.error('error handling chat message', error);
    }
  }

  private handleChatError(sessionId: string, errorMessage: string) {
    const subscription = this.subscriptions.get(sessionId);
    if (subscription) {
      subscription.pendingSubscription = false;
      subscription.isSubscribed = false;
      logger.warn(`Chat error for session ${sessionId}: ${errorMessage}`);
    }
  }

  private handleChatHistory(sessionId: string, messages: ChatMessage[], hasMore: boolean) {
    try {
      // Prepend messages to cache (they're older than existing messages)
      const cache = this.messageCache.get(sessionId);
      if (cache && messages.length > 0) {
        // Deduplicate and merge
        const newMessageIds = new Set<string>();
        const newMessages: ChatMessage[] = [];

        for (const msg of messages) {
          if (!cache.messageIds.has(msg.id)) {
            newMessages.push(msg);
            newMessageIds.add(msg.id);
          }
        }

        if (newMessages.length > 0) {
          // Prepend new messages
          cache.messages = [...newMessages, ...cache.messages];
          newMessages.forEach((msg) => cache.messageIds.add(msg.id));
          cache.lastUpdate = Date.now();

          // Sort by timestamp
          cache.messages.sort((a, b) => a.timestamp - b.timestamp);

          // Trim if needed
          if (cache.messages.length > ChatSubscriptionService.MAX_MESSAGES_PER_SESSION) {
            const removed = cache.messages.splice(
              0,
              cache.messages.length - ChatSubscriptionService.MAX_MESSAGES_PER_SESSION
            );
            removed.forEach((msg) => cache.messageIds.delete(msg.id));
          }

          logger.debug(`Added ${newMessages.length} history messages for session ${sessionId}`);

          // Notify handlers
          const subscription = this.subscriptions.get(sessionId);
          if (subscription) {
            subscription.handlers.forEach((handler) => {
              try {
                handler(cache.messages);
              } catch (error) {
                logger.error('error in chat update handler', error);
              }
            });
          }
        }
      }

      // Store hasMore flag for UI
      if (cache) {
        cache.hasMoreHistory = hasMore;
      }
    } catch (error) {
      logger.error('error handling chat history', error);
    }
  }

  private addMessageToCache(sessionId: string, message: ChatMessage) {
    let cache = this.messageCache.get(sessionId);
    if (!cache) {
      cache = {
        messages: [],
        lastUpdate: Date.now(),
        messageIds: new Set(),
      };
      this.messageCache.set(sessionId, cache);
    }

    // Check for existing message - handle updates if timestamp is newer
    const existingIndex = cache.messages.findIndex((m) => m.id === message.id);
    if (existingIndex !== -1) {
      const existingMessage = cache.messages[existingIndex];
      if (message.timestamp > existingMessage.timestamp) {
        // Update existing message with newer content
        cache.messages[existingIndex] = message;
        cache.lastUpdate = Date.now();
        logger.debug(`Updated message ${message.id} for session ${sessionId}`);
      } else {
        logger.debug(`Duplicate message ${message.id} for session ${sessionId}, skipping`);
      }
      return;
    }

    // Add new message
    cache.messages.push(message);
    cache.messageIds.add(message.id);
    cache.lastUpdate = Date.now();

    // Sort messages by timestamp to ensure proper ordering
    cache.messages.sort((a, b) => a.timestamp - b.timestamp);

    // Limit cache size
    if (cache.messages.length > ChatSubscriptionService.MAX_MESSAGES_PER_SESSION) {
      const removed = cache.messages.splice(
        0,
        cache.messages.length - ChatSubscriptionService.MAX_MESSAGES_PER_SESSION
      );
      removed.forEach((msg) => cache?.messageIds.delete(msg.id));
    }

    logger.debug(
      `Added message ${message.id} to cache for session ${sessionId} (${cache.messages.length} total)`
    );
  }

  private startCacheCleanup() {
    this.cacheCleanupTimer = window.setInterval(() => {
      this.cleanupCache();
    }, ChatSubscriptionService.CACHE_CLEANUP_INTERVAL);
  }

  private cleanupCache() {
    const now = Date.now();
    const sessionsToRemove: string[] = [];

    // Find sessions to clean up
    for (const [sessionId, cache] of this.messageCache) {
      const isActive = this.subscriptions.has(sessionId);
      const isStale = now - cache.lastUpdate > ChatSubscriptionService.SESSION_TIMEOUT;

      if (!isActive && isStale) {
        sessionsToRemove.push(sessionId);
      }
    }

    // Remove stale sessions
    sessionsToRemove.forEach((sessionId) => {
      this.messageCache.delete(sessionId);
      logger.debug(`Cleaned up stale cache for session ${sessionId}`);
    });

    // If we still have too many cached sessions, remove the oldest ones
    if (this.messageCache.size > ChatSubscriptionService.MAX_CACHED_SESSIONS) {
      const sessions = Array.from(this.messageCache.entries()).sort(
        ([, a], [, b]) => a.lastUpdate - b.lastUpdate
      );

      const toRemove = sessions.slice(
        0,
        this.messageCache.size - ChatSubscriptionService.MAX_CACHED_SESSIONS
      );
      toRemove.forEach(([sessionId]) => {
        this.messageCache.delete(sessionId);
        logger.debug(`Removed old cache for session ${sessionId} (cache size limit)`);
      });
    }

    if (sessionsToRemove.length > 0) {
      logger.log(`Cache cleanup: removed ${sessionsToRemove.length} stale sessions`);
    }
  }

  /**
   * Subscribe to chat messages for a session
   *
   * Creates a subscription to receive real-time chat message updates for
   * the specified session. The handler will be called whenever new messages
   * are received or when the message list changes.
   *
   * **Important behaviors:**
   * - Automatically initializes the service if not already initialized
   * - Multiple handlers can be registered for the same session
   * - Returns cached messages immediately if available
   * - Subscriptions persist across reconnections
   * - The returned unsubscribe function removes only the specific handler
   *
   * @param sessionId - Unique identifier of the terminal session
   * @param handler - Callback function to receive chat message updates
   * @returns Unsubscribe function to stop receiving updates
   *
   * @example
   * ```typescript
   * // Subscribe to chat messages
   * const unsubscribe = chatSubscriptionService.subscribe(
   *   'session-abc123',
   *   (messages) => {
   *     // Update chat UI
   *     chatView.renderMessages(messages);
   *   }
   * );
   *
   * // Multiple subscriptions to same session
   * const unsubscribe2 = chatSubscriptionService.subscribe(
   *   'session-abc123',
   *   (messages) => {
   *     // Update message count badge
   *     updateMessageCount(messages.length);
   *   }
   * );
   *
   * // Cleanup when done
   * unsubscribe();  // First handler removed
   * unsubscribe2(); // Second handler removed, session unsubscribed
   * ```
   */
  subscribe(sessionId: string, handler: ChatUpdateHandler): () => void {
    // Ensure service is initialized when first subscription happens
    if (!this.initialized) {
      this.initialize();
    }

    // Get or create subscription
    let subscription = this.subscriptions.get(sessionId);
    if (!subscription) {
      subscription = {
        handlers: new Set(),
        isSubscribed: false,
        pendingSubscription: false,
      };
      this.subscriptions.set(sessionId, subscription);
    }

    // Add handler
    subscription.handlers.add(handler);

    // Enable chat if not already subscribed
    if (!subscription.isSubscribed && !subscription.pendingSubscription) {
      subscription.pendingSubscription = true;
      this.sendMessage({ type: 'enableChat', sessionId });
    }

    // Send cached messages immediately if available
    const cachedMessages = this.getCachedMessages(sessionId);
    if (cachedMessages.length > 0) {
      try {
        handler(cachedMessages);
      } catch (error) {
        logger.error('error in initial chat update handler', error);
      }
    }

    logger.debug(
      `Subscribed to chat messages for session ${sessionId} (${subscription.handlers.size} handlers)`
    );

    // Return unsubscribe function
    return () => {
      const subscription = this.subscriptions.get(sessionId);
      if (subscription) {
        subscription.handlers.delete(handler);

        // If no more handlers, disable chat
        if (subscription.handlers.size === 0) {
          this.subscriptions.delete(sessionId);
          this.sendMessage({ type: 'disableChat', sessionId });
          logger.debug(`Unsubscribed from chat messages for session ${sessionId}`);
        }
      }
    };
  }

  /**
   * Get cached messages for a session
   *
   * Returns the currently cached chat messages for a session. This is useful
   * for quickly displaying messages without waiting for server updates.
   *
   * @param sessionId - Session to get messages for
   * @returns Array of cached chat messages, empty if none cached
   */
  getCachedMessages(sessionId: string): ChatMessage[] {
    const cache = this.messageCache.get(sessionId);
    return cache ? [...cache.messages] : [];
  }

  /**
   * Clear cached messages for a session
   *
   * Removes all cached messages for the specified session. This is useful
   * when switching to a different session or when you want to force a fresh
   * message load.
   *
   * @param sessionId - Session to clear cache for
   */
  clearCache(sessionId: string): void {
    this.messageCache.delete(sessionId);
    logger.debug(`Cleared message cache for session ${sessionId}`);
  }

  /**
   * Get subscription status for a session
   *
   * Returns information about the current subscription state for a session.
   *
   * @param sessionId - Session to check
   * @returns Subscription status information
   */
  getSubscriptionStatus(sessionId: string): {
    isSubscribed: boolean;
    pendingSubscription: boolean;
    handlerCount: number;
    messageCount: number;
  } {
    const subscription = this.subscriptions.get(sessionId);
    const cache = this.messageCache.get(sessionId);

    return {
      isSubscribed: subscription?.isSubscribed ?? false,
      pendingSubscription: subscription?.pendingSubscription ?? false,
      handlerCount: subscription?.handlers.size ?? 0,
      messageCount: cache?.messages.length ?? 0,
    };
  }

  /**
   * Load message history for a session
   *
   * Requests older messages from the server for pull-to-refresh functionality.
   * Messages are prepended to the existing cache and handlers are notified.
   *
   * @param sessionId - Session to load history for
   * @param beforeTimestamp - Load messages before this timestamp (optional)
   * @param limit - Maximum number of messages to load (default: 50)
   * @returns Promise that resolves with success status and hasMore flag
   */
  async loadMessageHistory(
    sessionId: string,
    beforeTimestamp?: number,
    limit: number = 50
  ): Promise<{ success: boolean; hasMore: boolean; error?: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { success: false, hasMore: false, error: 'Not connected' };
    }

    const cache = this.messageCache.get(sessionId);
    if (!cache || cache.messages.length === 0) {
      // No existing messages, can't load history
      return { success: false, hasMore: false, error: 'No messages to load before' };
    }

    // Use the timestamp of the oldest message if not provided
    const timestamp =
      beforeTimestamp || (cache.messages.length > 0 ? cache.messages[0].timestamp : Date.now());

    return new Promise((resolve) => {
      // Set up one-time handler for the response
      const handleResponse = (data: string) => {
        try {
          const message = JSON.parse(data);
          if (message.type === 'chatHistory' && message.sessionId === sessionId) {
            // Response is handled by handleChatHistory
            resolve({
              success: true,
              hasMore: message.hasMore || false,
            });
            return true; // Remove this handler
          } else if (message.type === 'error' && message.sessionId === sessionId) {
            resolve({
              success: false,
              hasMore: false,
              error: message.message,
            });
            return true; // Remove this handler
          }
        } catch {
          // Not our message, ignore
        }
        return false; // Keep this handler
      };

      // Temporary message handler
      if (!this.ws) return;
      const originalOnMessage = this.ws.onmessage;
      const handlers: ((data: string) => boolean)[] = [handleResponse];

      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          // Check temporary handlers first
          handlers.filter((handler) => !handler(event.data));
        }
        // Call original handler
        if (originalOnMessage && this.ws) {
          originalOnMessage.call(this.ws, event);
        }
      };

      // Send request
      this.sendMessage({
        type: 'loadChatHistory',
        sessionId,
        beforeTimestamp: timestamp,
        limit,
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        resolve({
          success: false,
          hasMore: false,
          error: 'Request timed out',
        });
      }, 5000);
    });
  }

  /**
   * Check if more history is available for a session
   *
   * @param sessionId - Session to check
   * @returns Whether more history can be loaded
   */
  hasMoreHistory(sessionId: string): boolean {
    const cache = this.messageCache.get(sessionId);
    return cache ? cache.hasMoreHistory !== false : true;
  }

  /**
   * Clean up and close connection
   *
   * Gracefully shuts down the WebSocket connection and cleans up all resources.
   * This method should be called when the service is no longer needed, such as
   * during application shutdown or logout.
   *
   * **Cleanup actions:**
   * - Cancels any pending reconnection attempts
   * - Stops ping/pong heartbeat
   * - Closes the WebSocket connection
   * - Clears all subscriptions and message cache
   * - Stops cache cleanup timer
   * - Empties the message queue
   *
   * @example
   * ```typescript
   * // During logout or cleanup
   * chatSubscriptionService.dispose();
   *
   * // Service can be re-initialized later if needed
   * await chatSubscriptionService.initialize();
   * ```
   */
  dispose() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = null;
    }

    this.stopPingPong();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
    this.messageCache.clear();
    this.messageQueue = [];
    this.initialized = false;

    logger.log('Chat subscription service disposed');
  }
}

// Create singleton instance
export const chatSubscriptionService = new ChatSubscriptionService();
