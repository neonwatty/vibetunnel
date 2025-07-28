/**
 * DOM Pool Manager
 *
 * Implements object pooling for DOM elements to reduce GC pressure and improve
 * performance in scenarios with frequent element creation/destruction.
 *
 * Features:
 * - Type-safe pooling for different element types
 * - Automatic cleanup of unused pools
 * - Configurable pool sizes and timeouts
 * - Memory usage tracking
 * - Efficient reuse strategies
 */

import { createLogger } from './logger.js';

const logger = createLogger('dom-pool');

interface PoolConfig {
  maxSize: number;
  cleanupInterval: number;
  elementTimeout: number;
}

interface PooledElement {
  element: HTMLElement;
  createdAt: number;
  lastUsed: number;
  inUse: boolean;
}

interface Pool {
  elements: PooledElement[];
  config: PoolConfig;
  factory: () => HTMLElement;
  cleanup: (element: HTMLElement) => HTMLElement;
  lastCleanup: number;
}

/**
 * DOMPool manages object pools for different types of DOM elements
 */
export class DOMPool {
  private pools = new Map<string, Pool>();
  private cleanupTimer?: number;
  private memoryPressureHandler?: () => void;

  // Default configuration
  private static readonly DEFAULT_CONFIG: PoolConfig = {
    maxSize: 50,
    cleanupInterval: 30000, // 30 seconds
    elementTimeout: 60000, // 1 minute
  };

  // Memory thresholds for aggressive cleanup
  private static readonly MEMORY_PRESSURE_THRESHOLD = 100 * 1024 * 1024; // 100MB

  constructor() {
    this.startPeriodicCleanup();
    this.setupMemoryPressureHandling();
  }

  /**
   * Create a new pool for a specific element type
   */
  createPool(
    type: string,
    factory: () => HTMLElement,
    cleanup: (element: HTMLElement) => HTMLElement = this.defaultCleanup,
    config: Partial<PoolConfig> = {}
  ): void {
    if (this.pools.has(type)) {
      logger.warn(`Pool for type '${type}' already exists`);
      return;
    }

    const finalConfig = { ...DOMPool.DEFAULT_CONFIG, ...config };

    this.pools.set(type, {
      elements: [],
      config: finalConfig,
      factory,
      cleanup,
      lastCleanup: Date.now(),
    });

    logger.debug(`Created pool for type '${type}' with max size ${finalConfig.maxSize}`);
  }

  /**
   * Acquire an element from the pool
   */
  acquire(type: string): HTMLElement | null {
    const pool = this.pools.get(type);
    if (!pool) {
      logger.warn(`No pool found for type '${type}'`);
      return null;
    }

    // Try to find an unused element
    const available = pool.elements.find((pooled) => !pooled.inUse);

    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();

      // Reset element state
      const cleanedElement = pool.cleanup(available.element);
      available.element = cleanedElement;

      logger.debug(
        `Acquired element from pool '${type}' (${this.getPoolStats(type).inUse}/${pool.elements.length} in use)`
      );
      return available.element;
    }

    // Pool is full or no available elements, create new one if under limit
    if (pool.elements.length < pool.config.maxSize) {
      const element = pool.factory();
      const pooled: PooledElement = {
        element,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        inUse: true,
      };

      pool.elements.push(pooled);

      logger.debug(
        `Created new element for pool '${type}' (${pool.elements.length}/${pool.config.maxSize})`
      );
      return element;
    }

