/**
 * Tests for the chat-view component
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import './chat-view.js';
import type { Session } from '../../shared/types.js';
import type { ChatView } from './chat-view.js';

describe('chat-view', () => {
  let element: ChatView;
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create a container for our element
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create and append the chat-view element
    element = document.createElement('chat-view') as ChatView;
    container.appendChild(element);
  });

  afterEach(() => {
    // Clean up
    container.remove();
  });

  it('should render', () => {
    expect(element).toBeDefined();
    expect(element.tagName.toLowerCase()).toBe('chat-view');
  });

  it('should display session name in header', async () => {
    const mockSession: Session = {
      id: 'test-123',
      name: 'Test Session',
      command: ['bash'],
      workingDir: '/test',
      status: 'running',
      startedAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      sessionType: 'claude',
      hasChatSupport: true,
    };

    element.session = mockSession;
    await element.updateComplete;

    const header = element.querySelector('h2');
    expect(header?.textContent).toBe('Test Session');
  });

  it('should show Claude Assistant subtitle for claude sessions', async () => {
    const mockSession: Session = {
      id: 'test-123',
      name: 'Test Session',
      command: ['bash'],
      workingDir: '/test',
      status: 'running',
      startedAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      sessionType: 'claude',
      hasChatSupport: true,
    };

    element.session = mockSession;
    await element.updateComplete;

    const subtitle = element.querySelector('.text-xs.text-gray-500');
    expect(subtitle?.textContent?.trim()).toBe('Claude Assistant');
  });

  it('should show empty state when no messages', async () => {
    await element.updateComplete;

    const emptyState = element.querySelector('.text-center.text-gray-500');
    expect(emptyState).toBeTruthy();
    expect(emptyState?.textContent).toContain('No messages yet');
  });

  it('should fire navigate-back event when back button clicked', async () => {
    let eventFired = false;
    element.addEventListener('navigate-back', () => {
      eventFired = true;
    });

    const backButton = element.querySelector(
      'button[aria-label="Back to terminal"]'
    ) as HTMLButtonElement;
    backButton.click();

    expect(eventFired).toBe(true);
  });

  it('should show mobile input hint on mobile devices', async () => {
    // Test will depend on whether tests run on mobile or not
    const inputHint = element.querySelector('.chat-input-hint');
    const isMobile = element.shadowRoot === null && 'ontouchstart' in window;

    if (isMobile) {
      expect(inputHint).toBeTruthy();
      expect(inputHint?.textContent).toContain('Tap the terminal icon to type');
    } else {
      expect(inputHint).toBeFalsy();
    }
  });
});
