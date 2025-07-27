# VibeTunnel Agents Usage Guide

## Overview
VibeTunnel uses specialized AI agents to help with different aspects of development. Each agent has deep knowledge of specific areas and can significantly speed up implementation.

## Available Agents

### 1. VibeTunnel Orchestrator (`/vt-orchestrator`)
**Purpose**: Coordinates cross-platform development and manages the overall implementation strategy.

**When to use**:
- Starting a new feature that spans Swift and TypeScript
- Planning integration between components
- Breaking down complex tasks
- Reviewing progress on multi-part features

**Example**:
```
/vt-orchestrator How should we implement session type detection for the chat view?
```

### 2. TypeScript Specialist (`/ts-specialist`)
**Purpose**: Expert in all TypeScript/Node.js/Web aspects of VibeTunnel.

**When to use**:
- Implementing Lit components
- Working with WebSocket protocols
- Parsing terminal output
- Mobile web optimizations
- Writing Vitest or Playwright tests

**Example**:
```
/ts-specialist Implement the chat-message-parser.ts with streaming support
```

### 3. Swift Specialist (`/swift-specialist`)
**Purpose**: Expert in macOS/iOS native development for VibeTunnel.

**When to use**:
- Modifying ServerManager or BunServer
- Working with macOS permissions
- Implementing native features
- Debugging Swift concurrency issues

**Example**:
```
/swift-specialist Add sessionType detection to TunnelSession model
```

### 4. Code Review Specialist (`/code-review-specialist`)
**Purpose**: Provides thorough code reviews with VibeTunnel standards in mind.

**When to use**:
- After implementing any new feature
- Before committing significant changes
- When refactoring existing code
- To catch security or performance issues

**Example**:
```
/code-review-specialist Review the new chat-view.ts component for mobile best practices
```

### 5. Debug Specialist (`/debug-specialist`)
**Purpose**: Systematically diagnoses and fixes issues across the VibeTunnel stack.

**When to use**:
- Test failures
- Runtime errors
- Build problems
- Unexpected behavior
- Performance issues

**Example**:
```
/debug-specialist WebSocket disconnects when switching to chat view on mobile
```

## Best Practices

### 1. Use the Right Agent
- Orchestrator for planning and coordination
- Language specialists for implementation
- Review specialist after coding
- Debug specialist when stuck

### 2. Provide Context
Include relevant information:
- Error messages
- File paths
- What you've already tried
- Related PR or issue numbers

### 3. Chain Agents
For complex tasks, use multiple agents:
```
1. /vt-orchestrator Plan the WebSocket protocol extension
2. /ts-specialist Implement the protocol changes
3. /swift-specialist Update Swift types to match
4. /code-review-specialist Review the integration
```

### 4. Mobile Chat View Workflow
For the current project:
```
1. /vt-orchestrator Which phase 1 task should I start with?
2. /ts-specialist Create the message parser with these requirements...
3. /code-review-specialist Review my parser implementation
4. /debug-specialist Fix the streaming parse error
```

## Tips
- Agents have access to the full codebase context
- They understand VibeTunnel's patterns and standards
- They know about the mobile chat view plan
- They can reference specific files and line numbers
- They follow the project's coding guidelines