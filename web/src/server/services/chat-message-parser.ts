/**
 * Chat message parser for Claude terminal output
 *
 * Parses terminal output into structured chat messages, handling streaming
 * responses, code blocks, thinking tags, and error boundaries.
 */

import { type ChatMessage, ChatMessageType, ContentSegmentType } from '../../shared/types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('chat-message-parser');

// ANSI escape code removal regex
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes need control characters
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Parser state for streaming messages
 */
interface ParserState {
  currentMessage: ChatMessage | null;
  buffer: string;
  inCodeBlock: boolean;
  codeBlockLanguage: string;
  inThinkingBlock: boolean;
  lastMessageType: ChatMessageType | null;
  messageIdCounter: number;
}

/**
 * Claude output patterns
 */
const CLAUDE_PATTERNS = {
  // User input pattern - lines that start with a prompt character
  userPrompt: /^[$>#%❯➜]\s*/,

  // Claude response indicators
  assistantStart: /^(Human:|Assistant:|Claude:)/i,

  // Code block markers
  codeBlockStart: /^```(\w+)?/,
  codeBlockEnd: /^```$/,

  // Thinking block markers
  thinkingStart: /<thinking>/i,
  thinkingEnd: /<\/thinking>/i,

  // Status indicators (from activity detector)
  statusLine: /(\S)\s+([\w\s]+?)…\s*\((\d+)s(?:\s*·\s*(\S?)\s*([\d.]+)\s*k?\s*tokens)?.*?\)/,

  // Error patterns
  errorPattern: /^(Error:|ERROR:|Failed:|FAILED:)/i,
};

/**
 * Chat message parser for terminal output
 */
export class ChatMessageParser {
  private state: ParserState;
  private messageHandlers: Set<(message: ChatMessage) => void> = new Set();

  constructor() {
    this.state = {
      currentMessage: null,
      buffer: '',
      inCodeBlock: false,
      codeBlockLanguage: '',
      inThinkingBlock: false,
      lastMessageType: null,
      messageIdCounter: 0,
    };
  }

  /**
   * Subscribe to parsed messages
   */
  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Parse a chunk of terminal output
   */
  parseChunk(data: string): void {
    try {
      // Remove ANSI escape codes for parsing
      const cleanData = data.replace(ANSI_REGEX, '');

      // Add to buffer for multi-line processing
      this.state.buffer += cleanData;

      // Process complete lines
      const lines = this.state.buffer.split('\n');
      this.state.buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        this.processLine(line, data);
      }
    } catch (error) {
      logger.error('Error parsing chunk:', error);
      this.emitErrorMessage('Failed to parse terminal output');
    }
  }

  /**
   * Flush any buffered content
   */
  flush(): void {
    if (this.state.buffer) {
      this.processLine(this.state.buffer, this.state.buffer);
      this.state.buffer = '';
    }

    if (this.state.currentMessage) {
      this.finalizeMessage();
    }
  }

  /**
   * Process a single line of output
   */
  private processLine(line: string, _rawLine: string): void {
    // Skip empty lines unless in a code block
    if (!line.trim() && !this.state.inCodeBlock) {
      return;
    }

    // Check for user input
    if (this.detectUserInput(line)) {
      this.startUserMessage(line);
      return;
    }

    // Check for Claude response start
    if (this.detectAssistantStart(line)) {
      this.startAssistantMessage();
      return;
    }

    // Check for error
    if (this.detectError(line)) {
      this.startErrorMessage(line);
      return;
    }

    // Handle code blocks
    if (this.handleCodeBlock(line)) {
      return;
    }

    // Handle thinking blocks
    if (this.handleThinkingBlock(line)) {
      return;
    }

    // Add content to current message or start a new assistant message
    if (this.state.currentMessage) {
      this.addContentToMessage(line);
    } else if (this.shouldStartAssistantMessage(line)) {
      this.startAssistantMessage();
      this.addContentToMessage(line);
    }
  }

  /**
   * Detect user input from prompt patterns
   */
  private detectUserInput(line: string): boolean {
    return CLAUDE_PATTERNS.userPrompt.test(line);
  }

  /**
   * Detect Claude response start
   */
  private detectAssistantStart(line: string): boolean {
    return CLAUDE_PATTERNS.assistantStart.test(line);
  }

  /**
   * Detect error messages
   */
  private detectError(line: string): boolean {
    return CLAUDE_PATTERNS.errorPattern.test(line);
  }

  /**
   * Determine if we should start a new assistant message
   */
  private shouldStartAssistantMessage(line: string): boolean {
    // Don't start for status lines
    if (CLAUDE_PATTERNS.statusLine.test(line)) {
      return false;
    }

    // Start if we have meaningful content and last message was user
    return line.trim().length > 0 && this.state.lastMessageType === ChatMessageType.USER;
  }

  /**
   * Handle code block detection and content
   */
  private handleCodeBlock(line: string): boolean {
    if (!this.state.inCodeBlock && CLAUDE_PATTERNS.codeBlockStart.test(line)) {
      // Start code block
      const match = line.match(CLAUDE_PATTERNS.codeBlockStart);
      this.state.inCodeBlock = true;
      this.state.codeBlockLanguage = match?.[1] || '';

      // Ensure we have a message to add to
      if (!this.state.currentMessage) {
        this.startAssistantMessage();
      }

      return true;
    }

    if (this.state.inCodeBlock && CLAUDE_PATTERNS.codeBlockEnd.test(line)) {
      // End code block
      this.state.inCodeBlock = false;
      this.finalizeCodeBlock();
      return true;
    }

    if (this.state.inCodeBlock) {
      this.addCodeContent(line);
      return true;
    }

    return false;
  }

  /**
   * Handle thinking block detection and content
   */
  private handleThinkingBlock(line: string): boolean {
    if (!this.state.inThinkingBlock && CLAUDE_PATTERNS.thinkingStart.test(line)) {
      this.state.inThinkingBlock = true;

      // Ensure we have a message to add to
      if (!this.state.currentMessage) {
        this.startAssistantMessage();
      }

      return true;
    }

    if (this.state.inThinkingBlock && CLAUDE_PATTERNS.thinkingEnd.test(line)) {
      this.state.inThinkingBlock = false;
      this.finalizeThinkingBlock();
      return true;
    }

    if (this.state.inThinkingBlock) {
      this.addThinkingContent(line);
      return true;
    }

    return false;
  }

  /**
   * Start a new user message
   */
  private startUserMessage(line: string): void {
    this.finalizeMessage();

    // Extract the actual user input (remove prompt characters)
    const userInput = line.replace(CLAUDE_PATTERNS.userPrompt, '');

    this.state.currentMessage = {
      id: this.generateMessageId(),
      type: ChatMessageType.USER,
      content: [
        {
          type: ContentSegmentType.TEXT,
          content: userInput,
        },
      ],
      timestamp: Date.now(),
      raw: line,
    };

    this.state.lastMessageType = ChatMessageType.USER;
  }

  /**
   * Start a new assistant message
   */
  private startAssistantMessage(): void {
    this.finalizeMessage();

    this.state.currentMessage = {
      id: this.generateMessageId(),
      type: ChatMessageType.ASSISTANT,
      content: [],
      timestamp: Date.now(),
      metadata: {
        isStreaming: true,
      },
    };

    this.state.lastMessageType = ChatMessageType.ASSISTANT;
  }

  /**
   * Start a new error message
   */
  private startErrorMessage(line: string): void {
    this.finalizeMessage();

    this.state.currentMessage = {
      id: this.generateMessageId(),
      type: ChatMessageType.ERROR,
      content: [
        {
          type: ContentSegmentType.TEXT,
          content: line,
        },
      ],
      timestamp: Date.now(),
    };

    this.state.lastMessageType = ChatMessageType.ERROR;
  }

  /**
   * Add content to the current message
   */
  private addContentToMessage(line: string): void {
    if (!this.state.currentMessage) return;

    const lastSegment =
      this.state.currentMessage.content[this.state.currentMessage.content.length - 1];

    if (lastSegment && lastSegment.type === ContentSegmentType.TEXT) {
      // Append to existing text segment
      lastSegment.content += `\n${line}`;
    } else {
      // Create new text segment
      this.state.currentMessage.content.push({
        type: ContentSegmentType.TEXT,
        content: line,
      });
    }
  }

  /**
   * Add code content to current code block
   */
  private addCodeContent(line: string): void {
    if (!this.state.currentMessage) return;

    const lastSegment =
      this.state.currentMessage.content[this.state.currentMessage.content.length - 1];

    if (lastSegment && lastSegment.type === ContentSegmentType.CODE) {
      lastSegment.content += `\n${line}`;
    } else {
      this.state.currentMessage.content.push({
        type: ContentSegmentType.CODE,
        content: line,
        language: this.state.codeBlockLanguage,
      });
    }
  }

  /**
   * Add thinking content
   */
  private addThinkingContent(line: string): void {
    if (!this.state.currentMessage) return;

    const lastSegment =
      this.state.currentMessage.content[this.state.currentMessage.content.length - 1];

    if (lastSegment && lastSegment.type === ContentSegmentType.THINKING) {
      lastSegment.content += `\n${line}`;
    } else {
      this.state.currentMessage.content.push({
        type: ContentSegmentType.THINKING,
        content: line,
        collapsed: true, // Default to collapsed on mobile
      });
    }
  }

  /**
   * Finalize current code block
   */
  private finalizeCodeBlock(): void {
    // Reset code block state
    this.state.codeBlockLanguage = '';
  }

  /**
   * Finalize current thinking block
   */
  private finalizeThinkingBlock(): void {
    // Mark thinking segment as complete
    if (this.state.currentMessage) {
      const thinkingSegments = this.state.currentMessage.content.filter(
        (s) => s.type === ContentSegmentType.THINKING
      );
      thinkingSegments.forEach((s) => {
        s.collapsed = true; // Ensure collapsed by default
      });
    }
  }

  /**
   * Finalize and emit current message
   */
  private finalizeMessage(): void {
    if (!this.state.currentMessage) return;

    // Mark as complete
    if (this.state.currentMessage.metadata) {
      this.state.currentMessage.metadata.isComplete = true;
      this.state.currentMessage.metadata.isStreaming = false;
    }

    // Clean up empty segments
    this.state.currentMessage.content = this.state.currentMessage.content.filter(
      (segment) => segment.content.trim().length > 0
    );

    // Only emit if we have content
    if (this.state.currentMessage.content.length > 0) {
      this.emitMessage(this.state.currentMessage);
    }

    this.state.currentMessage = null;
  }

  /**
   * Emit a parsed message
   */
  private emitMessage(message: ChatMessage): void {
    logger.debug(`Emitting ${message.type} message with ${message.content.length} segments`);
    this.messageHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        logger.error('Error in message handler:', error);
      }
    });
  }

  /**
   * Emit an error message
   */
  private emitErrorMessage(errorText: string): void {
    const errorMessage: ChatMessage = {
      id: this.generateMessageId(),
      type: ChatMessageType.ERROR,
      content: [
        {
          type: ContentSegmentType.TEXT,
          content: errorText,
        },
      ],
      timestamp: Date.now(),
    };

    this.emitMessage(errorMessage);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${++this.state.messageIdCounter}`;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.flush();
    this.state = {
      currentMessage: null,
      buffer: '',
      inCodeBlock: false,
      codeBlockLanguage: '',
      inThinkingBlock: false,
      lastMessageType: null,
      messageIdCounter: 0,
    };
  }
}

/**
 * Extract status information from Claude output
 */
export function extractClaudeStatus(data: string): {
  action?: string;
  duration?: number;
  tokens?: number;
  direction?: string;
} | null {
  const cleanData = data.replace(ANSI_REGEX, '');
  const match = CLAUDE_PATTERNS.statusLine.exec(cleanData);

  if (!match) return null;

  const [, , action, duration, direction, tokens] = match;

  return {
    action,
    duration: duration ? Number.parseInt(duration) : undefined,
    tokens: tokens ? Number.parseFloat(tokens) : undefined,
    direction,
  };
}
