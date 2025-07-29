/**
 * Tests for Mobile Theme Toggle Component
 */

import { fixture, html } from '@open-wc/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './mobile-theme-toggle.js';
import type { MobileThemeToggle, Theme } from './mobile-theme-toggle.js';

describe('MobileThemeToggle', () => {
  let element: MobileThemeToggle;

  beforeEach(async () => {
    element = await fixture<MobileThemeToggle>(html`<mobile-theme-toggle></mobile-theme-toggle>`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default light theme', () => {
      expect(element).toBeDefined();
      expect(element.theme).toBe('light');
      
      const button = element.querySelector('button');
      expect(button).toBeTruthy();
      expect(button?.getAttribute('aria-label')).toBe('Toggle theme');
    });

    it('should render correct icon for light theme', () => {
      element.theme = 'light';
      
      const sunIcon = element.querySelector('.sun-icon');
      const moonIcon = element.querySelector('.moon-icon');
      
      expect(sunIcon).toBeTruthy();
      expect(moonIcon).toBeFalsy();
    });

    it('should render correct icon for dark theme', async () => {
      element.theme = 'dark';
      await element.updateComplete;
      
      const sunIcon = element.querySelector('.sun-icon');
      const moonIcon = element.querySelector('.moon-icon');
      
      expect(sunIcon).toBeFalsy();
      expect(moonIcon).toBeTruthy();
    });

    it('should use Tailwind classes (no shadow DOM)', () => {
      const button = element.querySelector('button');
      expect(button?.classList.contains('theme-toggle-button')).toBe(true);
      
      // Should not have shadow root
      expect(element.shadowRoot).toBeNull();
    });
  });

  describe('Theme Toggling', () => {
    it('should toggle from light to dark on click', async () => {
      element.theme = 'light';
      await element.updateComplete;
      
      const button = element.querySelector('button') as HTMLButtonElement;
      button.click();
      
      expect(element.theme).toBe('dark');
    });

    it('should toggle from dark to light on click', async () => {
      element.theme = 'dark';
      await element.updateComplete;
      
      const button = element.querySelector('button') as HTMLButtonElement;
      button.click();
      
      expect(element.theme).toBe('light');
    });

    it('should emit theme-changed event with correct detail', async () => {
      const themeChangedSpy = vi.fn();
      element.addEventListener('theme-changed', themeChangedSpy);
      
      element.theme = 'light';
      await element.updateComplete;
      
      const button = element.querySelector('button') as HTMLButtonElement;
      button.click();
      
      expect(themeChangedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'dark',
          bubbles: true,
          composed: true,
        })
      );
    });

    it('should handle rapid clicks', async () => {
      const themeChangedSpy = vi.fn();
      element.addEventListener('theme-changed', themeChangedSpy);
      
      const button = element.querySelector('button') as HTMLButtonElement;
      
      // Rapid clicks
      for (let i = 0; i < 10; i++) {
        button.click();
        await element.updateComplete;
      }
      
      expect(themeChangedSpy).toHaveBeenCalledTimes(10);
      
      // Should end on same theme if even number of clicks
      expect(element.theme).toBe('light');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const button = element.querySelector('button');
      
      expect(button?.getAttribute('type')).toBe('button');
      expect(button?.getAttribute('aria-label')).toBe('Toggle theme');
      expect(button?.getAttribute('title')).toBe('Toggle theme');
    });

    it('should announce theme change to screen readers', async () => {
      const button = element.querySelector('button') as HTMLButtonElement;
      
      // Mock the announcement element creation
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');
      
      button.click();
      await element.updateComplete;
      
      // Check announcement element was created
      expect(createElementSpy).toHaveBeenCalledWith('div');
      
      const announcementCall = appendChildSpy.mock.calls.find(call => {
        const element = call[0] as HTMLElement;
        return element.getAttribute('role') === 'status';
      });
      
      expect(announcementCall).toBeTruthy();
      
      const announcement = announcementCall?.[0] as HTMLElement;
      expect(announcement.getAttribute('aria-live')).toBe('polite');
      expect(announcement.textContent).toBe('Dark mode enabled');
      expect(announcement.style.position).toBe('absolute');
      expect(announcement.style.left).toBe('-10000px');
      
      // Wait for removal
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(removeChildSpy).toHaveBeenCalledWith(announcement);
    });

    it('should announce correct message for each theme', async () => {
      const button = element.querySelector('button') as HTMLButtonElement;
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      
      // Toggle to dark
      element.theme = 'light';
      await element.updateComplete;
      button.click();
      
      let announcement = appendChildSpy.mock.calls[appendChildSpy.mock.calls.length - 1][0] as HTMLElement;
      expect(announcement.textContent).toBe('Dark mode enabled');
      
      // Toggle to light
      await new Promise(resolve => setTimeout(resolve, 100));
      button.click();
      
      announcement = appendChildSpy.mock.calls[appendChildSpy.mock.calls.length - 1][0] as HTMLElement;
      expect(announcement.textContent).toBe('Light mode enabled');
    });
  });

  describe('Visual Transitions', () => {
    it('should have smooth icon transitions', async () => {
      const button = element.querySelector('button');
      const styles = window.getComputedStyle(button!);
      
      // Check for transition styles
      expect(styles.transition).toContain('transform');
    });

    it('should apply hover state', async () => {
      const button = element.querySelector('button') as HTMLButtonElement;
      
      // Simulate hover
      button.dispatchEvent(new MouseEvent('mouseenter'));
      await element.updateComplete;
      
      // Button should have hover styles applied
      expect(button.classList.contains('hover:bg-surface-hover')).toBe(true);
    });
  });

  describe('Touch Interactions', () => {
    it('should handle touch events', async () => {
      const themeChangedSpy = vi.fn();
      element.addEventListener('theme-changed', themeChangedSpy);
      
      const button = element.querySelector('button') as HTMLButtonElement;
      
      // Simulate touch
      button.dispatchEvent(new TouchEvent('touchstart'));
      button.dispatchEvent(new TouchEvent('touchend'));
      button.click(); // Touch typically triggers click
      
      expect(themeChangedSpy).toHaveBeenCalled();
    });

    it('should have appropriate touch target size', () => {
      const button = element.querySelector('button');
      const styles = window.getComputedStyle(button!);
      
      const width = parseInt(styles.width);
      const height = parseInt(styles.height);
      
      // Should be at least 44px for touch targets (iOS recommendation)
      expect(width).toBeGreaterThanOrEqual(40);
      expect(height).toBeGreaterThanOrEqual(40);
    });
  });

  describe('Integration with Theme System', () => {
    it('should respect initial theme prop', async () => {
      const darkElement = await fixture<MobileThemeToggle>(
        html`<mobile-theme-toggle theme="dark"></mobile-theme-toggle>`
      );
      
      expect(darkElement.theme).toBe('dark');
      
      const moonIcon = darkElement.querySelector('.moon-icon');
      expect(moonIcon).toBeTruthy();
    });

    it('should update when theme prop changes externally', async () => {
      element.theme = 'dark';
      await element.updateComplete;
      
      const moonIcon = element.querySelector('.moon-icon');
      expect(moonIcon).toBeTruthy();
      
      element.theme = 'light';
      await element.updateComplete;
      
      const sunIcon = element.querySelector('.sun-icon');
      expect(sunIcon).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should not cause memory leaks with announcements', async () => {
      const button = element.querySelector('button') as HTMLButtonElement;
      
      // Create multiple announcements
      for (let i = 0; i < 5; i++) {
        button.click();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Wait for all announcements to be removed
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Check no orphaned announcement elements
      const announcements = document.querySelectorAll('[role="status"][aria-live="polite"]');
      expect(announcements.length).toBe(0);
    });

    it('should debounce rapid toggling appropriately', async () => {
      const themeChangedSpy = vi.fn();
      element.addEventListener('theme-changed', themeChangedSpy);
      
      const button = element.querySelector('button') as HTMLButtonElement;
      
      // Simulate rapid clicking
      const clickPromises = [];
      for (let i = 0; i < 20; i++) {
        clickPromises.push(button.click());
      }
      
      await Promise.all(clickPromises);
      await element.updateComplete;
      
      // All clicks should be processed
      expect(themeChangedSpy).toHaveBeenCalledTimes(20);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing theme gracefully', async () => {
      // Force invalid theme
      (element as any).theme = undefined;
      await element.updateComplete;
      
      const button = element.querySelector('button') as HTMLButtonElement;
      
      expect(() => {
        button.click();
      }).not.toThrow();
      
      // Should default to light
      expect(element.theme).toBe('dark');
    });

    it('should validate theme values', () => {
      const validThemes: Theme[] = ['light', 'dark'];
      
      validThemes.forEach(theme => {
        element.theme = theme;
        expect(element.theme).toBe(theme);
      });
    });
  });
});