# VibeTunnel Agents Usage Guide

## Overview
VibeTunnel uses specialized AI agents to help with different aspects of development. Each agent has deep knowledge of specific areas and can significantly speed up implementation.

**Important Note**: The orchestrator agent is a manager/coordinator that delegates work to other specialists. It does not implement code itself.

## Available Agents

### 1. VibeTunnel Orchestrator (`/vt-orchestrator`)
**Purpose**: Project manager that coordinates development by delegating to specialist agents. Does NOT implement code itself.

**When to use**:
- Starting any new feature implementation
- Needing tasks broken down and delegated
- Coordinating work between Swift and TypeScript
- Managing implementation progress
- Updating todo lists

**What it does**:
- Analyzes requirements
- Creates task breakdowns
- Delegates to appropriate specialists
- Tracks progress
- Coordinates between agents

**Example**:
```
/vt-orchestrator Let's begin implementing Phase 1 of the mobile chat view
```

**Important**: The orchestrator will delegate actual coding to ts-specialist, swift-specialist, etc.

### 2. TypeScript Specialist (`/ts-specialist`)
**Purpose**: Expert in all TypeScript/Node.js/Web aspects of VibeTunnel.

**Expertise**:
- TypeScript with strict typing (no `any`)
- Lit Web Components with decorators
- WebSocket binary protocol (0xBF magic byte)
- xterm.js and terminal emulation
- Mobile web responsive design
- Node.js/Bun server implementation

**When to use**:
- Implementing Lit components
- Working with WebSocket protocols
- Parsing terminal output
- Mobile web optimizations
- Writing Vitest or Playwright tests
- Binary buffer handling
- Terminal session management

**Example**:
```
/ts-specialist Implement the chat-message-parser.ts with streaming support
```

### 3. Swift Specialist (`/swift-specialist`)
**Purpose**: Expert in macOS/iOS native development for VibeTunnel.

**Expertise**:
- Swift 6.0 with strict concurrency
- SwiftUI and AppKit
- macOS menu bar applications
- Process management and IPC
- Keychain integration
- Code signing and entitlements

**When to use**:
- Modifying ServerManager or BunServer
- Working with macOS permissions
- Implementing native features
- Debugging Swift concurrency issues
- Menu bar app lifecycle
- iOS companion app features

**Example**:
```
/swift-specialist Add sessionType detection to TunnelSession model
```

### 4. Code Review Specialist (`/code-review-specialist`)
**Purpose**: Provides thorough code reviews with VibeTunnel-specific standards and best practices.

**Review Focus**:
- VibeTunnel coding standards
- Security vulnerabilities
- Performance optimization
- Mobile responsiveness
- TypeScript strict typing
- Swift concurrency safety
- WebSocket protocol correctness

**When to use**:
- After implementing any new feature
- Before committing significant changes
- When refactoring existing code
- To catch security or performance issues
- Checking mobile compatibility

**Example**:
```
/code-review-specialist Review the new chat-view.ts component for mobile best practices
```

### 5. Debug Specialist (`/debug-specialist`)
**Purpose**: Systematically diagnoses and fixes issues across the VibeTunnel stack with specialized knowledge of common VibeTunnel problems.

**Specialized Knowledge**:
- BunServer process failures
- Port 4020 conflicts
- WebSocket disconnections
- Swift actor isolation
- Binary buffer protocol issues
- Mobile viewport problems
- Development vs production mode

**When to use**:
- Test failures
- Runtime errors
- Build problems
- Unexpected behavior
- Performance issues
- Integration problems

**Example**:
```
/debug-specialist WebSocket disconnects when switching to chat view on mobile
```

### 6. Git Auto-Commit (`/git-auto-commit`)
**Purpose**: Analyzes changes and creates well-crafted commit messages following conventional commits format.

**What it does**:
- Runs git status and diff to analyze changes
- Creates conventional commit messages (feat, fix, docs, etc.)
- Stages changes appropriately
- Commits and pushes to remote
- Handles merge conflicts gracefully

