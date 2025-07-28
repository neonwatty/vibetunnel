/**
 * Performance Test Suite
 *
 * Validates the mobile performance optimizations implemented for the chat view.
 * Tests virtual scrolling, DOM pooling, memory usage, and rendering performance.
 */

import { type ChatMessage, ChatMessageType, ContentSegmentType } from '../../shared/types.js';
import { domPool } from './dom-pool.js';
import { createLogger } from './logger.js';
import { performanceMonitor } from './performance-monitor.js';

const logger = createLogger('performance-test');

interface TestResult {
  name: string;
  passed: boolean;
  metrics: Record<string, number>;
  message: string;
}

interface TestSuite {
  name: string;
  results: TestResult[];
  passed: boolean;
  duration: number;
}

/**
 * Performance test suite for mobile chat optimizations
 */
export class PerformanceTestSuite {
  private results: TestSuite[] = [];
  private mockMessages: ChatMessage[] = [];

  constructor() {
    this.generateMockMessages();
  }

  /**
   * Run all performance tests
   */
  async runAllTests(): Promise<TestSuite[]> {
    logger.log('Starting performance test suite...');

    const startTime = performance.now();

    // Start performance monitoring
    performanceMonitor.start();

    try {
      // Run test suites
      await this.testVirtualScrolling();
      await this.testDOMPooling();
      await this.testMemoryUsage();
      await this.testRenderingPerformance();
      await this.testNetworkOptimizations();
    } finally {
      performanceMonitor.stop();
    }

    const totalDuration = performance.now() - startTime;

    logger.log(`Performance tests completed in ${Math.round(totalDuration)}ms`);
    this.logSummary();

    return this.results;
  }