    // Pool is at capacity, create temporary element
    logger.debug(`Pool '${type}' at capacity, creating temporary element`);
    return pool.factory();
  }

  /**
   * Release an element back to the pool
   */
  release(type: string, element: HTMLElement): void {
    const pool = this.pools.get(type);
    if (!pool) {
      logger.warn(`No pool found for type '${type}'`);
      return;
    }

    const pooled = pool.elements.find((p) => p.element === element);
    if (!pooled) {
      // Element not from pool (temporary), just cleanup
      pool.cleanup(element);
      return;
    }

    if (!pooled.inUse) {
      logger.warn(`Element already released for pool '${type}'`);
      return;
    }

    pooled.inUse = false;
    pooled.lastUsed = Date.now();

    // Clean up element state
    const cleanedElement = pool.cleanup(element);
    pooled.element = cleanedElement;

    logger.debug(
      `Released element to pool '${type}' (${this.getPoolStats(type).inUse}/${pool.elements.length} in use)`
    );
  }

  /**
   * Get pool statistics
   */
  getPoolStats(type: string): {
    total: number;
    inUse: number;
    available: number;
    memoryUsage: number;
  } {
    const pool = this.pools.get(type);
    if (!pool) {
      return { total: 0, inUse: 0, available: 0, memoryUsage: 0 };
    }

    const inUse = pool.elements.filter((p) => p.inUse).length;
    const total = pool.elements.length;

    return {
      total,
      inUse,
      available: total - inUse,
      memoryUsage: this.estimateMemoryUsage(pool),
    };
  }

  /**
   * Get all pool statistics
   */
  getAllStats(): Record<string, ReturnType<typeof this.getPoolStats>> {
    const stats: Record<string, ReturnType<typeof this.getPoolStats>> = {};

    for (const [type] of this.pools) {
      stats[type] = this.getPoolStats(type);
    }

    return stats;
  }

  /**
   * Force cleanup of a specific pool
   */
  cleanupPool(type: string): void {
    const pool = this.pools.get(type);
    if (!pool) return;

    const now = Date.now();
    const before = pool.elements.length;

    // Remove timed out elements
    pool.elements = pool.elements.filter((pooled) => {
      const isTimedOut = now - pooled.lastUsed > pool.config.elementTimeout;
      const shouldRemove = !pooled.inUse && isTimedOut;

      if (shouldRemove) {
        pool.cleanup(pooled.element);
      }

      return !shouldRemove;
    });

    const removed = before - pool.elements.length;
    pool.lastCleanup = now;

    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} elements from pool '${type}'`);
    }
  }

  /**
   * Cleanup all pools
   */
  cleanupAllPools(): void {
    for (const [type] of this.pools) {
      this.cleanupPool(type);
    }
  }

  /**
   * Destroy a pool and cleanup all elements
   */
  destroyPool(type: string): void {
    const pool = this.pools.get(type);
    if (!pool) return;

    // Cleanup all elements
    pool.elements.forEach((pooled) => {
      pool.cleanup(pooled.element);
    });

    this.pools.delete(type);
    logger.debug(`Destroyed pool '${type}'`);
  }

  /**
   * Destroy all pools and cleanup
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    if (this.memoryPressureHandler) {
      // Remove memory pressure handler if supported
      const memory = (
        performance as unknown as {
          memory?: { addEventListener?: (event: string, handler: () => void) => void };
        }
      ).memory;
      if (memory && 'addEventListener' in memory) {
        // Browser-specific memory pressure handling
      }
    }

    // Destroy all pools
    for (const [type] of this.pools) {
      this.destroyPool(type);
    }

    logger.debug('DOM pool disposed');
  }

  // Private methods

  private defaultCleanup(element: HTMLElement): HTMLElement {
    // Reset common properties efficiently
    element.className = '';
    element.style.cssText = '';
    element.innerHTML = '';
    element.removeAttribute('data-group-id');
    element.removeAttribute('style');

    // Clear any data attributes
    const dataAttributes = Array.from(element.attributes).filter((attr) =>
      attr.name.startsWith('data-')
    );
    dataAttributes.forEach((attr) => element.removeAttribute(attr.name));

    // Remove any event listeners by replacing with clean clone
    const clone = element.cloneNode(false) as HTMLElement;

    // Only replace in DOM if element has a parent (avoid memory leaks)
    if (element.parentNode) {
      element.parentNode.replaceChild(clone, element);
      return clone;
    }

    return element;
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = window.setInterval(() => {
      this.cleanupAllPools();
    }, DOMPool.DEFAULT_CONFIG.cleanupInterval);
  }

  private setupMemoryPressureHandling(): void {
    // Aggressive cleanup on memory pressure
    this.memoryPressureHandler = () => {
      logger.debug('Memory pressure detected, performing aggressive cleanup');

      // Reduce pool sizes temporarily
      for (const [type, pool] of this.pools) {
        const stats = this.getPoolStats(type);
        if (stats.available > 5) {
          // Keep only essential elements
          const now = Date.now();
          pool.elements = pool.elements.filter((pooled) => {
            if (pooled.inUse) return true;

            const isRecent = now - pooled.lastUsed < 5000; // 5 seconds
            if (!isRecent) {
              pool.cleanup(pooled.element);
              return false;
            }

            return true;
          });
        }
      }
    };

    // Monitor memory usage if available
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
        if (memory?.usedJSHeapSize && memory.usedJSHeapSize > DOMPool.MEMORY_PRESSURE_THRESHOLD) {
          this.memoryPressureHandler?.();
        }
      }, 10000); // Check every 10 seconds
    }
  }

  private estimateMemoryUsage(pool: Pool): number {
    // Rough estimation of memory usage
    return pool.elements.length * 1024; // Assume ~1KB per element
  }
}

// Singleton instance
export const domPool = new DOMPool();

// Setup default pools for common chat components
domPool.createPool(
  'chat-bubble',
  () => {
    const element = document.createElement('div');
    element.className = 'chat-bubble-container';
    return element;
  },
  (element) => {
    element.className = 'chat-bubble-container';
    element.innerHTML = '';
    element.removeAttribute('data-message-id');
    element.removeAttribute('data-group-id');
    return element;
  },
  { maxSize: 30 }
);

domPool.createPool(
  'message-group',
  () => {
    const element = document.createElement('div');
    element.className = 'message-group';
    return element;
  },
  (element) => {
    element.className = 'message-group';
    element.innerHTML = '';
    element.removeAttribute('data-group-id');
    return element;
  },
  { maxSize: 20 }
);

domPool.createPool(
  'code-block',
  () => {
    const element = document.createElement('div');
    element.className = 'code-block';
    return element;
  },
  (element) => {
    element.className = 'code-block';
    element.innerHTML = '';
    element.removeAttribute('data-language');
    return element;
  },
  { maxSize: 15 }
);