**When to use**:
- After completing a feature or fix
- When ready to commit tested changes
- Need to push to remote repository
- Want consistent, informative commit messages

**Example**:
```
/git-auto-commit Commit the new chat view parser implementation
```

**Note**: Always ensure tests pass before using this agent

## Best Practices

### 1. Use the Right Agent
- Orchestrator for planning and coordination
- Language specialists for implementation
- Review specialist after coding
- Debug specialist when stuck
- Git auto-commit when ready to commit

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
5. /git-auto-commit Commit the completed feature
```

### 4. Mobile Chat View Workflow
For the current project:
```
1. /vt-orchestrator Which phase 1 task should I start with?
2. /ts-specialist Create the message parser with these requirements...
3. /code-review-specialist Review my parser implementation
4. /debug-specialist Fix the streaming parse error
5. /git-auto-commit Commit the completed parser feature
```

### 5. Complete Feature Workflow (Now Fully Automated)
Example of implementing a full feature:
```
1. User: "Implement [feature]" → Auto-triggers vt-orchestrator
2. vt-orchestrator → Auto-delegates to ts-specialist/swift-specialist
3. Specialist completes → Auto-handoff to code-review-specialist
4. Review passes → Auto-handoff to git-auto-commit
5. Commit successful → Auto-handoff to vt-orchestrator (phase assessment)
6. If issues found → Auto-handoff to debug-specialist → back to step 2
```

## Automatic Workflow Chains

### Standard Implementation Chain (Fully Automated)
```
User Request → vt-orchestrator → implementation specialist → code-review-specialist → git-auto-commit → vt-orchestrator (phase assessment)
```

### Debug & Fix Chain (Fully Automated)
```
Error/Issue → debug-specialist → implementation specialist → code-review-specialist → git-auto-commit → vt-orchestrator
```

### Phase Progression Chain (Fully Automated)
```
Phase N Complete → vt-orchestrator (assessment) → vt-orchestrator (Phase N+1 planning) → implementation specialist → [continues automatically]
```

### Multi-Component Feature Chain (Coordinated)
```
Complex Feature → vt-orchestrator → multiple specialists (parallel/sequential) → code-review-specialist (each) → git-auto-commit → vt-orchestrator
```

## Tips for Automated Workflow System
- **Agents automatically hand off** - no manual coordination needed
- **Quality gates enforced** - all code goes through review before commit
- **Continuous progress** - phases advance automatically when complete
- **User intervention minimal** - only for decisions and direction changes
- **Error recovery automatic** - debug issues automatically route to appropriate specialists
- **Todo list central** - orchestrator monitors completion status for phase advancement
- **Parallel processing** - complex features coordinate multiple specialists automatically

## When to Intervene
**Let automation run for:**
- Feature implementation and testing
- Code review and quality checks
- Git commits and pushes
- Phase progression and planning
- Error diagnosis and fixes

**Intervene only for:**
- "stop" or "pause" to halt automation
- Architectural decisions requiring input
- External dependency approvals
- Major direction changes
- Emergency troubleshooting

## Backward Compatibility
**Manual agent calling still works:**
- `/vt-orchestrator Plan the next feature`
- `/ts-specialist Fix this TypeScript error`  
- `/code-review-specialist Review my changes`

But the **automatic system is preferred** for continuous development workflow.

## Agent Capabilities Summary

| Agent | Implements Code | Reviews Code | Manages Tasks | Debugs | Commits |
|-------|----------------|--------------|---------------|---------|---------|
| vt-orchestrator | ❌ | ❌ | ✅ | ❌ | ❌ |
| ts-specialist | ✅ | ❌ | ❌ | ❌ | ❌ |
| swift-specialist | ✅ | ❌ | ❌ | ❌ | ❌ |
| code-review-specialist | ❌ | ✅ | ❌ | ❌ | ❌ |
| debug-specialist | ✅ | ❌ | ❌ | ✅ | ❌ |
| git-auto-commit | ❌ | ❌ | ❌ | ❌ | ✅ |