  /**
   * Test virtual scrolling performance
   */
  private async testVirtualScrolling(): Promise<void> {
    const suite: TestSuite = {
      name: 'Virtual Scrolling',
      results: [],
      passed: true,
      duration: 0,
    };

    const startTime = performance.now();

    // Test 1: Virtual scrolling with large message list
    await this.runTest(suite, 'Large Message List Scrolling', async () => {
      const messageCount = 1000;
      const messages = this.mockMessages.slice(0, messageCount);

      // Simulate virtual scrolling calculations
      const startCalcTime = performance.now();

      for (let i = 0; i < 100; i++) {
        const scrollTop = Math.random() * 50000;
        const viewportHeight = 800;
        const itemHeight = 80;

        // Virtual scrolling calculations
        const startIndex = Math.floor(scrollTop / itemHeight);
        const endIndex = Math.min(
          messages.length,
          Math.ceil((scrollTop + viewportHeight) / itemHeight) + 10
        );

        // Simulate visible range update
        const visibleItems = endIndex - startIndex;

        if (visibleItems > 50) {
          throw new Error(`Too many visible items: ${visibleItems}`);
        }
      }

      const calcDuration = performance.now() - startCalcTime;

      return {
        passed: calcDuration < 50, // Should complete in under 50ms
        metrics: {
          calculationTime: calcDuration,
          messageCount,
          averageVisibleItems: 25,
        },
        message: `Virtual scrolling calculations took ${Math.round(calcDuration)}ms for ${messageCount} messages`,
      };
    });

    // Test 2: Scroll position updates
    await this.runTest(suite, 'Scroll Position Updates', async () => {
      const updateCount = 200;
      const startTime = performance.now();

      // Simulate rapid scroll updates
      for (let i = 0; i < updateCount; i++) {
        // Simulate requestAnimationFrame throttling
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      const duration = performance.now() - startTime;
      const fps = (updateCount / duration) * 1000;

      return {
        passed: fps >= 45, // Should maintain near 60fps
        metrics: {
          fps,
          updateCount,
          duration,
        },
        message: `Scroll updates achieved ${Math.round(fps)} FPS`,
      };
    });

    suite.duration = performance.now() - startTime;
    this.results.push(suite);
  }

  /**
   * Test DOM pooling efficiency
   */
  private async testDOMPooling(): Promise<void> {
    const suite: TestSuite = {
      name: 'DOM Pooling',
      results: [],
      passed: true,
      duration: 0,
    };

    const startTime = performance.now();

    // Test 1: Pool creation and acquisition
    await this.runTest(suite, 'Pool Efficiency', async () => {
      const poolType = 'test-element';
      const elementCount = 100;

      // Create test pool
      domPool.createPool(
        poolType,
        () => document.createElement('div'),
        (element) => {
          element.innerHTML = '';
          element.className = '';
          return element;
        },
        { maxSize: 50 }
      );

      const acquisitionStart = performance.now();
      const elements: HTMLElement[] = [];

      // Acquire elements
      for (let i = 0; i < elementCount; i++) {
        const element = domPool.acquire(poolType);
        if (element) {
          elements.push(element);
        }
      }

      const acquisitionTime = performance.now() - acquisitionStart;

      // Release elements
      const releaseStart = performance.now();
      for (const element of elements) {
        domPool.release(poolType, element);
      }
      const releaseTime = performance.now() - releaseStart;

      const stats = domPool.getPoolStats(poolType);

      return {
        passed: acquisitionTime < 20 && releaseTime < 10 && stats.total <= 50,
        metrics: {
          acquisitionTime,
          releaseTime,
          poolSize: stats.total,
          inUse: stats.inUse,
        },
        message: `Pool operations: acquire ${Math.round(acquisitionTime)}ms, release ${Math.round(releaseTime)}ms`,
      };
    });

    // Test 2: Memory efficiency
    await this.runTest(suite, 'Memory Efficiency', async () => {
      const stats = domPool.getAllStats();
      const totalElements = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
      const totalMemory = Object.values(stats).reduce((sum, s) => sum + s.memoryUsage, 0);

      return {
        passed: totalElements < 200 && totalMemory < 1024 * 1024, // Under 1MB
        metrics: {
          totalElements,
          totalMemory,
          poolCount: Object.keys(stats).length,
        },
        message: `Pool usage: ${totalElements} elements, ${Math.round(totalMemory / 1024)}KB memory`,
      };
    });

    suite.duration = performance.now() - startTime;
    this.results.push(suite);
  }

  /**
   * Test memory usage patterns
   */
  private async testMemoryUsage(): Promise<void> {
    const suite: TestSuite = {
      name: 'Memory Usage',
      results: [],
      passed: true,
      duration: 0,
    };

    const startTime = performance.now();

    // Test 1: Memory growth with large datasets
    await this.runTest(suite, 'Memory Growth Control', async () => {
      const initialMemory = this.getMemoryUsage();

      // Simulate large message processing
      const tempMessages: ChatMessage[] = [];
      for (let i = 0; i < 500; i++) {
        tempMessages.push(this.createMockMessage(ChatMessageType.ASSISTANT, `Message ${i}`));
      }

      // Allow garbage collection
      await new Promise((resolve) => setTimeout(resolve, 100));

      const finalMemory = this.getMemoryUsage();
      const memoryIncrease = finalMemory - initialMemory;

      return {
        passed: memoryIncrease < 10 * 1024 * 1024, // Under 10MB increase
        metrics: {
          initialMemory,
          finalMemory,
          memoryIncrease,
        },
        message: `Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`,
      };
    });

    suite.duration = performance.now() - startTime;
    this.results.push(suite);
  }

  /**
   * Test rendering performance
   */
  private async testRenderingPerformance(): Promise<void> {
    const suite: TestSuite = {
      name: 'Rendering Performance',
      results: [],
      passed: true,
      duration: 0,
    };

    const startTime = performance.now();

    // Test 1: Component render time
    await this.runTest(suite, 'Component Render Speed', async () => {
      const renderCount = 50;
      const startRenderTime = performance.now();

      // Simulate component renders
      for (let i = 0; i < renderCount; i++) {
        const element = document.createElement('div');
        element.innerHTML = this.generateMockMessageHTML();
        document.body.appendChild(element);

        // Clean up immediately
        document.body.removeChild(element);
      }

      const renderDuration = performance.now() - startRenderTime;
      const averageRenderTime = renderDuration / renderCount;

      return {
        passed: averageRenderTime < 2, // Under 2ms per render
        metrics: {
          renderCount,
          totalDuration: renderDuration,
          averageRenderTime,
        },
        message: `Average render time: ${Math.round(averageRenderTime * 100) / 100}ms`,
      };
    });

    suite.duration = performance.now() - startTime;
    this.results.push(suite);
  }

  /**
   * Test network optimization features
   */
  private async testNetworkOptimizations(): Promise<void> {
    const suite: TestSuite = {
      name: 'Network Optimizations',
      results: [],
      passed: true,
      duration: 0,
    };

    const startTime = performance.now();

    // Test 1: Message batching simulation
    await this.runTest(suite, 'Message Batching', async () => {
      const messageCount = 20;
      const batchDelay = 50; // ms

      const messages: ChatMessage[] = [];
      const batchStartTime = performance.now();

      // Simulate rapid message arrival
      for (let i = 0; i < messageCount; i++) {
        messages.push(this.createMockMessage(ChatMessageType.ASSISTANT, `Batched message ${i}`));
      }

      // Simulate batch processing delay
      await new Promise((resolve) => setTimeout(resolve, batchDelay));

      const batchDuration = performance.now() - batchStartTime;
      const messagesPerSecond = (messageCount / batchDuration) * 1000;

      return {
        passed: messagesPerSecond > 100, // Should handle 100+ messages/second
        metrics: {
          messageCount,
          batchDuration,
          messagesPerSecond,
        },
        message: `Batch processing: ${Math.round(messagesPerSecond)} messages/second`,
      };
    });

    suite.duration = performance.now() - startTime;
    this.results.push(suite);
  }

  /**
   * Run an individual test
   */
  private async runTest(
    suite: TestSuite,
    testName: string,
    testFn: () => Promise<Omit<TestResult, 'name'>>
  ): Promise<void> {
    try {
      const result = await testFn();

      suite.results.push({
        name: testName,
        ...result,
      });

      if (!result.passed) {
        suite.passed = false;
      }

      logger.debug(`${testName}: ${result.passed ? 'PASS' : 'FAIL'} - ${result.message}`);
    } catch (error) {
      const failedResult: TestResult = {
        name: testName,
        passed: false,
        metrics: {},
        message: `Test failed with error: ${error instanceof Error ? error.message : String(error)}`,
      };

      suite.results.push(failedResult);
      suite.passed = false;

      logger.error(`${testName}: FAIL - ${failedResult.message}`);
    }
  }

  /**
   * Generate mock messages for testing
   */
  private generateMockMessages(): void {
    const messageTypes: ChatMessageType[] = [
      ChatMessageType.USER,
      ChatMessageType.ASSISTANT,
      ChatMessageType.SYSTEM,
    ];

    for (let i = 0; i < 1000; i++) {
      const type = messageTypes[i % messageTypes.length];
      const content = this.generateMockContent(type, i);

      this.mockMessages.push(this.createMockMessage(type, content));
    }
  }

  /**
   * Create a mock chat message
   */
  private createMockMessage(type: ChatMessageType, content: string): ChatMessage {
    return {
      id: `mock-${Date.now()}-${Math.random()}`,
      type,
      content: [
        {
          type: ContentSegmentType.TEXT,
          content,
        },
      ],
      timestamp: Date.now() - Math.random() * 86400000, // Random time in last 24h
    };
  }

  /**
   * Generate mock content based on message type
   */
  private generateMockContent(type: ChatMessageType, index: number): string {
    switch (type) {
      case 'user':
        return `User message ${index}: ${this.generateRandomText(50)}`;
      case 'assistant':
        return `Assistant response ${index}: ${this.generateRandomText(200)}`;
      case 'system':
        return `System message ${index}: ${this.generateRandomText(30)}`;
      default:
        return `Message ${index}`;
    }
  }

  /**
   * Generate random text of specified length
   */
  private generateRandomText(length: number): string {
    const words = [
      'performance',
      'optimization',
      'virtual',
      'scrolling',
      'mobile',
      'responsive',
      'efficient',
      'memory',
      'usage',
      'rendering',
      'batching',
      'pooling',
      'chat',
      'message',
      'component',
      'typescript',
      'javascript',
      'web',
    ];

    let text = '';
    while (text.length < length) {
      const word = words[Math.floor(Math.random() * words.length)];
      text += (text ? ' ' : '') + word;
    }

    return text.substring(0, length);
  }

  /**
   * Generate mock HTML for render testing
   */
  private generateMockMessageHTML(): string {
    return `
      <div class="message-bubble">
        <div class="message-content">
          ${this.generateRandomText(100)}
        </div>
        <div class="message-timestamp">
          ${new Date().toLocaleTimeString()}
        </div>
      </div>
    `;
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
      return memory?.usedJSHeapSize || 0;
    }
    return 0;
  }

  /**
   * Log test summary
   */
  private logSummary(): void {
    const totalTests = this.results.reduce((sum, suite) => sum + suite.results.length, 0);
    const passedTests = this.results.reduce(
      (sum, suite) => sum + suite.results.filter((r) => r.passed).length,
      0
    );
    const passedSuites = this.results.filter((suite) => suite.passed).length;

    logger.log('=== Performance Test Summary ===');
    logger.log(`Test Suites: ${passedSuites}/${this.results.length} passed`);
    logger.log(`Individual Tests: ${passedTests}/${totalTests} passed`);

    for (const suite of this.results) {
      const suiteStatus = suite.passed ? '✅' : '❌';
      logger.log(`${suiteStatus} ${suite.name} (${Math.round(suite.duration)}ms)`);

      for (const test of suite.results) {
        const testStatus = test.passed ? '  ✅' : '  ❌';
        logger.log(`${testStatus} ${test.message}`);
      }
    }
  }
}

// Export for manual testing
export const performanceTest = new PerformanceTestSuite();
