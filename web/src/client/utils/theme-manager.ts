/**
 * Theme Manager
 *
 * Centralized theme management utility that handles theme detection,
 * persistence, and application across the app.
 */

import { createLogger } from './logger.js';

const logger = createLogger('theme-manager');

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

export interface ThemeConfig {
  preference: ThemePreference;
  effective: Theme;
}

export class ThemeManager {
  private static instance?: ThemeManager;

  private readonly STORAGE_KEY = 'vibetunnel-theme';
  private mediaQuery: MediaQueryList;
  private listeners = new WeakMap<object, (config: ThemeConfig) => void>();
  private listenerRefs = new Set<object>();
  private currentPreference: ThemePreference = 'system';
  private currentEffectiveTheme: Theme = 'light';
  private metaThemeColor?: HTMLMetaElement | null;
  private metaStatusBar?: HTMLMetaElement | null;

  private constructor() {
    // Set up system preference listener
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', this.handleSystemThemeChange);

    // Load saved preference
    this.loadPreference();

    // Apply initial theme
    this.applyTheme();
  }

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  /**
   * Get current theme configuration
   */
  getConfig(): ThemeConfig {
    return {
      preference: this.currentPreference,
      effective: this.currentEffectiveTheme,
    };
  }

  /**
   * Set theme preference
   */
  setPreference(preference: ThemePreference) {
    logger.log(`Setting theme preference to: ${preference}`);

    this.currentPreference = preference;

    try {
      localStorage.setItem(this.STORAGE_KEY, preference);
    } catch (error) {
      logger.error('Failed to save theme preference to localStorage:', error);
    }

    this.applyTheme();

    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(listener: (config: ThemeConfig) => void): () => void {
    // Create a unique reference object for this subscription
    const ref = {};
    this.listeners.set(ref, listener);
    this.listenerRefs.add(ref);

    // Call immediately with current config
    try {
      listener(this.getConfig());
    } catch (error) {
      logger.error('Error calling theme listener on subscribe:', error);
    }

    // Return unsubscribe function
    return () => {
      this.listenerRefs.delete(ref);
      this.listeners.delete(ref);
    };
  }

  /**
   * Check if a specific theme is active
   */
  isTheme(theme: Theme): boolean {
    return this.currentEffectiveTheme === theme;
  }

  /**
   * Toggle between light and dark themes
   */
  toggle() {
    const newTheme: Theme = this.currentEffectiveTheme === 'light' ? 'dark' : 'light';
    this.setPreference(newTheme);
  }

  private loadPreference() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) as ThemePreference | null;
      if (saved && ['light', 'dark', 'system'].includes(saved)) {
        this.currentPreference = saved;
      } else {
        this.currentPreference = 'system';
      }
    } catch (error) {
      logger.error('Failed to load theme preference from localStorage:', error);
      this.currentPreference = 'system';
    }
  }

  private handleSystemThemeChange = () => {
    if (this.currentPreference === 'system') {
      logger.log('System theme preference changed');
      this.applyTheme();
      this.notifyListeners();
    }
  };

  private applyTheme() {
    const root = document.documentElement;

    // Determine effective theme
    if (this.currentPreference === 'system') {
      this.currentEffectiveTheme = this.mediaQuery.matches ? 'dark' : 'light';
    } else {
      this.currentEffectiveTheme = this.currentPreference;
    }

    logger.log(`Applying theme: ${this.currentEffectiveTheme}`);

    // Set data-theme attribute
    root.setAttribute('data-theme', this.currentEffectiveTheme);

    // Cache meta tags if not already cached
    if (this.metaThemeColor === undefined) {
      this.metaThemeColor = document.querySelector('meta[name="theme-color"]');
    }
    if (this.metaStatusBar === undefined) {
      this.metaStatusBar = document.querySelector(
        'meta[name="apple-mobile-web-app-status-bar-style"]'
      );
    }

    // Update meta theme-color for mobile browsers
    if (this.metaThemeColor) {
      this.metaThemeColor.setAttribute(
        'content',
        this.currentEffectiveTheme === 'dark' ? '#171717' : '#fafafa'
      );
    }

    // Update status bar style for iOS
    if (this.metaStatusBar) {
      this.metaStatusBar.setAttribute(
        'content',
        this.currentEffectiveTheme === 'dark' ? 'black-translucent' : 'default'
      );
    }
  }

  private notifyListeners() {
    const config = this.getConfig();
    const deadRefs: object[] = [];

    this.listenerRefs.forEach((ref) => {
      const listener = this.listeners.get(ref);
      if (listener) {
        try {
          listener(config);
        } catch (error) {
          logger.error('Error in theme change listener:', error);
        }
      } else {
        // Listener was garbage collected
        deadRefs.push(ref);
      }
    });

    // Clean up dead references
    deadRefs.forEach((ref) => {
      this.listenerRefs.delete(ref);
    });
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.mediaQuery.removeEventListener('change', this.handleSystemThemeChange);
    this.listenerRefs.clear();
    this.metaThemeColor = undefined;
    this.metaStatusBar = undefined;
    ThemeManager.instance = undefined;
  }
}

// Export singleton instance getter
export const themeManager = () => ThemeManager.getInstance();

/**
 * Apply theme early to prevent FOUC (Flash of Unstyled Content)
 * This should be called as early as possible in the app initialization
 */
export function applyThemeEarly() {
  try {
    const saved = localStorage.getItem('vibetunnel-theme') as ThemePreference | null;
    const preference = saved && ['light', 'dark', 'system'].includes(saved) ? saved : 'system';

    let effectiveTheme: Theme = 'light';
    if (preference === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else if (preference === 'dark') {
      effectiveTheme = 'dark';
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);
  } catch (error) {
    // Fail silently - theme manager will handle it properly later
    console.error('Failed to apply early theme:', error);
  }
}
