/**
 * Touch Gesture Detector
 *
 * Handles touch gesture detection for view switching with proper
 * velocity and distance thresholds, conflict prevention, and smooth animations.
 */

export interface SwipeGestureConfig {
  minDistance: number; // Minimum distance to register a swipe (px)
  minVelocity: number; // Minimum velocity to register a swipe (px/ms)
  maxVerticalDeviation: number; // Maximum vertical movement allowed for horizontal swipe (px)
  timeoutMs: number; // Maximum time for gesture completion (ms)
  previewThreshold: number; // Distance to start showing preview (px)
}

export interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface SwipeGestureResult {
  direction: 'left' | 'right' | null;
  distance: number;
  velocity: number;
  duration: number;
  progress: number; // 0-1 for preview purposes
}

export type GestureCallback = (result: SwipeGestureResult) => void;

export class GestureDetector {
  private config: SwipeGestureConfig;
  private startTouch: TouchPoint | null = null;
  private currentTouch: TouchPoint | null = null;
  private isTracking = false;
  private element: HTMLElement;
  private onGesture: GestureCallback;
  private onPreview: GestureCallback;
  private onGestureEnd: () => void;

  // Store bound functions to prevent memory leaks
  private boundHandleTouchStart: (event: TouchEvent) => void;
  private boundHandleTouchMove: (event: TouchEvent) => void;
  private boundHandleTouchEnd: (event: TouchEvent) => void;
  private boundHandleTouchCancel: (event: TouchEvent) => void;

  // Default configuration optimized for mobile view switching
  private static readonly DEFAULT_CONFIG: SwipeGestureConfig = {
    minDistance: 30, // 30px minimum swipe distance
    minVelocity: 0.3, // 0.3px/ms minimum velocity
    maxVerticalDeviation: 50, // Allow 50px vertical movement
    timeoutMs: 800, // 800ms max gesture time
    previewThreshold: 15, // Start preview at 15px
  };

  constructor(
    element: HTMLElement,
    onGesture: GestureCallback,
    onPreview: GestureCallback,
    onGestureEnd: () => void,
    config?: Partial<SwipeGestureConfig>
  ) {
    this.element = element;
    this.onGesture = onGesture;
    this.onPreview = onPreview;
    this.onGestureEnd = onGestureEnd;
    this.config = { ...GestureDetector.DEFAULT_CONFIG, ...config };

    // Bind event handlers once to prevent memory leaks
    this.boundHandleTouchStart = this.handleTouchStart.bind(this);
    this.boundHandleTouchMove = this.handleTouchMove.bind(this);
    this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
    this.boundHandleTouchCancel = this.handleTouchCancel.bind(this);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Use passive listeners where possible for better performance
    this.element.addEventListener('touchstart', this.boundHandleTouchStart, {
      passive: false,
    });
    this.element.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
    this.element.addEventListener('touchend', this.boundHandleTouchEnd, { passive: true });
    this.element.addEventListener('touchcancel', this.boundHandleTouchCancel, {
      passive: true,
    });
  }

  private handleTouchStart(event: TouchEvent): void {
    try {
      // Only handle single-finger gestures
      if (event.touches.length !== 1) {
        this.resetGesture();
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        this.resetGesture();
        return;
      }

      this.startTouch = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: performance.now(),
      };
      this.currentTouch = { ...this.startTouch };
      this.isTracking = true;
    } catch (error) {
      console.warn('GestureDetector: Error in handleTouchStart:', error);
      this.resetGesture();
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    try {
      if (!this.isTracking || !this.startTouch || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        this.resetGesture();
        return;
      }

      this.currentTouch = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: performance.now(),
      };

      const result = this.calculateGestureResult();

      // Check if gesture is valid (horizontal movement)
      if (this.isValidHorizontalGesture(result)) {
        // Prevent default behavior for valid gestures to avoid scrolling
        event.preventDefault();

        // Show preview if past threshold
        if (Math.abs(result.distance) >= this.config.previewThreshold) {
          this.onPreview(result);
        }
      } else if (Math.abs(result.distance) > this.config.maxVerticalDeviation) {
        // Cancel gesture if too much vertical movement
        this.resetGesture();
      }
    } catch (error) {
      console.warn('GestureDetector: Error in handleTouchMove:', error);
      this.resetGesture();
    }
  }

  private handleTouchEnd(_event: TouchEvent): void {
    try {
      if (!this.isTracking || !this.startTouch || !this.currentTouch) {
        this.resetGesture();
        return;
      }

      const result = this.calculateGestureResult();

      // Check if gesture meets all criteria
      if (this.isValidSwipeGesture(result)) {
        this.onGesture(result);
      }

      this.onGestureEnd();
      this.resetGesture();
    } catch (error) {
      console.warn('GestureDetector: Error in handleTouchEnd:', error);
      this.resetGesture();
    }
  }

  private handleTouchCancel(_event: TouchEvent): void {
    try {
      this.onGestureEnd();
      this.resetGesture();
    } catch (error) {
      console.warn('GestureDetector: Error in handleTouchCancel:', error);
      this.resetGesture();
    }
  }

  private calculateGestureResult(): SwipeGestureResult {
    if (!this.startTouch || !this.currentTouch) {
      return {
        direction: null,
        distance: 0,
        velocity: 0,
        duration: 0,
        progress: 0,
      };
    }

    const deltaX = this.currentTouch.x - this.startTouch.x;
    const duration = this.currentTouch.timestamp - this.startTouch.timestamp;
    const distance = Math.abs(deltaX);
    const velocity = duration > 0 ? distance / duration : 0;

    // Calculate progress (0-1) for preview animations
    const maxDistance = this.element.offsetWidth * 0.3; // 30% of element width
    const progress = Math.min(distance / maxDistance, 1);

    return {
      direction: deltaX > 0 ? 'right' : 'left',
      distance: Math.abs(deltaX),
      velocity,
      duration,
      progress,
    };
  }

  private isValidHorizontalGesture(_result: SwipeGestureResult): boolean {
    if (!this.startTouch || !this.currentTouch) return false;

    const deltaY = Math.abs(this.currentTouch.y - this.startTouch.y);
    const deltaX = Math.abs(this.currentTouch.x - this.startTouch.x);

    // Add minimum movement threshold to prevent accidental gestures
    const minMovementThreshold = 5; // 5px minimum movement
    if (deltaX < minMovementThreshold) return false;

    // Horizontal movement should be dominant
    return deltaX > deltaY && deltaY <= this.config.maxVerticalDeviation;
  }

  private isValidSwipeGesture(result: SwipeGestureResult): boolean {
    if (!this.startTouch || !this.currentTouch) return false;

    const deltaY = Math.abs(this.currentTouch.y - this.startTouch.y);

    return (
      result.distance >= this.config.minDistance &&
      result.velocity >= this.config.minVelocity &&
      result.duration <= this.config.timeoutMs &&
      deltaY <= this.config.maxVerticalDeviation
    );
  }

  private resetGesture(): void {
    this.startTouch = null;
    this.currentTouch = null;
    this.isTracking = false;
  }

  public destroy(): void {
    // Use the same bound function references for cleanup
    this.element.removeEventListener('touchstart', this.boundHandleTouchStart);
    this.element.removeEventListener('touchmove', this.boundHandleTouchMove);
    this.element.removeEventListener('touchend', this.boundHandleTouchEnd);
    this.element.removeEventListener('touchcancel', this.boundHandleTouchCancel);
    this.resetGesture();
  }

  public updateConfig(config: Partial<SwipeGestureConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public isCurrentlyTracking(): boolean {
    return this.isTracking;
  }
}
