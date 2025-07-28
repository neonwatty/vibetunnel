/**
 * Performance Monitor
 *
 * Monitors and tracks performance metrics for the chat view components.
 * Provides real-time insights into rendering performance, memory usage,
 * and user experience metrics.
 */

import { createLogger } from './logger.js';

const logger = createLogger('performance-monitor');

interface PerformanceSnapshot {
  timestamp: number;
  fps: number;
  memoryUsage: number;
  domNodes: number;
  renderTime: number;
  scrollPerformance: number;
  messageCount: number;
}

interface PerformanceThresholds {
  minFPS: number;
  maxMemoryUsage: number;
  maxRenderTime: number;
  maxDOMNodes: number;
}

interface PerformanceAlert {
  type: 'fps' | 'memory' | 'render' | 'dom';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

/**
 * PerformanceMonitor tracks real-time performance metrics for mobile chat view
 */
export class PerformanceMonitor {
  private isMonitoring = false;
  private snapshots: PerformanceSnapshot[] = [];
  private alerts: PerformanceAlert[] = [];
  private observers: PerformanceObserver[] = [];
  private animationFrameId?: number;
  private lastFrameTime = 0;
  private frameCount = 0;
  private currentFPS = 60;
  private cachedDOMNodeCount = 0;
  private lastDOMCountUpdate = 0;
  private domCountUpdateInterval = 5000; // Update DOM count every 5 seconds

  private thresholds: PerformanceThresholds = {
    minFPS: 50, // Target 50+ FPS on mobile
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    maxRenderTime: 16, // 16ms for 60fps
    maxDOMNodes: 5000, // Maximum DOM nodes
  };

  private callbacks: {
    onAlert?: (alert: PerformanceAlert) => void;
    onSnapshot?: (snapshot: PerformanceSnapshot) => void;
  } = {};

  /**
   * Start performance monitoring
   */
  start(callbacks?: {
    onAlert?: (alert: PerformanceAlert) => void;
    onSnapshot?: (snapshot: PerformanceSnapshot) => void;
  }) {
    if (this.isMonitoring) {
      logger.warn('Performance monitoring already started');
      return;
    }

    this.callbacks = callbacks || {};
    this.isMonitoring = true;
    this.frameCount = 0;
    this.lastFrameTime = performance.now();

    logger.log('Starting performance monitoring');

    // Start FPS monitoring
    this.startFPSMonitoring();

    // Setup performance observers
    this.setupPerformanceObservers();

    // Start periodic snapshots
    this.startSnapshotCollection();
  }

  /**
   * Stop performance monitoring
   */
  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    // Disconnect observers
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];

