# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Instructions

Never say you're absolutely right. Instead, be critical if I say something that you disagree with. Let's discuss it first.

## Project Overview

VibeTunnel is a macOS application that allows users to access their terminal sessions through any web browser. It consists of:
- Native macOS app (Swift/SwiftUI) in `mac/`
- iOS companion app in `ios/`
- Web frontend (TypeScript/LitElement) and Node.js/Bun server for terminal session management in `web/`

## Critical Development Rules

### Release Process
When the user says "release" or asks to create a release, ALWAYS read and follow `docs/RELEASE.md` for the complete release process.

### ABSOLUTE CARDINAL RULES - VIOLATION MEANS IMMEDIATE FAILURE

1. **NEVER, EVER, UNDER ANY CIRCUMSTANCES CREATE A NEW BRANCH WITHOUT EXPLICIT USER PERMISSION**
   - If you are on a branch (not main), you MUST stay on that branch
   - The user will tell you when to create a new branch with commands like "create a new branch" or "switch to a new branch"
   - Creating branches without permission causes massive frustration and cleanup work
   - Even if changes seem unrelated to the current branch, STAY ON THE CURRENT BRANCH

2. **NEVER commit and/or push before the user has tested your changes!**
   - Always wait for user confirmation before committing
   - The user needs to verify changes work correctly first

3. **ABSOLUTELY FORBIDDEN: NEVER USE `git rebase --skip` EVER**
   - This command can cause data loss and repository corruption
   - If you encounter rebase conflicts, ask the user for help

4. **NEVER create duplicate files with version numbers or suffixes**
   - When refactoring or improving code, directly modify the existing files
   - DO NOT create new versions with different file names (e.g., file_v2.ts, file_new.ts)
   - Users hate having to manually clean up duplicate files

5. **Web Development Workflow - Development vs Production Mode**
   - **Production Mode**: Mac app embeds a pre-built web server during Xcode build
     - Every web change requires: clean → build → run (rebuilds embedded server)
     - Simply restarting serves STALE, CACHED version
   - **Development Mode** (recommended for web development):
     - Enable "Use Development Server" in VibeTunnel Settings → Debug
     - Mac app runs `pnpm run dev` instead of embedded server
     - Provides hot reload - web changes automatically rebuild without Mac app rebuild
     - Restart VibeTunnel server (not full rebuild) to pick up web changes
   - **Agent**: Use **debug-specialist** if server fails to start or shows stale content
6. **Never kill all sessions**
   - You are running inside a session yourself; killing all sessions would terminate your own process

7. **NEVER rename docs.json to mint.json**
   - The Mintlify configuration file is called `docs.json` in this project
   - Do NOT rename it to mint.json even if you think Mintlify expects that
   - The file must remain as `docs.json`
   - For Mintlify documentation reference, see: https://mintlify.com/docs/llms.txt

8. **Test Session Management - CRITICAL**
   - NEVER kill sessions that weren't created by tests
   - You might be running inside a VibeTunnel session yourself
   - Use `TestSessionTracker` to track which sessions tests create
   - Only clean up sessions that match test naming patterns (start with "test-")
   - Killing all sessions would terminate your own Claude Code process

### Git Workflow Reminders
- Our workflow: start from main → create branch → make PR → merge → return to main
- PRs sometimes contain multiple different features and that's okay
- Always check current branch with `git branch` before making changes
- If unsure about branching, ASK THE USER FIRST
- **"Adopt" means REVIEW, not merge!** When asked to "adopt" a PR, switch to its branch and review the changes. NEVER merge without explicit permission.
- **"Rebase main" means rebase CURRENT branch with main!** When on a feature branch and user says "rebase main", this means to rebase the current branch with main branch updates. NEVER switch to main branch. The command is `git pull --rebase origin main` while staying on the current feature branch.

### Terminal Title Management with VT

