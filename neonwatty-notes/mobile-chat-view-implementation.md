# Mobile Chat View Implementation Plan

## Overview
Add a mobile-friendly chat view as an alternative presentation layer for terminal sessions, particularly optimized for Claude Code interactions.

## Design Principles
- **Minimal Changes**: Reuse existing infrastructure wherever possible
- **Progressive Enhancement**: Start simple, add features incrementally
- **Non-Breaking**: Chat view is optional, terminal view remains default
- **Mobile-First**: Optimize for touch interactions and small screens

## Key Technical Considerations

### Performance
- Only enable message parsing when chat view is active
- Lazy loading for historical messages
- Efficient handling of streaming output

### State Management
- Start with fresh chat when switching views (simpler approach)
- Future: Parse recent buffer for context (if needed)
- Maintain single source of truth (terminal buffer)

### Error Handling
- Graceful degradation when parsing fails
- Show unparseable content as system messages
- Never compromise terminal functionality

### Compatibility
- Read-only parsing (don't interfere with asciinema recording)
- Detect Claude sessions automatically
- Support standard terminal features in parallel

## Implementation Phases

### Phase 1: Backend Message Parsing Infrastructure

#### 1.1 Message Parser Service
- [ ] Create `web/src/server/services/chat-message-parser.ts`
  - [ ] Define ChatMessage interface (id, type, content, timestamp, metadata)
  - [ ] Parse terminal output into structured messages
  - [ ] Detect message boundaries (user input vs Claude output)
  - [ ] Handle ANSI escape code removal for chat display
  - [ ] Identify Claude thinking blocks for collapsing
  - [ ] Implement streaming message parsing (handle partial data)
  - [ ] Add error boundaries for parsing failures

#### 1.2 Extend Activity Detector
- [ ] Update `web/src/server/utils/activity-detector.ts`
  - [ ] Add method to extract full Claude responses (not just status)
  - [ ] Detect conversation turns (user → Claude → user)
  - [ ] Export parsed message events for chat view
  - [ ] Use existing prompt detection for message boundaries
  - [ ] Leverage `isClaudeInProcessTree` for session type detection

#### 1.3 WebSocket Protocol Extension
- [ ] Update `web/src/server/services/buffer-aggregator.ts`
  - [ ] Add new message type for structured chat data
  - [ ] Send chat messages alongside terminal buffer updates
  - [ ] Only parse and send when client requests chat mode
  - [ ] Maintain backwards compatibility
  - [ ] Track `hasChatClients` per session for performance

#### 1.4 Session Metadata
- [ ] Update session model to track view preference
  - [ ] Add `preferredView: 'terminal' | 'chat'` to session
  - [ ] Add `sessionType: 'claude' | 'generic'` detection
  - [ ] Add `hasChatClients: boolean` for performance optimization
  - [ ] Store in session manager
  - [ ] Default to 'terminal' for desktop, consider 'chat' for mobile Claude sessions

### Phase 2: Basic Chat UI Components

#### 2.1 Core Chat Components
- [ ] Create `web/src/client/components/chat-view.ts`
  - [ ] Main chat container with message list
  - [ ] Virtual scrolling for performance
  - [ ] Auto-scroll to bottom on new messages
  - [ ] Pull-to-refresh for history

- [ ] Create `web/src/client/components/chat-bubble.ts`
  - [ ] Differentiate user vs Claude messages
  - [ ] Timestamp display
  - [ ] Copy message functionality
  - [ ] Collapse/expand for thinking blocks

- [ ] Create `web/src/client/components/chat-input.ts`
  - [ ] Text input with send button
  - [ ] Handle virtual keyboard properly
  - [ ] Auto-resize textarea
  - [ ] Send on Enter (with Shift+Enter for newline)

#### 2.2 View Toggle
- [ ] Update `web/src/client/components/session-view.ts`
  - [ ] Add view toggle button (terminal ↔ chat)
  - [ ] Store preference in localStorage
  - [ ] Smooth transition between views
  - [ ] Only show toggle on mobile or when opted in

#### 2.3 Message Subscription
- [ ] Create `web/src/client/services/chat-subscription-service.ts`
  - [ ] Subscribe to chat messages via WebSocket
  - [ ] Handle message ordering and deduplication
  - [ ] Manage local message cache
  - [ ] Sync with terminal buffer state

### Phase 3: Quick Actions and Mobile Optimizations

#### 3.1 Quick Actions Component
- [ ] Create `web/src/client/components/quick-actions.ts`
  - [ ] Predefined buttons for common commands
  - [ ] Default set: /compact, /clear, "what's next?", "continue"
  - [ ] Horizontal scrolling action bar
  - [ ] Customizable through settings

#### 3.2 Mobile Optimizations
- [ ] Update mobile detection to auto-select chat view
  - [ ] Use existing `detectMobile()` from mobile-utils.ts
  - [ ] Allow user override in settings
  - [ ] Remember user preference

- [ ] Optimize touch interactions
  - [ ] Larger tap targets for buttons
  - [ ] Swipe gestures for actions
  - [ ] Long-press for message options
  - [ ] Haptic feedback where supported

#### 3.3 Keyboard Handling
- [ ] Improve virtual keyboard behavior
  - [ ] Input stays visible when keyboard opens
  - [ ] Scroll to latest message on send
  - [ ] Dismiss keyboard on scroll
  - [ ] Handle orientation changes

### Phase 4: Polish and Advanced Features

#### 4.1 Message Enhancements
- [ ] Rich message rendering
  - [ ] Code block syntax highlighting
  - [ ] Markdown formatting
  - [ ] File path detection and linking
  - [ ] Inline command previews

#### 4.2 Thinking Block Handling
- [ ] Smart collapsing of Claude thinking
  - [ ] Show indicator when thinking
  - [ ] Collapse by default on mobile
  - [ ] Expand on tap
  - [ ] Show thinking duration

#### 4.3 Performance Optimizations
- [ ] Implement message virtualization
  - [ ] Only render visible messages
  - [ ] Lazy load history
  - [ ] Efficient scroll handling
  - [ ] Memory management for long sessions

#### 4.4 Accessibility
- [ ] Screen reader support
  - [ ] Proper ARIA labels
  - [ ] Announce new messages
  - [ ] Keyboard navigation
  - [ ] High contrast mode support

## Testing Strategy

### Unit Tests
- [ ] Message parser test suite
- [ ] Chat component tests
- [ ] Quick action tests

### Integration Tests
- [ ] WebSocket message flow
- [ ] View switching
- [ ] Message synchronization

### E2E Tests
- [ ] Mobile viewport tests
- [ ] Touch interaction tests
- [ ] Keyboard handling tests

### Manual Testing
- [ ] Real device testing (iOS Safari, Android Chrome)
- [ ] Various screen sizes
- [ ] Network conditions
- [ ] Long conversation performance

## File Changes Summary

### New Files
- `web/src/server/services/chat-message-parser.ts`
- `web/src/client/components/chat-view.ts`
- `web/src/client/components/chat-bubble.ts`
- `web/src/client/components/chat-input.ts`
- `web/src/client/components/quick-actions.ts`
- `web/src/client/services/chat-subscription-service.ts`

### Modified Files
- `web/src/server/utils/activity-detector.ts` - Extended parsing
- `web/src/server/services/buffer-aggregator.ts` - Chat messages
- `web/src/client/components/session-view.ts` - View toggle
- `web/src/shared/types.ts` - New interfaces

### Test Files
- `web/src/test/unit/chat-message-parser.test.ts`
- `web/src/test/playwright/specs/mobile-chat-view.spec.ts`

## Implementation Notes

1. **Start with Phase 1** - Get message parsing working first
2. **Test with real Claude sessions** - Ensure parsing accuracy
3. **Mobile-first development** - Test on actual devices early
4. **Feature flag initially** - Allow gradual rollout
5. **Maintain terminal view** - Chat is additive, not replacement

## Success Criteria

- [ ] Mobile users can switch to chat view
- [ ] Claude thinking blocks are collapsed by default
- [ ] Quick actions reduce repetitive typing
- [ ] Performance remains smooth with long conversations
- [ ] No impact on existing terminal functionality
- [ ] Positive user feedback from mobile users

## Future Enhancements (Post-MVP)

- Voice input support
- Message search
- Export conversation
- Custom quick action sets
- Theme customization
- Persistent conversation history
- Multi-session chat view