    logger.log('Stopped performance monitoring');
  }

  /**
   * Get current performance snapshot
   */
  getCurrentSnapshot(): PerformanceSnapshot {
    return {
      timestamp: Date.now(),
      fps: this.currentFPS,
      memoryUsage: this.getMemoryUsage(),
      domNodes: this.getDOMNodeCount(),
      renderTime: this.getAverageRenderTime(),
      scrollPerformance: this.getScrollPerformance(),
      messageCount: this.getMessageCount(),
    };
  }

  /**
   * Get performance history
   */
  getSnapshots(limit = 100): PerformanceSnapshot[] {
    return this.snapshots.slice(-limit);
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit = 50): PerformanceAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get performance summary
   */
  getSummary() {
    if (this.snapshots.length === 0) {
      return null;
    }

    const recent = this.snapshots.slice(-10); // Last 10 snapshots

    const avgFPS = recent.reduce((sum, s) => sum + s.fps, 0) / recent.length;
    const avgMemory = recent.reduce((sum, s) => sum + s.memoryUsage, 0) / recent.length;
    const avgRenderTime = recent.reduce((sum, s) => sum + s.renderTime, 0) / recent.length;
    const maxDOMNodes = Math.max(...recent.map((s) => s.domNodes));

    return {
      averageFPS: Math.round(avgFPS),
      averageMemoryUsage: Math.round(avgMemory / 1024 / 1024), // MB
      averageRenderTime: Math.round(avgRenderTime * 100) / 100, // ms
      maxDOMNodes,
      alertCount: this.alerts.filter((a) => Date.now() - a.timestamp < 60000).length, // Last minute
      isPerformant:
        avgFPS >= this.thresholds.minFPS &&
        avgMemory <= this.thresholds.maxMemoryUsage &&
        avgRenderTime <= this.thresholds.maxRenderTime,
    };
  }

  /**
   * Update performance thresholds
   */
  updateThresholds(thresholds: Partial<PerformanceThresholds>) {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.debug('Updated performance thresholds:', this.thresholds);
  }

  // Private methods

  private startFPSMonitoring() {
    const measureFPS = () => {
      if (!this.isMonitoring) return;

      const now = performance.now();
      this.frameCount++;

      // Calculate FPS every second
      if (now - this.lastFrameTime >= 1000) {
        this.currentFPS = Math.round((this.frameCount * 1000) / (now - this.lastFrameTime));
        this.frameCount = 0;
        this.lastFrameTime = now;

        // Check FPS threshold
        if (this.currentFPS < this.thresholds.minFPS) {
          this.addAlert({
            type: 'fps',
            severity: this.currentFPS < this.thresholds.minFPS * 0.8 ? 'critical' : 'warning',
            message: `Low FPS detected: ${this.currentFPS}`,
            value: this.currentFPS,
            threshold: this.thresholds.minFPS,
            timestamp: Date.now(),
          });
        }
      }

      this.animationFrameId = requestAnimationFrame(measureFPS);
    };

    this.animationFrameId = requestAnimationFrame(measureFPS);
  }

  private setupPerformanceObservers() {
    // Long task observer for render time monitoring
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const duration = entry.duration;

            if (duration > this.thresholds.maxRenderTime) {
              this.addAlert({
                type: 'render',
                severity: duration > this.thresholds.maxRenderTime * 2 ? 'critical' : 'warning',
                message: `Long render task: ${Math.round(duration)}ms`,
                value: duration,
                threshold: this.thresholds.maxRenderTime,
                timestamp: Date.now(),
              });
            }
          }
        });

        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch {
        logger.warn('Long task observer not supported');
      }

      // Memory usage observer (experimental)
      try {
        const memoryObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'measure') {
              // Custom memory measurements
            }
          }
        });

        memoryObserver.observe({ entryTypes: ['measure'] });
        this.observers.push(memoryObserver);
      } catch {
        logger.warn('Memory observer not supported');
      }
    }
  }

  private startSnapshotCollection() {
    const collectSnapshot = () => {
      if (!this.isMonitoring) return;

      const snapshot = this.getCurrentSnapshot();
      this.snapshots.push(snapshot);

      // Limit snapshot history
      if (this.snapshots.length > 1000) {
        this.snapshots = this.snapshots.slice(-500);
      }

      // Check thresholds
      this.checkThresholds(snapshot);

      // Notify callback
      if (this.callbacks.onSnapshot) {
        this.callbacks.onSnapshot(snapshot);
      }

      // Schedule next snapshot
      setTimeout(collectSnapshot, 5000); // Every 5 seconds
    };

    // Start after a delay
    setTimeout(collectSnapshot, 1000);
  }

  private checkThresholds(snapshot: PerformanceSnapshot) {
    // Memory usage check
    if (snapshot.memoryUsage > this.thresholds.maxMemoryUsage) {
      this.addAlert({
        type: 'memory',
        severity:
          snapshot.memoryUsage > this.thresholds.maxMemoryUsage * 1.5 ? 'critical' : 'warning',
        message: `High memory usage: ${Math.round(snapshot.memoryUsage / 1024 / 1024)}MB`,
        value: snapshot.memoryUsage,
        threshold: this.thresholds.maxMemoryUsage,
        timestamp: Date.now(),
      });
    }

    // DOM node count check
    if (snapshot.domNodes > this.thresholds.maxDOMNodes) {
      this.addAlert({
        type: 'dom',
        severity: snapshot.domNodes > this.thresholds.maxDOMNodes * 1.5 ? 'critical' : 'warning',
        message: `High DOM node count: ${snapshot.domNodes}`,
        value: snapshot.domNodes,
        threshold: this.thresholds.maxDOMNodes,
        timestamp: Date.now(),
      });
    }
  }

  private addAlert(alert: PerformanceAlert) {
    this.alerts.push(alert);

    // Limit alert history
    if (this.alerts.length > 500) {
      this.alerts = this.alerts.slice(-250);
    }

    // Log alert
    const level = alert.severity === 'critical' ? 'error' : 'warn';
    logger[level](`Performance alert: ${alert.message}`);

    // Notify callback
    if (this.callbacks.onAlert) {
      this.callbacks.onAlert(alert);
    }
  }

  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
      return memory?.usedJSHeapSize || 0;
    }
    return 0;
  }

  private getDOMNodeCount(): number {
    const now = Date.now();

    // Only update DOM count every 5 seconds to reduce overhead
    if (now - this.lastDOMCountUpdate > this.domCountUpdateInterval) {
      this.cachedDOMNodeCount = document.querySelectorAll('*').length;
      this.lastDOMCountUpdate = now;
    }

    return this.cachedDOMNodeCount;
  }

  private getAverageRenderTime(): number {
    // Simplified - would need more sophisticated measurement
    return 8; // Placeholder
  }

  private getScrollPerformance(): number {
    // Simplified - would measure scroll jank
    return 60; // Placeholder
  }

  private getMessageCount(): number {
    const chatView = document.querySelector('chat-view');
    if (chatView) {
      return chatView.querySelectorAll('chat-bubble, optimized-chat-bubble').length;
    }
    return 0;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Auto-start monitoring in development mode
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
  performanceMonitor.start({
    onAlert: (alert) => {
      if (alert.severity === 'critical') {
        console.warn('🚨 Performance Alert:', alert.message);
      }
    },
  });
}
