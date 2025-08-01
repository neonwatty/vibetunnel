import { TerminalTestUtils } from '../utils/terminal-test-utils';
import { WaitUtils } from '../utils/test-utils';
import { BasePage } from './base.page';

/**
 * Page object for the terminal session view, providing terminal interaction capabilities.
 *
 * This class handles all interactions within an active terminal session, including
 * command execution, output verification, terminal control operations, and navigation.
 * It wraps terminal-specific utilities to provide a clean interface for test scenarios
 * that need to interact with the terminal emulator.
 *
 * Key features:
 * - Command execution with automatic Enter key handling
 * - Terminal output reading and waiting for specific text
 * - Terminal control operations (clear, interrupt, resize)
 * - Copy/paste functionality
 * - Session navigation (back to list)
 * - Terminal state verification
 *
 * @example
 * ```typescript
 * // Execute commands and verify output
 * const sessionView = new SessionViewPage(page);
 * await sessionView.waitForTerminalReady();
 * await sessionView.typeCommand('echo "Hello World"');
 * await sessionView.waitForOutput('Hello World');
 *
 * // Control terminal
 * await sessionView.clearTerminal();
 * await sessionView.sendInterrupt(); // Ctrl+C
 * await sessionView.resizeTerminal(800, 600);
 *
 * // Navigate back
 * await sessionView.navigateBack();
 * ```
 */
export class SessionViewPage extends BasePage {
  // Selectors
  private readonly selectors = {
    terminal: 'vibe-terminal',
    terminalBuffer: 'vibe-terminal-buffer',
    sessionHeader: 'session-header',
    backButton: 'button:has-text("Back")',
    vibeTunnelLogo: 'button:has(h1:has-text("VibeTunnel"))',
  };

  private terminalSelector = this.selectors.terminal;

  async waitForTerminalReady() {
    // Wait for terminal element to be visible
    await this.page.waitForSelector(this.selectors.terminal, {
      state: 'visible',
      timeout: process.env.CI ? 10000 : 4000,
    });

    // Wait for terminal to be fully initialized (has content or structure)
    // Determine timeout based on CI environment before passing to browser context
    const timeout = process.env.CI ? 10000 : 5000;

    await this.page.waitForFunction(
      () => {
        const terminal = document.querySelector('vibe-terminal');
        if (!terminal) return false;

        // Terminal is ready if it has content, shadow root, or xterm element
        // Check the terminal container first
        const container = terminal.querySelector('#terminal-container');
        const hasContainerContent =
          container?.textContent && container.textContent.trim().length > 0;
        const hasContent = terminal.textContent && terminal.textContent.trim().length > 0;
        const hasShadowRoot = !!terminal.shadowRoot;
        const hasXterm = !!terminal.querySelector('.xterm');

        return hasContainerContent || hasContent || hasShadowRoot || hasXterm;
      },
      { timeout }
    );
  }

  async typeCommand(command: string, pressEnter = true) {
    if (pressEnter) {
      await TerminalTestUtils.executeCommand(this.page, command);
    } else {
      await TerminalTestUtils.typeInTerminal(this.page, command);
    }
  }

  async waitForOutput(text: string, options?: { timeout?: number }) {
    await TerminalTestUtils.waitForText(
      this.page,
      text,
      options?.timeout || (process.env.CI ? 5000 : 2000)
    );
  }

  async getTerminalOutput(): Promise<string> {
    return await TerminalTestUtils.getTerminalText(this.page);
  }

  async clearTerminal() {
    await TerminalTestUtils.clearTerminal(this.page);
  }

  async sendInterrupt() {
    await TerminalTestUtils.sendInterrupt(this.page);
  }

  async resizeTerminal(width: number, height: number) {
    await this.page.setViewportSize({ width, height });
    // Wait for terminal to stabilize after resize
    await WaitUtils.waitForElementStable(this.page.locator(this.terminalSelector), {
      timeout: 2000,
    });
  }

  async copyText() {
    await this.page.click(this.selectors.terminal);
    // Select all and copy
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Control+c');
  }

  async pasteText(text: string) {
    await this.page.click(this.selectors.terminal);
    // Use clipboard API if available, otherwise type directly
    const clipboardAvailable = await this.page.evaluate(() => !!navigator.clipboard);

    if (clipboardAvailable) {
      await this.page.evaluate(async (textToPaste) => {
        await navigator.clipboard.writeText(textToPaste);
      }, text);
      await this.page.keyboard.press('Control+v');
    } else {
      // Fallback: type the text directly
      await this.page.keyboard.type(text);
    }
  }

  async navigateBack() {
    // Try multiple ways to navigate back to the session list

    // 1. Try the back button in the header
    const backButton = this.page.locator(this.selectors.backButton).first();
    if (await backButton.isVisible({ timeout: 1000 })) {
      await backButton.click();
      await this.page.waitForURL('/', { timeout: process.env.CI ? 10000 : 5000 });
      return;
    }

    // 2. Try clicking on the app title/logo to go home
    const appTitle = this.page
      .locator('h1, a')
      .filter({ hasText: /VibeTunnel/i })
      .first();
    if (await appTitle.isVisible({ timeout: 1000 })) {
      await appTitle.click();
      return;
    }

    // 3. As last resort, use browser back button
    await this.page.goBack().catch(() => {
      // If browser back fails, we have to use goto
      return this.page.goto('/');
    });
  }

  async isTerminalActive(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const terminal = document.querySelector('vibe-terminal');
      const container = document.querySelector('[data-testid="terminal-container"]');
      return terminal !== null && container !== null && container.clientHeight > 0;
    });
  }

  async waitForPrompt(promptText?: string) {
    if (promptText) {
      await this.waitForOutput(promptText);
    } else {
      await TerminalTestUtils.waitForPrompt(this.page);
    }
  }

  async executeAndWait(command: string, expectedOutput: string) {
    await TerminalTestUtils.executeCommand(this.page, command);
    await this.waitForOutput(expectedOutput);
  }

  async clickTerminal() {
    await this.page.click(this.terminalSelector);
  }
}