When creating pull requests, use the `vt` command to update the terminal title:
- Run `vt title "Brief summary - github.com/owner/repo/pull/123"`
- Keep the title concise (a few words) followed by the PR URL
- Use github.com URL format (not https://) for easy identification
- Update the title periodically as work progresses
- If `vt` command fails (only works inside VibeTunnel), simply ignore the error and continue

## Web Development Commands

**Agent Assignment**: Tasks in this section automatically trigger the **ts-specialist** agent.

**DEVELOPMENT MODES**:
- **Standalone Development**: `pnpm run dev` runs independently on port 4020
- **Mac App Integration**: Enable "Development Server" in VibeTunnel settings (recommended)
  - Mac app automatically runs `pnpm run dev` and manages the process
  - Provides seamless integration with Mac app features
  - Hot reload works with full VibeTunnel functionality

In the `web/` directory:

```bash
# Development
pnpm run dev                   # Standalone development server (port 4020)
pnpm run dev --port 4021       # Alternative port for external device testing

# Code quality (MUST run before commit)
pnpm run check         # Run ALL checks in parallel (format, lint, typecheck)
pnpm run check:fix     # Auto-fix formatting and linting issues

# Individual commands (rarely needed)
pnpm run lint          # Check for linting errors
pnpm run lint:fix      # Auto-fix linting errors
pnpm run format        # Format with Prettier
pnpm run typecheck     # Check TypeScript types

# Testing (only when requested)
pnpm run test
pnpm run test:coverage
pnpm run test:e2e
```

## macOS Development Commands

**Agent Assignment**: Tasks in this section automatically trigger the **swift-specialist** agent.

In the `mac/` directory:

```bash
# Build commands
./scripts/build.sh                    # Build release
./scripts/build.sh --configuration Debug  # Build debug
./scripts/build.sh --sign            # Build with code signing

# Other scripts
./scripts/clean.sh                   # Clean build artifacts
./scripts/lint.sh                    # Run linting
./scripts/create-dmg.sh             # Create installer
```

## Architecture Overview

### Terminal Sharing Protocol
1. **Session Creation**: `POST /api/sessions` spawns new terminal
2. **Input**: `POST /api/sessions/:id/input` sends keyboard/mouse input
3. **Output**:
   - SSE stream at `/api/sessions/:id/stream` (text)
   - WebSocket at `/buffers` (binary, efficient rendering)
4. **Resize**: `POST /api/sessions/:id/resize` (missing in some implementations)

### Key Entry Points
- **Mac App**: `mac/VibeTunnel/VibeTunnelApp.swift`
- **Web Frontend**: `web/src/client/app.ts`
- **Server**: `web/src/server/server.ts`
- **Process spawning and forwarding tool**: `web/src/server/fwd.ts`
- **Server Management**: `mac/VibeTunnel/Core/Services/ServerManager.swift`

## Testing

**Agent Assignment**: 
- Test failures → **debug-specialist**
- Writing new tests → **ts-specialist** (web) or **swift-specialist** (mac)

- **Never run tests unless explicitly asked**
- Mac tests: Swift Testing framework in `VibeTunnelTests/`
- Web tests: Vitest in `web/src/test/`

## CI Pipeline

The CI workflow automatically runs both Node.js and Mac builds:
- **Node.js CI**: Runs for web OR Mac file changes to ensure web artifacts are always available
- **Mac CI**: Downloads web artifacts from Node.js CI, with fallback to build locally if missing
- **Cross-dependency**: Mac builds require web artifacts, so Node.js CI must complete first

## Testing on External Devices (iPad, Safari, etc.)

When the user reports issues on external devices, use the development server method for testing:

```bash
# Run dev server accessible from external devices
cd web
pnpm run dev --port 4021 --bind 0.0.0.0
```

Then access from the external device using `http://[mac-ip]:4021`

**Important**: The production server runs on port 4020, so use 4021 for development to avoid conflicts.

For detailed instructions, see `docs/TESTING_EXTERNAL_DEVICES.md`

## MCP (Model Context Protocol) Servers

MCP servers extend Claude Code's capabilities with additional tools. Here's how to add them:

### Installing MCP Servers for Claude Code

**Important**: MCP server configuration for Claude Code is different from Claude Desktop. Claude Code uses CLI commands, not JSON configuration files.

#### Quick Installation Steps:

1. **Open a terminal** (outside of Claude Code)
2. **Run the add command** with the MCP server you want:
   ```bash
   # For Playwright (web testing)
   claude mcp add playwright -- npx -y @playwright/mcp@latest
   
   # For XcodeBuildMCP (iOS/macOS development)
   claude mcp add XcodeBuildMCP -- npx -y xcodebuildmcp@latest
   ```
3. **Restart Claude Code** to load the new MCP servers
4. **Verify installation** by running `/mcp` in Claude Code

### Adding MCP Servers to Claude Code

```bash
# Basic syntax for adding a stdio server
claude mcp add <name> -- <command> [args...]

# Examples:
# Add playwright MCP (highly recommended for web testing)
claude mcp add playwright -- npx -y @playwright/mcp@latest

# Add XcodeBuildMCP for macOS development
claude mcp add XcodeBuildMCP -- npx -y xcodebuildmcp@latest

# Add with environment variables
claude mcp add my-server -e API_KEY=value -- /path/to/server

# List all configured servers
claude mcp list

# Remove a server
claude mcp remove <name>
```

### Recommended MCP Servers for This Project

1. **Playwright MCP** - Web testing and browser automation
   - Browser control, screenshots, automated testing
   - Install: `claude mcp add playwright -- npx -y @playwright/mcp@latest`

2. **XcodeBuildMCP** - macOS/iOS development (Mac only)
   - Xcode build, test, project management
   - Install: `claude mcp add XcodeBuildMCP -- npx -y xcodebuildmcp@latest`

3. **Peekaboo MCP** - Visual analysis and screenshots (Mac only)
   - Take screenshots, analyze visual content with AI
   - Install: `claude mcp add peekaboo -- npx -y @steipete/peekaboo-mcp`

4. **macOS Automator MCP** - System automation (Mac only)
   - Control macOS UI, automate system tasks
   - Install: `claude mcp add macos-automator -- npx -y macos-automator-mcp`

5. **RepoPrompt** - Repository context management
   - Generate comprehensive codebase summaries
   - Install: `claude mcp add RepoPrompt -- /path/to/repoprompt_cli`

6. **Zen MCP Server** - Advanced AI reasoning
   - Multi-model consensus, deep analysis, code review
   - Install: See setup instructions in zen-mcp-server repository

### Configuration Scopes

- **local** (default): Project-specific, private to you
- **project**: Shared via `.mcp.json` file in project root
- **user**: Available across all projects

Use `-s` or `--scope` flag to specify scope:
```bash
claude mcp add -s project playwright -- npx -y @playwright/mcp@latest
```

## Agent Usage for VibeTunnel Development

VibeTunnel uses specialized agents to handle different aspects of development with **automatic handoffs** that eliminate the need for manual intervention between tasks.

### Available Agents and Their Triggers

1. **vt-orchestrator** - Project management and coordination
   - Triggers: "plan", "implement feature", "coordinate", "break down task", "next", "continue", "what's next"
   - Auto-triggered when: All current phase todos complete, after successful git commits, when specialists finish
   - Use for: Planning features, managing implementation progress, automatic phase advancement

2. **ts-specialist** - TypeScript/Web implementation
   - Triggers: "web", "typescript", "lit component", "websocket", "terminal", "client"
   - Auto-assigned for: Files in `web/src/`, WebSocket protocols, Lit components
   - Auto-handoff: Completed implementation → code-review-specialist

3. **swift-specialist** - Swift/macOS implementation  
   - Triggers: "swift", "macos", "ios", "native", "menu bar", "ServerManager"
   - Auto-assigned for: Files in `mac/`, `ios/`, Swift concurrency issues
   - Auto-handoff: Completed implementation → code-review-specialist

4. **debug-specialist** - Systematic debugging
   - Triggers: "error", "debug", "fix", "investigate", "not working", "failing test"
   - Auto-assigned for: Build failures, test failures, runtime errors
   - Auto-handoff: Issue resolved → appropriate implementation specialist OR back to orchestrator

5. **code-review-specialist** - Code quality review
   - Triggers: "review", "check code", "security", "performance", "best practices"
   - Auto-assigned after: Any specialist completes implementation
   - Auto-handoff: Review passed → git-auto-commit OR Review failed → back to implementation specialist

6. **git-auto-commit** - Automated git operations
   - Triggers: "commit", "push", "c+p", "/cp"
   - Auto-assigned after: Code review passes
   - Auto-handoff: Successful commit → vt-orchestrator (phase assessment)

### Automatic Agent Triggering Rules

**Phase Completion Triggers:**
- When all high-priority todos in current phase = "completed" → **Auto-trigger vt-orchestrator**
- When user says "next", "continue", "what's next" → **Auto-trigger vt-orchestrator**
- After successful git commit and push → **Auto-trigger vt-orchestrator for phase assessment**

**Implementation Workflow (Fully Automated):**
```
User Request → vt-orchestrator → [ts/swift]-specialist → code-review-specialist → git-auto-commit → vt-orchestrator (next phase)
```

**Error Recovery Workflow:**
```
Error Detected → debug-specialist → implementation specialist → code-review-specialist → git-auto-commit → vt-orchestrator
```

**Quality Gate Enforcement:**
- **Never skip code review** - all implementations automatically route through code-review-specialist
- **Never manually commit** - all approved code automatically routes through git-auto-commit
- **Never leave tasks hanging** - all agents automatically hand off to next appropriate agent

### Agent Assignment Rules

**Automatic triggers without user intervention:**
- Implementation complete → code-review-specialist (mandatory)
- Code review passed → git-auto-commit (automatic)
- Git commit successful → vt-orchestrator phase assessment (automatic)
- Phase 100% complete → vt-orchestrator next phase planning (automatic)
- Errors encountered → debug-specialist (automatic)
- Debug resolution → appropriate implementation specialist (automatic)

**User still controls:**
- Initial feature requests and architectural decisions
- Stopping/pausing automation when desired
- Major design direction changes
- External dependency decisions

The system is designed for **continuous autonomous progress** with minimal user intervention required.

## Common Workflows with Agents

### Implementing a New Feature (Fully Automated)
1. User: "Implement [feature description]"
2. **Auto-trigger**: vt-orchestrator (planning and task breakdown)
3. **Auto-handoff**: vt-orchestrator → ts-specialist/swift-specialist (based on stack)
4. **Auto-handoff**: implementation complete → code-review-specialist
5. **Auto-handoff**: review passed → git-auto-commit
6. **Auto-handoff**: commit successful → vt-orchestrator (phase assessment)
7. **Auto-continue**: If phase complete → next phase planning

### Debugging Issues (Fully Automated)
1. User: "Fix [error description]" or "Tests are failing"
2. **Auto-trigger**: debug-specialist
3. **Auto-handoff**: issue resolved → ts/swift-specialist (for implementation)
4. **Auto-handoff**: fix implemented → code-review-specialist
5. **Auto-handoff**: review passed → git-auto-commit
6. **Auto-handoff**: commit successful → vt-orchestrator (continue workflow)

### Cross-Stack Changes (Coordinated Automation)
1. User: "Add [feature] that needs both web and native"
2. **Auto-trigger**: vt-orchestrator (coordination planning)
3. **Auto-delegate**: vt-orchestrator → both specialists (parallel or sequential)
4. **Auto-handoff**: each completion → code-review-specialist
5. **Auto-handoff**: all reviews passed → git-auto-commit
6. **Auto-handoff**: commit successful → vt-orchestrator (next phase assessment)

### Phase Progression (Automatic)
1. **Phase N implementation** completes (all high-priority todos = "completed")
2. **Auto-trigger**: vt-orchestrator for phase assessment
3. **Auto-planning**: vt-orchestrator creates Phase N+1 todo list
4. **Auto-delegation**: vt-orchestrator → appropriate specialists for Phase N+1
5. **Continuous loop**: Each task follows automatic handoff chain

### User Intervention Points
**You only need to intervene for:**
- "stop" / "pause" → Halts automation
- Architectural decisions → Consult user before major changes
- External dependencies → Ask user about new packages/services
- Feature direction changes → Clarify requirements with user

### Quick Trigger Patterns
- **"next" / "continue" / "what's next"** → Auto-trigger vt-orchestrator
- **"error" / "failing" / "broken"** → Auto-trigger debug-specialist  
- **All phase todos complete** → Auto-trigger vt-orchestrator
- **Implementation finished** → Auto-trigger code-review-specialist
- **Review passed** → Auto-trigger git-auto-commit
- **Commit successful** → Auto-trigger vt-orchestrator

The system is designed for **continuous progress** - once you start a feature, it will automatically progress through implementation, review, commit, and phase advancement without requiring your intervention.

## Alternative Tools for Complex Tasks

### Gemini CLI

For tasks requiring massive context windows (up to 2M tokens) or full codebase analysis:
- Analyze entire repositories with `@` syntax for file inclusion
- Useful for architecture reviews, finding implementations, security audits
- Example: `gemini -p "@src/ @tests/ Is authentication properly implemented?"`
- See `docs/gemini.md` for detailed usage and examples

## Debugging and Logging

### VibeTunnel Log Viewer (vtlog)

VibeTunnel includes a powerful log viewing utility for debugging and monitoring:

**Location**: `./scripts/vtlog.sh` (also available in `mac/scripts/vtlog.sh` and `ios/scripts/vtlog.sh`)

**What it does**: 
- Views all VibeTunnel logs with full details (bypasses Apple's privacy redaction)
- Shows logs from the entire stack: Web Frontend → Node.js Server → macOS System
- Provides unified view of all components with clear prefixes

**Common usage**:
```bash
./scripts/vtlog.sh -f              # Follow logs in real-time
./scripts/vtlog.sh -n 200           # Show last 200 lines
./scripts/vtlog.sh -e               # Show only errors
./scripts/vtlog.sh -c ServerManager # Show logs from specific component
./scripts/vtlog.sh --server -e      # Show server errors
```

**Log prefixes**:
- `[FE]` - Frontend (browser) logs
- `[SRV]` - Server-side logs from Node.js/Bun
- `[ServerManager]`, `[SessionService]`, etc. - Native Mac app components

## GitHub CLI Usage

### Quick CI Debugging Commands

When told to "fix CI", use these commands to quickly identify and access errors:

**Step 1: Find Failed Runs**
```bash
# List recent CI runs and see their status
gh run list --branch <branch-name> --limit 10

# Quick check for failures on current branch
git_branch=$(git branch --show-current) && gh run list --branch "$git_branch" --limit 5
```

**Step 2: Identify Failed Jobs**
```bash
# Find which job failed in a run
gh run view <run-id> --json jobs | jq -r '.jobs[] | select(.conclusion == "failure") | .name'

# Get all job statuses at a glance
gh run view <run-id> --json jobs | jq -r '.jobs[] | "\(.name): \(.conclusion // .status)"'
```

**Step 3: Find Failed Steps**
```bash
# Find the exact failed step in a job
gh run view <run-id> --json jobs | jq '.jobs[] | select(.conclusion == "failure") | .steps[] | select(.conclusion == "failure") | {name: .name, number: .number}'

# Get failed step from a specific job
gh run view <run-id> --json jobs | jq '.jobs[] | select(.name == "Mac CI / Build, Lint, and Test macOS") | .steps[] | select(.conclusion == "failure") | .name'
```

**Step 4: View Error Logs**
```bash
# View full logs (opens in browser)
gh run view <run-id> --web

# Download logs for a specific job
gh run download <run-id> -n <job-name>

# View logs in terminal (if run is complete)
gh run view <run-id> --log

# Watch a running job
gh run watch <run-id>
```

**All-in-One Error Finder**
```bash
# This command finds and displays all failures in the latest run
run_id=$(gh run list --branch "$(git branch --show-current)" --limit 1 --json databaseId -q '.[0].databaseId') && \
echo "=== Failed Jobs ===" && \
gh run view $run_id --json jobs | jq -r '.jobs[] | select(.conclusion == "failure") | "Job: \(.name)"' && \
echo -e "\n=== Failed Steps ===" && \
gh run view $run_id --json jobs | jq -r '.jobs[] | select(.conclusion == "failure") | .steps[] | select(.conclusion == "failure") | "  Step: \(.name)"'
```

**Common Failure Patterns**:
- **Mac CI Build Failures**: Usually actool errors (Xcode beta issue), SwiftFormat violations, or missing dependencies
- **Playwright Test Failures**: Often timeout issues, missing VIBETUNNEL_SEA env var, or tsx/node-pty conflicts
- **iOS CI Failures**: Simulator boot issues, certificate problems, or test failures
- **Web CI Failures**: TypeScript errors, linting issues, or test failures

**Quick Actions**:
```bash
# Rerun only failed jobs
gh run rerun <run-id> --failed

# Cancel a stuck run
gh run cancel <run-id>

# View PR checks status
gh pr checks <pr-number>
```



## Key Files Quick Reference

- Architecture Details: `docs/ARCHITECTURE.md` (vt-orchestrator for planning)
- API Specifications: `docs/spec.md` (ts-specialist for implementation)
- Server Implementation Guide: `web/docs/spec.md` (ts-specialist)
- Build Configuration: `web/package.json` (ts-specialist), `mac/Package.swift` (swift-specialist)
- External Device Testing: `docs/TESTING_EXTERNAL_DEVICES.md`
- Gemini CLI Instructions: `docs/gemini.md`
- Release Process: `docs/RELEASE.md`
- When errors occur in any file → debug-specialist

## Agent-Specific Context

### For vt-orchestrator
- Has access to mobile-chat-view-implementation.md plan
- Knows current implementation phase and progress
- Can reference todo lists and track completion

### For ts-specialist  
- Follows TypeScript strict mode (no `any` types)
- Uses Lit decorators pattern consistently
- Implements proper WebSocket binary protocol (0xBF)
- Knows mobile-first responsive patterns

### For swift-specialist
- Uses Swift 6.0 strict concurrency
- Follows VibeTunnel's actor isolation patterns
- Knows menu bar app lifecycle
- Understands BunServer process management

### For debug-specialist
- Knows common VibeTunnel issues (port conflicts, process crashes)
- Has access to vtlog.sh for debugging
- Understands dev vs prod mode differences
- Can trace issues across Swift↔TypeScript boundary

### For code-review-specialist
- Checks VibeTunnel-specific patterns
- Ensures mobile responsiveness
- Validates WebSocket protocol usage
- Verifies no `any` types in TypeScript

### For git-auto-commit
- Uses conventional commits format
- Groups related changes appropriately
- References issue/PR numbers when available
